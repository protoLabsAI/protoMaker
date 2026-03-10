/**
 * Ava Channel Reactor Module — instantiates AvaChannelReactorService and wires it
 * into the server lifecycle.
 *
 * Reads hivemind config from proto.config.yaml and checks for the `reactorEnabled`
 * feature flag in global settings. When both conditions are met, starts the reactor
 * and returns a {service, stop} handle for the server shutdown sequence.
 *
 * Must run after crdt-store.module so that container._crdtStore is populated.
 *
 * Safe to call in single-instance mode — returns null when proto.config.yaml is
 * absent, hivemind is not enabled, or the reactorEnabled flag is off.
 */

import { loadProtoConfig } from '@protolabsai/platform';
import { createLogger } from '@protolabsai/utils';
import { AvaChannelReactorService } from './ava-channel-reactor-service.js';
import type { ServiceContainer } from '../server/services.js';

const logger = createLogger('AvaChannelReactorModule');

export interface AvaChannelReactorModuleResult {
  service: AvaChannelReactorService;
  stop: () => void;
}

/**
 * Initialize AvaChannelReactorService and attach it to the server lifecycle.
 * Returns the service instance and a stop function, or null when the reactor
 * should not run (single-instance mode, hivemind disabled, or flag off).
 */
export async function register(
  container: ServiceContainer
): Promise<AvaChannelReactorModuleResult | null> {
  const { repoRoot, settingsService, avaChannelService, crdtSyncService, autoModeService } =
    container;

  // Check reactorEnabled feature flag (fast path before filesystem I/O)
  let reactorEnabled = false;
  try {
    const globalSettings = await settingsService.getGlobalSettings();
    reactorEnabled = globalSettings.featureFlags?.reactorEnabled ?? false;
  } catch (err) {
    logger.warn('Failed to read global settings — reactor disabled:', err);
    return null;
  }

  if (!reactorEnabled) {
    logger.info('reactorEnabled feature flag is off — Ava Channel Reactor disabled');
    return null;
  }

  // Check hivemind config
  const protoConfig = await loadProtoConfig(repoRoot);
  if (!protoConfig) {
    logger.info('No proto.config.yaml — Ava Channel Reactor disabled (single-instance mode)');
    return null;
  }

  const hivemind = protoConfig['hivemind'] as { enabled?: boolean } | undefined;
  if (!hivemind?.enabled) {
    logger.info('Hivemind not enabled in proto.config.yaml — Ava Channel Reactor disabled');
    return null;
  }

  // Require the CRDTStore registered by crdt-store.module
  const crdtStore = container._crdtStore;
  if (!crdtStore) {
    logger.warn(
      'CRDTStore not available on container — ' +
        'ensure crdt-store.module registers before ava-channel-reactor.module'
    );
    return null;
  }

  const instanceId = crdtSyncService.getInstanceId();
  const instanceName = instanceId;

  logger.info(`Initializing AvaChannelReactorService: instanceId=${instanceId}`);

  const service = new AvaChannelReactorService({
    avaChannelService,
    crdtStore,
    instanceId,
    instanceName,
    settingsService,
    autoModeService,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    featureLoader: container.featureLoader as any,
    projectPath: repoRoot,
    frictionTrackerService: container.frictionTrackerService,
    reactiveSpawnerService: container.reactiveSpawnerService,
  });

  await service.start();
  logger.info('AvaChannelReactorService started');

  const stop = () => {
    service.stop();
    logger.info('AvaChannelReactorService stopped');
  };

  return { service, stop };
}
