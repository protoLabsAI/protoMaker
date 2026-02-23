/**
 * PromptResolver Service
 *
 * Three-layer prompt resolution:
 *   1. User Override (settings.json promptCustomization)
 *   2. Langfuse Managed Prompt (label: "production")
 *   3. Hardcoded Default (libs/prompts/)
 *
 * Gracefully degrades: if Langfuse is unavailable, silently falls through
 * to defaults with zero added latency.
 */

import { createLogger } from '@automaker/utils';
import type { LangfuseClient } from '@automaker/observability';

const logger = createLogger('PromptResolver');

/** Source of a resolved prompt */
export type PromptSource = 'user-override' | 'langfuse' | 'default';

/** Result of resolving a single prompt */
export interface ResolvedPrompt {
  prompt: string;
  source: PromptSource;
  version?: number;
}

/** Result of resolving a category of prompts */
export interface ResolvedCategory<T extends Record<string, string>> {
  prompts: T;
  sources: Record<keyof T, PromptSource>;
}

/**
 * Centralizes prompt resolution across three layers.
 *
 * Layer 1: User overrides from settings.json promptCustomization
 * Layer 2: Langfuse managed prompts (fetched with label: "production")
 * Layer 3: Hardcoded defaults from @automaker/prompts
 */
export class PromptResolver {
  private label: string;
  private cacheTtlMs: number;
  private maxCacheSize: number;
  private resolvedCache = new Map<string, { result: ResolvedPrompt; expiresAt: number }>();

  constructor(
    private langfuseClient: LangfuseClient,
    options?: { label?: string; cacheTtlMs?: number; maxCacheSize?: number }
  ) {
    this.label = options?.label ?? 'production';
    this.cacheTtlMs = options?.cacheTtlMs ?? 5 * 60 * 1000; // 5 minutes
    this.maxCacheSize = options?.maxCacheSize ?? 200;
  }

  /**
   * Check if Langfuse is available for prompt fetching
   */
  isAvailable(): boolean {
    return this.langfuseClient.isAvailable();
  }

  /**
   * Resolve a single prompt by name using three-layer fallback.
   *
   * @param promptName - Dot-notation name (e.g., "autoMode.planningLite")
   * @param defaultValue - Hardcoded default from @automaker/prompts
   * @param userOverride - Optional user override from settings (already resolved enabled check)
   */
  async resolve(
    promptName: string,
    defaultValue: string,
    userOverride?: string
  ): Promise<ResolvedPrompt> {
    // Layer 1: User override takes highest priority
    if (userOverride !== undefined) {
      return { prompt: userOverride, source: 'user-override' };
    }

    // Layer 2: Langfuse managed prompt (cached)
    if (this.langfuseClient.isAvailable()) {
      const cacheKey = `${promptName}::${this.label}`;

      // Check cache first
      const cached = this.resolvedCache.get(cacheKey);
      if (cached && Date.now() < cached.expiresAt) {
        return cached.result;
      }

      try {
        const langfusePrompt = await this.langfuseClient.getPrompt(promptName, undefined, {
          label: this.label,
        });

        if (langfusePrompt) {
          logger.debug(`Resolved prompt from Langfuse: ${promptName} (v${langfusePrompt.version})`);
          const result: ResolvedPrompt = {
            prompt: langfusePrompt.prompt,
            source: 'langfuse',
            version: langfusePrompt.version,
          };

          // Cache the result
          this.cacheResult(cacheKey, result);
          return result;
        }
      } catch (error) {
        // Graceful degradation — fall through to default
        logger.debug(`Langfuse fetch failed for ${promptName}, using default`, error);
      }
    }

    // Layer 3: Hardcoded default
    return { prompt: defaultValue, source: 'default' };
  }

  /**
   * Resolve all prompts for a category using batch resolution.
   *
   * @param category - Category prefix (e.g., "autoMode")
   * @param defaults - Record of prompt keys to hardcoded defaults
   * @param userOverrides - Optional record of user overrides (already resolved enabled check)
   */
  async resolveCategory<T extends Record<string, string>>(
    category: string,
    defaults: T,
    userOverrides?: Partial<Record<keyof T, string>>
  ): Promise<ResolvedCategory<T>> {
    const prompts = {} as Record<keyof T, string>;
    const sources = {} as Record<keyof T, PromptSource>;

    // Resolve each prompt in the category concurrently
    const entries = Object.entries(defaults) as [keyof T & string, string][];
    const results = await Promise.all(
      entries.map(async ([key, defaultValue]) => {
        const langfuseName = `${category}.${key}`;
        const userOverride = userOverrides?.[key] as string | undefined;
        const result = await this.resolve(langfuseName, defaultValue, userOverride);
        return { key, result };
      })
    );

    for (const { key, result } of results) {
      prompts[key] = result.prompt as T[keyof T & string];
      sources[key] = result.source;
    }

    // Log summary for the category
    const sourceCount = Object.values(sources).reduce(
      (acc, s) => {
        acc[s] = (acc[s] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
    logger.debug(`Resolved ${category}: ${JSON.stringify(sourceCount)}`);

    return { prompts: prompts as T, sources };
  }

  /**
   * Store a resolved prompt in the cache, evicting oldest if full.
   */
  private cacheResult(key: string, result: ResolvedPrompt): void {
    // Evict oldest entry if at capacity
    if (this.resolvedCache.size >= this.maxCacheSize && !this.resolvedCache.has(key)) {
      const oldestKey = this.resolvedCache.keys().next().value;
      if (oldestKey !== undefined) {
        this.resolvedCache.delete(oldestKey);
      }
    }

    this.resolvedCache.set(key, {
      result,
      expiresAt: Date.now() + this.cacheTtlMs,
    });
  }

  /**
   * Clear the internal prompt cache. Useful after updating prompts in Langfuse.
   */
  clearCache(): void {
    this.resolvedCache.clear();
    logger.info('Prompt cache cleared');
  }

  /**
   * Get cache statistics for monitoring.
   */
  getCacheStats(): { size: number } {
    return { size: this.resolvedCache.size };
  }
}
