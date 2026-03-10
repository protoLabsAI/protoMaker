/**
 * AutoModeCoordinator — error budget freeze gate for auto-mode.
 *
 * Listens to `error_budget:exhausted` and `error_budget:recovered` events
 * emitted by ErrorBudgetService and maintains a pickup-freeze flag that
 * FeatureScheduler checks before starting new feature agents.
 *
 * Running agents are NOT affected — only new feature pickup is blocked.
 *
 * The freeze gate is controlled by the `errorBudgetAutoFreeze` WorkflowSettings
 * field (default: true).  When the setting is false the coordinator ignores
 * budget events entirely.
 */

import type { EventEmitter } from '../../lib/events.js';
import type { EventType } from '@protolabsai/types';
import { createLogger } from '@protolabsai/utils';
import type { SettingsService } from '../settings-service.js';

const logger = createLogger('AutoModeCoordinator');

export class AutoModeCoordinator {
  /** Whether new feature pickup is currently frozen by an error budget exhaustion. */
  private _pickupFrozen = false;

  private readonly events: EventEmitter;
  private readonly settingsService: SettingsService | null;

  constructor(events: EventEmitter, settingsService?: SettingsService | null) {
    this.events = events;
    this.settingsService = settingsService ?? null;

    this.events.on('error_budget:exhausted' as EventType, (data: unknown) => {
      void this._handleExhausted(data as { projectPath: string; failRate: number });
    });

    this.events.on('error_budget:recovered' as EventType, (data: unknown) => {
      void this._handleRecovered(data as { projectPath: string; failRate: number });
    });
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Returns true when new feature pickup should be paused due to an error
   * budget freeze.  Returns false when the setting is disabled or the budget
   * is healthy.
   */
  isPickupFrozen(): boolean {
    return this._pickupFrozen;
  }

  // ── Private handlers ───────────────────────────────────────────────────────

  private async _handleExhausted(data: { projectPath: string; failRate: number }): Promise<void> {
    if (!(await this._isAutoFreezeEnabled())) {
      logger.debug(
        '[AutoModeCoordinator] error_budget:exhausted received but errorBudgetAutoFreeze is disabled — skipping freeze'
      );
      return;
    }

    if (!this._pickupFrozen) {
      this._pickupFrozen = true;
      logger.warn(
        `[AutoModeCoordinator] Error budget exhausted (failRate=${data.failRate.toFixed(3)}) — new feature pickup frozen`
      );
    }
  }

  private async _handleRecovered(data: { projectPath: string; failRate: number }): Promise<void> {
    if (this._pickupFrozen) {
      this._pickupFrozen = false;
      logger.info(
        `[AutoModeCoordinator] Error budget recovered (failRate=${data.failRate.toFixed(3)}) — new feature pickup resumed`
      );
    }
  }

  private async _isAutoFreezeEnabled(): Promise<boolean> {
    if (!this.settingsService) return true; // default: enabled

    try {
      // errorBudgetAutoFreeze is stored on the first active project's workflow settings.
      // We read global settings to find the first project path, then check workflow settings.
      const globalSettings = await this.settingsService.getGlobalSettings();
      const projectPath = globalSettings.projects?.[0]?.path;
      if (!projectPath) return true;

      const projectSettings = await this.settingsService.getProjectSettings(projectPath);
      const workflow = projectSettings.workflow as
        | (typeof projectSettings.workflow & { errorBudgetAutoFreeze?: boolean })
        | undefined;

      // Default is true (enabled)
      return workflow?.errorBudgetAutoFreeze !== false;
    } catch {
      return true; // fail-safe: default to enabled
    }
  }
}
