/**
 * Traced Provider - Wraps a base provider with Langfuse tracing
 */

import { BaseProvider } from './base-provider.js';
import type {
  ExecuteOptions,
  ProviderMessage,
  InstallationStatus,
  ModelDefinition,
  ProviderConfig,
} from './types.js';
import { wrapProviderWithTracing, type TracingConfig } from '@automaker/observability';

/** Feature context for enriching traces */
export interface TracedProviderContext {
  featureId?: string;
  featureName?: string;
  agentRole?: string;
}

/**
 * Wrapper that adds tracing to any provider
 */
export class TracedProvider extends BaseProvider {
  private wrapped: BaseProvider;
  private tracingConfig: TracingConfig;

  constructor(wrapped: BaseProvider, tracingConfig: TracingConfig) {
    super(wrapped.getConfig());
    this.wrapped = wrapped;
    this.tracingConfig = tracingConfig;
    // Override the name property set by BaseProvider constructor
    this.name = wrapped.getName();
  }

  /**
   * Set feature context for trace enrichment.
   * Call after provider creation to correlate traces with board features.
   */
  setContext(ctx: TracedProviderContext): void {
    this.tracingConfig.defaultMetadata = {
      ...this.tracingConfig.defaultMetadata,
      ...ctx,
    };
    // Also add feature-specific tags
    if (ctx.featureId) {
      this.tracingConfig.defaultTags = [
        ...(this.tracingConfig.defaultTags ?? []),
        `feature:${ctx.featureId}`,
      ];
    }
    if (ctx.agentRole) {
      this.tracingConfig.defaultTags = [
        ...(this.tracingConfig.defaultTags ?? []),
        `role:${ctx.agentRole}`,
      ];
    }
  }

  getName(): string {
    // During construction, wrapped might not be set yet (called by BaseProvider constructor)
    // In that case, return a placeholder that will be overwritten
    return this.wrapped?.getName() || 'traced';
  }

  async *executeQuery(options: ExecuteOptions): AsyncGenerator<ProviderMessage> {
    // Extract model from options
    const model = options.model || 'unknown';

    // Wrap the provider's generator with tracing
    const generator = this.wrapped.executeQuery(options);

    yield* wrapProviderWithTracing(generator, this.tracingConfig, {
      model,
      traceName: `provider:${this.getName()}`,
      sessionId: options.sdkSessionId,
      metadata: {
        provider: this.getName(),
        originalModel: options.originalModel,
        cwd: options.cwd,
        maxTurns: options.maxTurns,
        hasSystemPrompt: !!options.systemPrompt,
        hasConversationHistory: !!options.conversationHistory,
        conversationHistoryLength: options.conversationHistory?.length ?? 0,
      },
      input: {
        prompt: options.prompt,
        model: options.model,
        systemPrompt: options.systemPrompt,
      },
    });
  }

  detectInstallation(): Promise<InstallationStatus> {
    return this.wrapped.detectInstallation();
  }

  getAvailableModels(): ModelDefinition[] {
    return this.wrapped.getAvailableModels();
  }

  supportsFeature(feature: string): boolean {
    return this.wrapped.supportsFeature(feature);
  }

  getConfig(): ProviderConfig {
    return this.wrapped.getConfig();
  }

  setConfig(config: Partial<ProviderConfig>): void {
    this.wrapped.setConfig(config);
  }
}
