// Work Intake module — wires WorkIntakeService dependencies from proto.config.yaml and ServiceContainer.
// Safe to call in single-instance mode — configures deps unconditionally so the service is ready
// when auto-mode starts (the service itself gates on config.enabled and deps being set).

import { loadProtoConfig } from '@protolabsai/platform';
import { createLogger } from '@protolabsai/utils';
import type { InstanceIdentity } from '@protolabsai/types';
import type { ServiceContainer } from '../server/services.js';

const logger = createLogger('WorkIntakeModule');

export async function register(container: ServiceContainer): Promise<void> {
  const protoConfig = await loadProtoConfig(container.repoRoot);

  // Extract typed config sections from the open-ended ProtoConfig
  const workIntakeConfig = protoConfig?.['workIntake'] as
    | { enabled?: boolean; tickIntervalMs?: number; claimTimeoutMs?: number }
    | undefined;
  const protolabConfig = protoConfig?.['protolab'] as { instanceId?: string } | undefined;
  const instanceConfig = protoConfig?.['instance'] as
    | { role?: import('@protolabsai/types').InstanceRole; tags?: string[] }
    | undefined;

  // Apply config from proto.config.yaml (if present)
  if (workIntakeConfig) {
    container.workIntakeService.configure(workIntakeConfig);
  }

  // Set dependencies so the service can tick when auto-mode starts
  container.workIntakeService.setDependencies({
    events: container.events,
    instanceId: protolabConfig?.instanceId || 'default',
    role: instanceConfig?.role || 'fullstack',
    tags: instanceConfig?.tags,
    getProjects: async (projectPath: string) => {
      const slugs = await container.projectService.listProjects(projectPath);
      const projects = await Promise.all(
        slugs.map((slug) => container.projectService.getProject(projectPath, slug))
      );
      return projects.filter((p) => p !== null);
    },
    updatePhaseClaim: async (projectPath, projectSlug, milestoneSlug, phaseName, update) => {
      await container.projectService.updatePhaseClaim(
        projectPath,
        projectSlug,
        milestoneSlug,
        phaseName,
        update
      );
    },
    getPhase: async (projectPath, projectSlug, milestoneSlug, phaseName) => {
      return container.projectService.getPhase(projectPath, projectSlug, milestoneSlug, phaseName);
    },
    createFeature: async (projectPath, featureData) => {
      const feature = await container.featureLoader.create(projectPath, featureData);
      return { id: feature.id };
    },
    getRunningAgentCount: () => container.autoModeService.getRunningAgentCount(),
    getMaxConcurrency: () => container.autoModeService.getMaxConcurrency(),
    getPeerStatus: () => {
      const peers = container.crdtSyncService.getPeers();
      const map = new Map<string, InstanceIdentity>();
      for (const peer of peers) {
        map.set(peer.identity.instanceId, peer.identity);
      }
      return map;
    },
  });

  // Wire work intake into auto-mode start/stop lifecycle
  container.autoModeService.setWorkIntakeService(container.workIntakeService);

  logger.info('Work intake module registered');
}
