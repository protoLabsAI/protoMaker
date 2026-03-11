/**
 * CRDTStore — Automerge-backed document store organized by domain.
 *
 * Responsibilities:
 * - Manages Automerge documents grouped by domain name (features, projects, config)
 * - Persists documents via NodeFSStorageAdapter to storageDir
 * - Syncs with Tailscale peers via WebSocketClientAdapter
 * - Runs schema-on-read normalizers on document load
 * - Performs one-time filesystem hydration on first startup
 * - Runs periodic compaction checkpoints to limit history growth
 * - Includes instanceId + timestamp on every mutation for attribution
 */

import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import {
  Repo,
  parseAutomergeUrl,
  type AutomergeUrl,
  type DocHandle,
  type NetworkAdapterInterface,
} from '@automerge/automerge-repo';
import { NodeFSStorageAdapter } from '@automerge/automerge-repo-storage-nodefs';
import * as Automerge from '@automerge/automerge';
import { createSyncClientAdapter, WebSocketServerAdapter } from './sync-adapter.js';
import { normalizeDocument } from './documents.js';
import type {
  CRDTDocumentRoot,
  CRDTStoreConfig,
  ChangeCallback,
  DomainName,
  HydrationFn,
  HydrationContext,
  RegistryMap,
  Unsubscribe,
} from './types.js';

const REGISTRY_FILENAME = 'registry.json';
const HYDRATION_MARKER = '.hydrated';
const DEFAULT_COMPACT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export class CRDTStore extends EventEmitter {
  private readonly config: CRDTStoreConfig;
  private repo!: Repo;
  private registry: RegistryMap = {};
  private registryPath: string;
  private handles = new Map<string, DocHandle<CRDTDocumentRoot>>();
  private networkAdapters: NetworkAdapterInterface[] = [];
  private compactTimer: ReturnType<typeof setInterval> | null = null;
  private initialized = false;

  constructor(config: CRDTStoreConfig) {
    super();
    this.config = config;
    this.registryPath = path.join(config.storageDir, REGISTRY_FILENAME);
  }

  /**
   * Initialize the store: set up storage, network adapters, load registry,
   * and optionally run one-time hydration from filesystem.
   */
  async init(hydrationFn?: HydrationFn): Promise<void> {
    if (this.initialized) return;

    fs.mkdirSync(this.config.storageDir, { recursive: true });

    const networkAdapters: NetworkAdapterInterface[] = [];

    // Add client adapters for each configured Tailscale peer
    if (this.config.peers) {
      for (const peer of this.config.peers) {
        const adapter = createSyncClientAdapter(peer.url) as unknown as NetworkAdapterInterface;
        networkAdapters.push(adapter);
        this.networkAdapters.push(adapter);
      }
    }

    this.repo = new Repo({
      network: networkAdapters,
      storage: new NodeFSStorageAdapter(this.config.storageDir),
      peerId: this.config.instanceId as import('@automerge/automerge-repo').PeerId,
      sharePolicy: async () => true,
    });

    this.loadRegistry();

    const isFirstStart = this.isStorageEmpty();

    // Mark initialized before hydration so store methods are available inside hydrationFn
    this.initialized = true;

    if (isFirstStart && hydrationFn) {
      const ctx = this.buildHydrationContext();
      await hydrationFn(ctx);
      this.markHydrated();
    }

    this.startCompaction();
  }

  /**
   * Attach a WebSocketServerAdapter so this node can serve as a sync host.
   * Must be called after init().
   *
   * Usage:
   *   const wss = new WebSocketServer({ port: 8080 });
   *   await store.init();
   *   store.attachServerAdapter(new WebSocketServerAdapter(wss));
   */
  attachServerAdapter(adapter: WebSocketServerAdapter): void {
    if (!this.repo) {
      throw new Error('CRDTStore.attachServerAdapter() must be called after init()');
    }
    const na = adapter as unknown as NetworkAdapterInterface;
    this.networkAdapters.push(na);
    this.repo.networkSubsystem.addNetworkAdapter(na);
  }

  /**
   * Get or create a document for the given domain and id.
   */
  async getOrCreate<T extends CRDTDocumentRoot>(
    domain: DomainName,
    id: string,
    initialData?: Omit<T, 'schemaVersion' | '_meta'>
  ): Promise<DocHandle<T>> {
    this.assertInitialized();
    const key = registryKey(domain, id);

    if (this.handles.has(key)) {
      return this.handles.get(key) as DocHandle<T>;
    }

    const existingUrl = this.registry[key];
    if (existingUrl) {
      const handle = await this.repo.find<T>(existingUrl as AutomergeUrl);
      this.handles.set(key, handle as unknown as DocHandle<CRDTDocumentRoot>);
      return handle;
    }

    // Create a new document
    const now = new Date().toISOString();
    const handle = this.repo.create<T>({
      schemaVersion: 1,
      _meta: {
        instanceId: this.config.instanceId,
        createdAt: now,
        updatedAt: now,
      },
      ...(initialData ?? {}),
    } as unknown as T);

    this.registry[key] = handle.url;
    this.saveRegistry();
    this.handles.set(key, handle as unknown as DocHandle<CRDTDocumentRoot>);

    return handle;
  }

  /**
   * Return a snapshot of the local document registry (domain:id → AutomergeUrl).
   */
  getRegistry(): RegistryMap {
    return { ...this.registry };
  }

  /**
   * Adopt a remote registry (typically from the primary instance).
   * For each key in the remote registry:
   *   - If local has no entry → adopt the remote URL
   *   - If local has a DIFFERENT URL → adopt the remote URL and evict stale handle
   *   - If local has the SAME URL → no-op
   *
   * This resolves split-brain where two instances independently created
   * documents for the same domain:id with different Automerge URLs.
   */
  adoptRemoteRegistry(remote: RegistryMap): { adopted: number; conflicts: number } {
    this.assertInitialized();
    let adopted = 0;
    let conflicts = 0;

    for (const [key, remoteUrl] of Object.entries(remote)) {
      const localUrl = this.registry[key];
      if (localUrl === remoteUrl) continue; // Already in sync

      if (localUrl) {
        // Conflict: local has a different URL for the same key
        conflicts++;
        // Evict the stale local handle so next getOrCreate() uses the adopted URL
        this.handles.delete(key);
      }

      this.registry[key] = remoteUrl;
      adopted++;
    }

    if (adopted > 0) {
      this.saveRegistry();
    }

    return { adopted, conflicts };
  }

  /**
   * Find a document by its AutomergeUrl (for cross-store document access).
   * Used to request a document from a remote peer by its URL.
   */
  async findByUrl<T extends CRDTDocumentRoot>(url: string): Promise<DocHandle<T>> {
    this.assertInitialized();
    return this.repo.find<T>(url as AutomergeUrl);
  }

  /**
   * Get the AutomergeUrl for a given domain/id pair (for sharing with peers).
   */
  getDocumentUrl(domain: DomainName, id: string): string | undefined {
    return this.registry[registryKey(domain, id)];
  }

  /**
   * Register an external document URL under a domain/id in the local registry.
   * Use this when a peer shares a document URL out-of-band.
   */
  registerDocumentUrl(domain: DomainName, id: string, url: string): void {
    this.registry[registryKey(domain, id)] = url;
    this.saveRegistry();
  }

  /**
   * Apply a mutation to a document. The instanceId and updatedAt timestamp
   * are automatically set for attribution.
   */
  async change<T extends CRDTDocumentRoot>(
    domain: DomainName,
    id: string,
    fn: (doc: T) => void
  ): Promise<void> {
    const handle = await this.getOrCreate<T>(domain, id);
    const instanceId = this.config.instanceId;
    const updatedAt = new Date().toISOString();

    handle.change((doc: T) => {
      fn(doc);
      doc._meta.instanceId = instanceId;
      doc._meta.updatedAt = updatedAt;
    });

    this.emit('change', { domain, id, doc: handle.doc() });
  }

  /**
   * Subscribe to changes on a document (both local and remote).
   * Returns an unsubscribe function.
   */
  subscribe<T extends CRDTDocumentRoot>(
    domain: DomainName,
    id: string,
    callback: ChangeCallback<T>
  ): Unsubscribe {
    let teardown: (() => void) | null = null;

    const setup = async () => {
      const handle = await this.getOrCreate<T>(domain, id);
      const listener = ({ doc }: { doc: T }) => {
        const normalized = normalizeDocument<T>(domain, doc);
        callback(normalized);
      };
      handle.on('change', listener);
      teardown = () => {
        handle.off('change', listener);
      };
    };

    setup().catch((err: Error) => {
      this.emit('error', err);
    });

    return () => {
      teardown?.();
    };
  }

  /**
   * Run a compaction pass: for each known document, compute a compact
   * Automerge binary checkpoint and write it to storageDir/checkpoints/.
   * This prevents unbounded history growth.
   */
  async compact(): Promise<void> {
    const checkpointDir = path.join(this.config.storageDir, 'checkpoints');
    fs.mkdirSync(checkpointDir, { recursive: true });

    for (const [key, handle] of this.handles.entries()) {
      const doc = handle.doc();
      if (!doc) continue;
      const binary = Automerge.save(doc);
      const filename = path.join(checkpointDir, `${encodeKey(key)}.bin`);
      fs.writeFileSync(filename, binary);
    }
  }

  /**
   * Close the store, disconnecting all network adapters and stopping compaction.
   */
  async close(): Promise<void> {
    if (this.compactTimer) {
      clearInterval(this.compactTimer);
      this.compactTimer = null;
    }
    // Disconnect all network adapters to close WebSocket connections.
    // The WebSocketClientAdapter may throw or emit errors if the socket
    // is still in CONNECTING state. Suppress both sync and async errors.
    for (const adapter of this.networkAdapters) {
      try {
        // Suppress error events that fire asynchronously from ws.close()
        const ws = (adapter as unknown as Record<string, unknown>).socket as
          | { removeAllListeners?: (e: string) => void }
          | undefined;
        ws?.removeAllListeners?.('error');
        adapter.disconnect();
      } catch {
        // ignore disconnect errors
      }
    }
    this.networkAdapters = [];
    // Flush pending storage writes with a timeout to prevent hanging
    const documentIds = [...this.handles.values()].map((h) => parseAutomergeUrl(h.url).documentId);
    if (documentIds.length > 0) {
      await Promise.race([
        this.repo.flush(documentIds),
        new Promise<void>((resolve) => setTimeout(resolve, 2000)),
      ]);
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private assertInitialized(): void {
    if (!this.initialized) {
      throw new Error('CRDTStore must be initialized before use. Call await store.init()');
    }
  }

  private loadRegistry(): void {
    if (fs.existsSync(this.registryPath)) {
      try {
        const raw = fs.readFileSync(this.registryPath, 'utf-8');
        this.registry = JSON.parse(raw) as RegistryMap;
      } catch {
        this.registry = {};
      }
    }
  }

  private saveRegistry(): void {
    fs.writeFileSync(this.registryPath, JSON.stringify(this.registry, null, 2), 'utf-8');
  }

  private isStorageEmpty(): boolean {
    const markerPath = path.join(this.config.storageDir, HYDRATION_MARKER);
    return !fs.existsSync(markerPath) && Object.keys(this.registry).length === 0;
  }

  private markHydrated(): void {
    const markerPath = path.join(this.config.storageDir, HYDRATION_MARKER);
    fs.writeFileSync(markerPath, new Date().toISOString(), 'utf-8');
  }

  private buildHydrationContext(): HydrationContext {
    return {
      createDocument: async <T extends CRDTDocumentRoot>(
        domain: DomainName,
        id: string,
        initialDoc: Omit<T, 'schemaVersion' | '_meta'>
      ) => {
        await this.getOrCreate<T>(domain, id, initialDoc);
      },
    };
  }

  private startCompaction(): void {
    const intervalMs = this.config.compactIntervalMs ?? DEFAULT_COMPACT_INTERVAL_MS;
    this.compactTimer = setInterval(() => {
      this.compact().catch((err) => {
        this.emit('error', err);
      });
    }, intervalMs);
    // Allow the process to exit even with the timer running
    if (this.compactTimer.unref) {
      this.compactTimer.unref();
    }
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function registryKey(domain: DomainName, id: string): string {
  return `${domain}:${id}`;
}

function encodeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9_-]/g, '_');
}
