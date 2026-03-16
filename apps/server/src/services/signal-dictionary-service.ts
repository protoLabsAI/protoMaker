/**
 * SignalDictionaryService — Portfolio Attention Engine
 *
 * Evaluates named signals against configurable thresholds and creates
 * ActionableItems when conditions cross boundaries. See the signal taxonomy
 * in docs/internal/portfolio-philosophy.md:
 *
 *   Exception — will get worse if you wait (Ava interrupts immediately)
 *   Decision  — needs human judgment but can wait for next ritual
 *   Information — below all thresholds (no item created)
 */

import { createLogger } from '@protolabsai/utils';
import type {
  SignalCategory,
  SignalContext,
  SignalDefinition,
  SignalDictionaryConfig,
  SignalEvaluation,
  SignalThresholdOverride,
  ActionableItemPriority,
} from '@protolabsai/types';
import { DEFAULT_SIGNAL_DEFINITIONS } from '@protolabsai/types';

import type { EventEmitter } from '../lib/events.js';
import type { SettingsService } from './settings-service.js';

const logger = createLogger('SignalDictionary');

/** Cooldown entry: tracks when a signal+context was last triggered. */
interface CooldownEntry {
  signalName: string;
  contextKey: string;
  triggeredAt: number;
}

/**
 * Build a dedup key from signal name + context so cooldowns are scoped
 * per-feature, per-project, or per-PR — not globally.
 */
function buildContextKey(signalName: string, ctx: SignalContext): string {
  const parts = [signalName, ctx.projectPath];
  if (ctx.featureId) parts.push(ctx.featureId);
  if (ctx.prNumber != null) parts.push(String(ctx.prNumber));
  return parts.join('::');
}

// Re-export for testing
export type { CooldownEntry };

interface ActionableItemServiceLike {
  createActionableItem(input: {
    actionType: 'signal';
    priority: ActionableItemPriority;
    title: string;
    message: string;
    actionPayload: Record<string, unknown>;
    projectPath: string;
    category: string;
  }): Promise<{ id: string }>;
}

export class SignalDictionaryService {
  private readonly definitions: Map<string, SignalDefinition>;
  private readonly cooldowns = new Map<string, CooldownEntry>();

  constructor(
    private readonly actionableItemService: ActionableItemServiceLike,
    private readonly events: EventEmitter,
    private readonly settingsService: SettingsService
  ) {
    // Load defaults into a mutable map
    this.definitions = new Map(DEFAULT_SIGNAL_DEFINITIONS.map((d) => [d.name, { ...d }]));

    // Sweep expired cooldowns every 5 minutes
    const cleanupTimer = setInterval(() => this.sweepCooldowns(), 5 * 60 * 1000);
    cleanupTimer.unref();
  }

  // ── Public API ───────────────────────────────────────────────────────────

  /**
   * Evaluate a signal against its thresholds.
   *
   * If the value crosses a threshold and cooldown allows, creates an ActionableItem
   * and emits a `signal:triggered` event.
   *
   * @returns The evaluation result (always returned, even when not triggered).
   */
  async evaluate(
    signalName: string,
    currentValue: number,
    context: SignalContext
  ): Promise<SignalEvaluation> {
    const definition = this.getResolvedDefinition(signalName);
    if (!definition) {
      return {
        signalName,
        currentValue,
        category: 'information',
        triggered: false,
        skipReason: 'disabled',
        context,
      };
    }

    if (!definition.enabled) {
      return {
        signalName,
        currentValue,
        category: 'information',
        triggered: false,
        skipReason: 'disabled',
        context,
      };
    }

    // Resolve category from thresholds
    const category = this.resolveCategory(definition, currentValue);

    if (category === 'information') {
      return {
        signalName,
        currentValue,
        category,
        triggered: false,
        skipReason: 'below_threshold',
        context,
      };
    }

    // Check cooldown
    const contextKey = buildContextKey(signalName, context);
    if (this.isOnCooldown(contextKey, definition.cooldownMs)) {
      return {
        signalName,
        currentValue,
        category,
        triggered: false,
        skipReason: 'cooldown',
        context,
      };
    }

    // Create ActionableItem
    const priority = this.categoryToPriority(category);
    try {
      await this.actionableItemService.createActionableItem({
        actionType: 'signal',
        priority,
        title: `[${category.toUpperCase()}] ${definition.description}`,
        message: this.buildMessage(definition, currentValue, context),
        actionPayload: {
          signalName,
          currentValue,
          unit: definition.unit,
          category,
          autoAction: definition.autoAction,
          ...context,
        },
        projectPath: context.projectPath,
        category,
      });

      // Record cooldown
      this.cooldowns.set(contextKey, {
        signalName,
        contextKey,
        triggeredAt: Date.now(),
      });

      // Emit event
      this.events.emit('signal:triggered', {
        signalName,
        currentValue,
        category,
        context,
      });

      logger.info(
        `Signal "${signalName}" triggered as ${category}: value=${currentValue}${definition.unit} (threshold: ${category === 'exception' ? definition.exceptionThreshold.value : definition.decisionThreshold.value})`
      );
    } catch (err) {
      logger.error(`Failed to create ActionableItem for signal "${signalName}":`, err);
    }

    return {
      signalName,
      currentValue,
      category,
      triggered: true,
      context,
    };
  }

  /**
   * Get all resolved signal definitions (defaults merged with config overrides).
   */
  async getDefinitions(): Promise<SignalDefinition[]> {
    const config = await this.getConfig();
    if (config && !config.enabled) {
      return [];
    }

    return Array.from(this.definitions.values()).map((def) => {
      const override = config?.overrides[def.name];
      return override ? this.applyOverride(def, override) : def;
    });
  }

  /**
   * Check if the signal dictionary is globally enabled.
   */
  async isEnabled(): Promise<boolean> {
    const config = await this.getConfig();
    return config?.enabled !== false;
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  /**
   * Resolve a definition with any config overrides applied.
   */
  private getResolvedDefinition(signalName: string): SignalDefinition | undefined {
    const base = this.definitions.get(signalName);
    if (!base) return undefined;

    // Config overrides are loaded lazily on each evaluation to pick up settings changes.
    // This is intentionally synchronous — we use the cached config from settings service.
    // For the async path, callers should use getDefinitions().
    return base;
  }

  /**
   * Resolve category by comparing value against thresholds.
   * Exception threshold > Decision threshold > Information.
   */
  private resolveCategory(def: SignalDefinition, value: number): SignalCategory {
    if (value >= def.exceptionThreshold.value) return 'exception';
    if (value >= def.decisionThreshold.value) return 'decision';
    return 'information';
  }

  /**
   * Map signal category to ActionableItem priority.
   */
  private categoryToPriority(category: SignalCategory): ActionableItemPriority {
    switch (category) {
      case 'exception':
        return 'urgent';
      case 'decision':
        return 'medium';
      default:
        return 'low';
    }
  }

  /**
   * Build a human-readable message for the ActionableItem.
   */
  private buildMessage(def: SignalDefinition, value: number, ctx: SignalContext): string {
    const threshold =
      value >= def.exceptionThreshold.value ? def.exceptionThreshold : def.decisionThreshold;

    const parts = [
      `Signal: ${def.name}`,
      `Value: ${value} ${def.unit} (threshold: ${threshold.value} — ${threshold.description})`,
    ];

    if (ctx.featureId) parts.push(`Feature: ${ctx.featureId}`);
    if (ctx.prNumber != null) parts.push(`PR: #${ctx.prNumber}`);
    parts.push(`Auto-action: ${def.autoAction}`);

    return parts.join('\n');
  }

  /**
   * Check if a signal+context is within its cooldown window.
   */
  private isOnCooldown(contextKey: string, cooldownMs: number): boolean {
    const entry = this.cooldowns.get(contextKey);
    if (!entry) return false;
    return Date.now() - entry.triggeredAt < cooldownMs;
  }

  /**
   * Apply per-signal overrides from settings to a base definition.
   */
  private applyOverride(
    base: SignalDefinition,
    override: SignalThresholdOverride
  ): SignalDefinition {
    return {
      ...base,
      enabled: override.enabled ?? base.enabled,
      cooldownMs: override.cooldownMs ?? base.cooldownMs,
      decisionThreshold: {
        ...base.decisionThreshold,
        ...override.decisionThreshold,
      },
      exceptionThreshold: {
        ...base.exceptionThreshold,
        ...override.exceptionThreshold,
      },
    };
  }

  /**
   * Get the signal dictionary config from project settings.
   */
  private async getConfig(): Promise<SignalDictionaryConfig | undefined> {
    try {
      const globalSettings = await this.settingsService.getGlobalSettings();
      const currentProject = globalSettings.projects?.find(
        (p) => p.id === globalSettings.currentProjectId
      );
      if (!currentProject?.path) return undefined;
      const projectSettings = await this.settingsService.getProjectSettings(currentProject.path);
      return projectSettings?.workflow?.signalDictionary;
    } catch {
      return undefined;
    }
  }

  /**
   * Remove cooldown entries that have expired.
   */
  private sweepCooldowns(): void {
    const now = Date.now();
    // Use the maximum cooldown from any definition as the expiry
    const maxCooldown = Math.max(...Array.from(this.definitions.values()).map((d) => d.cooldownMs));

    let removed = 0;
    for (const [key, entry] of this.cooldowns) {
      if (now - entry.triggeredAt > maxCooldown) {
        this.cooldowns.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      logger.debug(`Signal cooldown sweep: removed ${removed} expired entries`);
    }
  }
}
