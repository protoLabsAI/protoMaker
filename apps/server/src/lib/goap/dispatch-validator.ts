/**
 * Dispatch Validator — pre-dispatch registry validation for GOAP actions.
 *
 * Validates that dispatch targets exist in the live fleet registry before
 * allowing dispatch. Blocks phantom routing to non-existent agents
 * (e.g., auto-triage-sweep, system user accounts).
 */

import { createLogger } from '@protolabsai/utils';
import { DEFAULT_GOAP_CONFIG, type GoapFeedbackLoopConfig } from './goap-config.js';

const logger = createLogger('DispatchValidator');

export class InvalidAgentError extends Error {
  constructor(
    public readonly agentId: string,
    public readonly reason: string
  ) {
    super(`Invalid dispatch target "${agentId}": ${reason}`);
    this.name = 'InvalidAgentError';
  }
}

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

export interface AgentRegistryEntry {
  agentId: string;
  registeredAt: number;
  lastSeenAt: number;
}

export class DispatchValidator {
  private registry = new Map<string, AgentRegistryEntry>();
  private readonly phantomPatterns: string[];
  private readonly gracePeriodMs: number;
  private whitelistedAgents = new Set<string>();

  constructor(config?: Partial<GoapFeedbackLoopConfig>) {
    this.phantomPatterns = config?.phantomAgentPatterns ?? DEFAULT_GOAP_CONFIG.phantomAgentPatterns;
    this.gracePeriodMs = config?.registryGracePeriodMs ?? DEFAULT_GOAP_CONFIG.registryGracePeriodMs;
  }

  /**
   * Validate whether a dispatch target is a valid, live agent.
   */
  validate(agentId: string, now = Date.now()): ValidationResult {
    // Whitelisted agents always pass
    if (this.whitelistedAgents.has(agentId)) {
      return { valid: true };
    }

    // Check phantom agent patterns
    for (const pattern of this.phantomPatterns) {
      if (agentId === pattern || agentId.startsWith(`${pattern}:`)) {
        logger.warn(`Phantom agent rejected: "${agentId}" matches pattern "${pattern}"`);
        return {
          valid: false,
          reason: `Agent "${agentId}" matches phantom agent pattern "${pattern}"`,
        };
      }
    }

    // Check registry presence
    const entry = this.registry.get(agentId);
    if (!entry) {
      // Apply grace period: if registry was recently refreshed, hard-reject.
      // If not, soft-reject with warning (agent may be transitioning).
      logger.warn(`Agent "${agentId}" not found in fleet registry`);
      return {
        valid: false,
        reason: `Agent "${agentId}" not present in live fleet registry`,
      };
    }

    // Check if agent was seen within grace period
    const timeSinceLastSeen = now - entry.lastSeenAt;
    if (timeSinceLastSeen > this.gracePeriodMs) {
      logger.warn(
        `Agent "${agentId}" last seen ${Math.floor(timeSinceLastSeen / 1000)}s ago ` +
          `(grace period: ${this.gracePeriodMs / 1000}s)`
      );
      return {
        valid: false,
        reason: `Agent "${agentId}" last seen ${Math.floor(timeSinceLastSeen / 1000)}s ago, exceeds grace period`,
      };
    }

    return { valid: true };
  }

  /**
   * Validate and throw if invalid. Convenience method for call sites that want exceptions.
   */
  validateOrThrow(agentId: string, now = Date.now()): void {
    const result = this.validate(agentId, now);
    if (!result.valid) {
      throw new InvalidAgentError(agentId, result.reason!);
    }
  }

  /**
   * Register an agent as active in the fleet.
   */
  registerAgent(agentId: string, now = Date.now()): void {
    const existing = this.registry.get(agentId);
    this.registry.set(agentId, {
      agentId,
      registeredAt: existing?.registeredAt ?? now,
      lastSeenAt: now,
    });
  }

  /**
   * Remove an agent from the registry.
   */
  deregisterAgent(agentId: string): boolean {
    return this.registry.delete(agentId);
  }

  /**
   * Refresh the entire registry from a list of active agents.
   * Agents not in the list are removed.
   */
  refreshRegistry(agentIds: string[], now = Date.now()): void {
    const activeSet = new Set(agentIds);

    // Remove agents no longer in the active list
    for (const existing of this.registry.keys()) {
      if (!activeSet.has(existing)) {
        this.registry.delete(existing);
      }
    }

    // Add/update active agents
    for (const id of agentIds) {
      this.registerAgent(id, now);
    }

    logger.debug(`Registry refreshed: ${agentIds.length} agents active`);
  }

  /**
   * Add an agent to the whitelist (always passes validation).
   * Used for agents in transitional states per deviation rules.
   */
  addWhitelist(agentId: string): void {
    this.whitelistedAgents.add(agentId);
    logger.info(`Agent "${agentId}" added to validation whitelist`);
  }

  /**
   * Remove an agent from the whitelist.
   */
  removeWhitelist(agentId: string): boolean {
    return this.whitelistedAgents.delete(agentId);
  }

  /**
   * Get the number of registered agents.
   */
  getRegisteredCount(): number {
    return this.registry.size;
  }

  /**
   * Get all registered agent IDs.
   */
  getRegisteredAgents(): string[] {
    return Array.from(this.registry.keys());
  }

  /**
   * Clear registry and whitelist (admin/testing).
   */
  clear(): void {
    this.registry.clear();
    this.whitelistedAgents.clear();
  }
}
