/**
 * CRDT Store Module — instantiates the shared CRDTStore and injects it into all
 * services that support document-level CRDT sync.
 *
 * This module bridges the gap between:
 *   - CrdtSyncService (peer mesh, heartbeat, event broadcast)
 *   - CRDTStore (Automerge document persistence + replication)
 *
 * CrdtSyncService owns the peer mesh on port N (default 4444).
 * CRDTStore runs a separate Automerge sync server on port N+1 (default 4445)
 * for binary document replication. Both ports are only active when
 * proto.config.yaml enables hivemind mode.
 *
 * Services injected:
 *   - AvaChannelService.setCrdtStore()
 *   - CalendarService.setCrdtStore()
 *   - TodoService.setCrdtStore()
 *
 * Features and Projects use EventBus-based sync (handled by crdt-sync.module.ts)
 * because their storage is filesystem-primary with event notifications.
 */

import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { WebSocketServer } from 'ws';
import { CRDTStore, WebSocketServerAdapter } from '@protolabsai/crdt';
import type { MetricsDocument, NotesWorkspaceDocument, NoteTab } from '@protolabsai/crdt';
import { loadProtoConfig } from '@protolabsai/platform';
import { createLogger } from '@protolabsai/utils';
import type {
  MemoryStatsCrdtWriter,
  MemoryStatsAggregateReader,
  UsageStats,
} from '@protolabsai/utils';
import type { ServiceContainer } from '../server/services.js';

const logger = createLogger('CrdtStoreModule');

/** Default port offset from the CrdtSyncService sync port */
const CRDT_STORE_PORT_OFFSET = 1;

/** Domain and document ID used for the shared metrics document */
const METRICS_DOMAIN = 'metrics' as const;
const METRICS_DOC_ID = 'dora';

export interface CrdtStoreModuleResult {
  store: CRDTStore;
  close: () => Promise<void>;
  /**
   * Write a memory file stat increment to the CRDT Metrics document.
   * Writes under the local instanceId key — each instance owns its own slice.
   * Pass to incrementUsageStat / recordMemoryUsage for hivemind-wide tracking.
   */
  memoryStatsCrdtWriter: MemoryStatsCrdtWriter;
  /**
   * Read aggregated memory file usage stats from the CRDT Metrics document.
   * Aggregates across ALL instanceId keys to produce the hivemind-wide total.
   * Pass to loadRelevantMemory for better cross-instance scoring.
   */
  memoryStatsAggregateReader: MemoryStatsAggregateReader;
}

/**
 * Initialize the CRDTStore and inject it into all services that need it.
 * Returns the store instance and a cleanup function.
 *
 * Safe to call in single-instance mode — returns null when proto.config.yaml
 * is absent (no hivemind configured).
 */
export async function register(container: ServiceContainer): Promise<CrdtStoreModuleResult | null> {
  const { repoRoot } = container;

  const protoConfig = await loadProtoConfig(repoRoot);
  if (!protoConfig) {
    logger.info('No proto.config.yaml — CRDT store disabled (single-instance mode)');
    return null;
  }

  const hivemind = protoConfig['hivemind'] as { enabled?: boolean; peers?: string[] } | undefined;
  if (!hivemind?.enabled) {
    logger.info('Hivemind not enabled in proto.config.yaml — CRDT store disabled');
    return null;
  }

  const protolab = protoConfig['protolab'] as
    | { instanceId?: string; syncPort?: number; role?: string }
    | undefined;

  const instanceId = protolab?.instanceId ?? container.crdtSyncService.getInstanceId();
  const baseSyncPort = protolab?.syncPort ?? 4444;
  const crdtStorePort = baseSyncPort + CRDT_STORE_PORT_OFFSET;
  const role = protolab?.role ?? 'worker';
  const storageDir = join(repoRoot, '.automaker', 'crdt');

  // Build peer URLs — remap from sync port to CRDT store port
  const peers = (hivemind.peers ?? [])
    .map((peerUrl) => {
      try {
        const url = new URL(peerUrl);
        const peerSyncPort = parseInt(url.port, 10) || baseSyncPort;
        url.port = String(peerSyncPort + CRDT_STORE_PORT_OFFSET);
        return { url: url.toString() };
      } catch {
        logger.warn(`Invalid peer URL: ${peerUrl}, skipping`);
        return null;
      }
    })
    .filter((p): p is { url: string } => p !== null);

  logger.info(
    `Initializing CRDTStore: instanceId=${instanceId}, role=${role}, ` +
      `port=${crdtStorePort}, peers=${peers.length}, storageDir=${storageDir}`
  );

  const store = new CRDTStore({
    storageDir,
    instanceId,
    peers,
    compactIntervalMs: 5 * 60 * 1000,
  });

  await store.init();
  logger.info('CRDTStore initialized');

  // If primary, start WebSocket server for Automerge binary sync
  let syncServer: WebSocketServer | null = null;
  if (role === 'primary') {
    syncServer = new WebSocketServer({ port: crdtStorePort });
    await new Promise<void>((resolve, reject) => {
      syncServer!.on('listening', () => {
        logger.info(`CRDTStore sync server listening on port ${crdtStorePort}`);
        resolve();
      });
      syncServer!.on('error', (err) => {
        logger.error(`CRDTStore sync server error on port ${crdtStorePort}:`, err);
        reject(err);
      });
    });
    // Cast through unknown to satisfy differing ws type versions
    store.attachServerAdapter(
      new WebSocketServerAdapter(
        syncServer as unknown as ConstructorParameters<typeof WebSocketServerAdapter>[0]
      )
    );
  }

  // Inject into services that have setCrdtStore() hooks
  container.avaChannelService.setCrdtStore(store);
  container.calendarService.setCrdtStore(store);
  container.todoService.setCrdtStore(store);

  logger.info('CRDTStore injected into AvaChannelService, CalendarService, TodoService');

  // Hydrate notes workspace from disk — fire-and-forget, non-blocking
  void hydrateNotesWorkspace(store, repoRoot);

  // Wire registry sync via CrdtSyncService to prevent split-brain.
  // Primary: broadcasts its document registry when a peer connects.
  // Worker: adopts the primary's registry on receipt, resolving URL conflicts.
  const { crdtSyncService } = container;
  if (role === 'primary') {
    crdtSyncService.setRegistryProvider(() => store.getRegistry());
    logger.info('Registry provider attached — will broadcast to connecting peers');
  } else {
    crdtSyncService.onRegistryReceived((remoteRegistry) => {
      const { adopted, conflicts } = store.adoptRemoteRegistry(remoteRegistry);
      if (adopted > 0) {
        logger.info(
          `Registry sync: adopted ${adopted} entries from primary (${conflicts} conflicts resolved)`
        );
      }
    });
    logger.info('Registry receiver attached — will adopt primary registry on connect');
  }

  const close = async () => {
    // Suppress WebSocket errors during shutdown — the Automerge
    // WebSocketClientAdapter may throw asynchronously when the peer
    // disconnected before the socket was fully established.
    const suppressWsError = (err: Error) => {
      if (err.message?.includes('WebSocket was closed before')) {
        logger.debug('Suppressed WebSocket close error during shutdown');
        return;
      }
      throw err;
    };
    process.on('uncaughtException', suppressWsError);
    try {
      await store.close();
      // Allow any async WebSocket close events to fire before removing handler
      await new Promise<void>((resolve) => setTimeout(resolve, 100));
    } finally {
      process.removeListener('uncaughtException', suppressWsError);
    }
    if (syncServer) {
      await new Promise<void>((resolve) => {
        syncServer!.close(() => resolve());
      });
    }
    logger.info('CRDTStore shut down');
  };

  // ---------------------------------------------------------------------------
  // Memory stats CRDT callbacks
  // ---------------------------------------------------------------------------

  /**
   * Writes a single stat increment for filename under the local instanceId key
   * in memoryStats of the shared metrics CRDT document (domain='metrics', id='dora').
   */
  const memoryStatsCrdtWriter: MemoryStatsCrdtWriter = async (
    filename: string,
    stat: keyof UsageStats
  ): Promise<void> => {
    await store.change<MetricsDocument>(METRICS_DOMAIN, METRICS_DOC_ID, (doc) => {
      if (!doc.memoryStats) {
        doc.memoryStats = {};
      }
      if (!doc.memoryStats[instanceId]) {
        doc.memoryStats[instanceId] = {};
      }
      const instanceStats = doc.memoryStats[instanceId];
      if (!instanceStats[filename]) {
        instanceStats[filename] = { loaded: 0, referenced: 0, successfulFeatures: 0 };
      }
      instanceStats[filename][stat]++;
    });
  };

  /**
   * Reads and aggregates memory file usage stats across ALL instanceId keys
   * so callers see the combined signal from every hivemind instance.
   */
  const memoryStatsAggregateReader: MemoryStatsAggregateReader = async (
    filename: string
  ): Promise<UsageStats | null> => {
    const handle = await store.getOrCreate<MetricsDocument>(METRICS_DOMAIN, METRICS_DOC_ID);
    const doc = handle.doc();
    if (!doc) return null;

    const memoryStats = doc.memoryStats ?? {};
    let loaded = 0;
    let referenced = 0;
    let successfulFeatures = 0;
    let hasAnyData = false;

    for (const instanceStats of Object.values(memoryStats)) {
      const fileStat = instanceStats[filename];
      if (fileStat) {
        loaded += fileStat.loaded;
        referenced += fileStat.referenced;
        successfulFeatures += fileStat.successfulFeatures;
        hasAnyData = true;
      }
    }

    if (!hasAnyData) return null;
    return { loaded, referenced, successfulFeatures };
  };

  logger.info('Memory stats CRDT callbacks created (domain=metrics, id=dora)');

  return { store, close, memoryStatsCrdtWriter, memoryStatsAggregateReader };
}

// ---------------------------------------------------------------------------
// Notes workspace hydration
// ---------------------------------------------------------------------------

/** Disk format for a single note tab (from .automaker/notes/workspace.json) */
interface DiskNoteTab {
  id: string;
  name: string;
  content: string;
  permissions?: { agentRead?: boolean; agentWrite?: boolean };
  metadata?: {
    createdAt?: number;
    updatedAt?: number;
    wordCount?: number;
    characterCount?: number;
  };
}

/** Disk format for the notes workspace */
interface DiskNotesWorkspace {
  version?: number;
  activeTabId?: string | null;
  tabOrder?: string[];
  tabs?: Record<string, DiskNoteTab>;
}

/**
 * Hydrate the notes CRDT document from the existing disk workspace on first start.
 *
 * Idempotent: only seeds if the document does not already exist in the registry
 * (i.e. the registry has no 'notes:workspace' entry). Subsequent calls are no-ops.
 */
async function hydrateNotesWorkspace(store: CRDTStore, repoRoot: string): Promise<void> {
  const NOTES_DOC_ID = 'workspace';

  // Check idempotency: if the document is already in the registry, skip hydration
  const registry = store.getRegistry();
  if (registry['notes:workspace']) {
    logger.debug('[NotesHydration] notes:workspace already in registry — skipping');
    return;
  }

  const workspacePath = join(repoRoot, '.automaker', 'notes', 'workspace.json');
  let diskWorkspace: DiskNotesWorkspace | null = null;

  try {
    const raw = await readFile(workspacePath, 'utf-8');
    diskWorkspace = JSON.parse(raw) as DiskNotesWorkspace;
  } catch {
    // File does not exist or is unreadable — seed an empty workspace
    logger.debug('[NotesHydration] No existing workspace.json — seeding empty notes document');
  }

  const now = new Date().toISOString();

  // Map disk tabs to CRDT NoteTab format
  const tabs: Record<string, NoteTab> = {};
  const diskTabs = diskWorkspace?.tabs ?? {};
  for (const [id, diskTab] of Object.entries(diskTabs)) {
    if (!diskTab) continue;
    const createdAtMs = diskTab.metadata?.createdAt;
    const updatedAtMs = diskTab.metadata?.updatedAt;
    tabs[id] = {
      id: diskTab.id ?? id,
      name: diskTab.name ?? '',
      content: diskTab.content ?? '',
      permissions: {
        agentRead: diskTab.permissions?.agentRead ?? true,
        agentWrite: diskTab.permissions?.agentWrite ?? false,
      },
      createdAt: createdAtMs ? new Date(createdAtMs).toISOString() : now,
      updatedAt: updatedAtMs ? new Date(updatedAtMs).toISOString() : now,
      wordCount: diskTab.metadata?.wordCount ?? 0,
      characterCount: diskTab.metadata?.characterCount ?? 0,
    };
  }

  const initialData: Omit<NotesWorkspaceDocument, 'schemaVersion' | '_meta'> = {
    tabs,
    tabOrder: Array.isArray(diskWorkspace?.tabOrder) ? diskWorkspace.tabOrder : Object.keys(tabs),
    activeTabId: diskWorkspace?.activeTabId ?? null,
    updatedAt: now,
  };

  try {
    await store.getOrCreate<NotesWorkspaceDocument>('notes', NOTES_DOC_ID, initialData);
    logger.info(
      `[NotesHydration] Seeded notes:workspace with ${Object.keys(tabs).length} tab(s) from disk`
    );
  } catch (err) {
    logger.warn('[NotesHydration] Failed to seed notes:workspace:', err);
  }
}
