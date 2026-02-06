/**
 * GOAP Action Registration
 *
 * Registers all GOAP action definitions and handlers with the registry.
 */

import type { GOAPActionRegistry } from '../goap-action-registry.js';
import type { FeatureLoader } from '../feature-loader.js';
import type { AutoModeService } from '../auto-mode-service.js';
import { registerAutoModeActions } from './auto-mode-actions.js';
import { registerFailureRecoveryActions } from './failure-recovery-actions.js';
import { registerWIPManagementActions } from './wip-management-actions.js';
import { registerPipelineActions } from './pipeline-actions.js';
import { registerMaintenanceActions } from './maintenance-actions.js';

export function registerAllActions(
  registry: GOAPActionRegistry,
  featureLoader: FeatureLoader,
  autoModeService: AutoModeService
): void {
  registerAutoModeActions(registry, autoModeService);
  registerFailureRecoveryActions(registry, featureLoader);
  registerWIPManagementActions(registry, featureLoader, autoModeService);
  registerPipelineActions(registry, featureLoader);
  registerMaintenanceActions(registry, autoModeService);
}
