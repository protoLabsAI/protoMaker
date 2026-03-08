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
import { WebSocketServer } from 'ws';
import { CRDTStore, WebSocketServerAdapter } from '@protolabsai/crdt';
import { loadProtoConfig } from '@protolabsai/platform';
import { createLogger } from '@protolabsai/utils';
import type { ServiceContainer } from '../server/services.js';

const logger = createLogger('CrdtStoreModule');

/** Default port offset from the CrdtSyncService sync port */
const CRDT_STORE_PORT_OFFSET = 1;

export interface CrdtStoreModuleResult {
  store: CRDTStore;
  close: () => Promise<void>;
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

  const close = async () => {
    await store.close();
    if (syncServer) {
      await new Promise<void>((resolve) => {
        syncServer!.close(() => resolve());
      });
    }
    logger.info('CRDTStore shut down');
  };

  return { store, close };
}
