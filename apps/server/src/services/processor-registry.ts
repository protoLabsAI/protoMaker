/**
 * Processor Registry — Maps processor names to factory functions.
 *
 * Built-in processors are registered at startup. Projects can register
 * custom processors via workflow YAML definitions that reference these names.
 *
 * Factory pattern: each call to `get()` produces a fresh processor instance
 * so stateful processors don't leak between features.
 */

import { createLogger } from '@protolabsai/utils';
import type { StateProcessor, ProcessorServiceContext } from './lead-engineer-types.js';
import { IntakeProcessor, PlanProcessor } from './lead-engineer-processors.js';
import { ExecuteProcessor } from './lead-engineer-execute-processor.js';
import { ReviewProcessor, MergeProcessor } from './lead-engineer-review-merge-processors.js';
import { DeployProcessor } from './lead-engineer-deploy-processor.js';
import { EscalateProcessor } from './lead-engineer-escalation.js';
import { GtmExecuteProcessor } from './lead-engineer-gtm-execute-processor.js';
import { GtmReviewProcessor } from './lead-engineer-gtm-review-processor.js';

const logger = createLogger('ProcessorRegistry');

export type ProcessorFactory = (ctx: ProcessorServiceContext) => StateProcessor;

export class ProcessorRegistry {
  private readonly factories = new Map<string, ProcessorFactory>();

  /**
   * Register a processor factory by name.
   * Overwrites any existing registration for the same name.
   */
  register(name: string, factory: ProcessorFactory): void {
    this.factories.set(name, factory);
    logger.debug(`Registered processor: ${name}`);
  }

  /**
   * Create a processor instance by name.
   * Returns null if no factory is registered for the given name.
   */
  get(name: string, serviceContext: ProcessorServiceContext): StateProcessor | null {
    const factory = this.factories.get(name);
    if (!factory) {
      logger.warn(`No processor registered for name: ${name}`);
      return null;
    }
    return factory(serviceContext);
  }

  /**
   * Check if a processor is registered.
   */
  has(name: string): boolean {
    return this.factories.has(name);
  }

  /**
   * List all registered processor names.
   */
  list(): string[] {
    return Array.from(this.factories.keys());
  }
}

/**
 * Create a ProcessorRegistry pre-loaded with all built-in processors.
 */
export function createDefaultProcessorRegistry(): ProcessorRegistry {
  const registry = new ProcessorRegistry();

  // Standard pipeline processors
  registry.register('intake', (ctx) => new IntakeProcessor(ctx));
  registry.register('plan', (ctx) => new PlanProcessor(ctx));
  registry.register('execute', (ctx) => new ExecuteProcessor(ctx));
  registry.register('review', (ctx) => new ReviewProcessor(ctx));
  registry.register('merge', (ctx) => new MergeProcessor(ctx));
  registry.register('deploy', (ctx) => new DeployProcessor(ctx));
  registry.register('escalate', (ctx) => new EscalateProcessor(ctx));

  // GTM content processors
  registry.register('content-execute', () => new GtmExecuteProcessor());
  registry.register('content-review', (ctx) => new GtmReviewProcessor(ctx));

  logger.info(`ProcessorRegistry initialized with ${registry.list().length} built-in processors`);
  return registry;
}
