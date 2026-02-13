import type { PromptMetadata, PromptVersionConfig } from './versioning.js';
import { getRawPrompt } from './versioning.js';
import type { Langfuse } from 'langfuse';

/**
 * Cache entry with metadata
 */
interface CacheEntry {
  metadata: PromptMetadata;
  timestamp: number;
  ttl: number;
}

/**
 * Cache configuration options
 */
export interface CacheConfig {
  defaultTtl?: number; // Time to live in milliseconds (default: 5 minutes)
  maxSize?: number; // Maximum number of entries (default: 100)
}

/**
 * Local cache for fetched prompts
 */
export class PromptCache {
  private cache: Map<string, CacheEntry>;
  private readonly defaultTtl: number;
  private readonly maxSize: number;

  constructor(config: CacheConfig = {}) {
    this.cache = new Map();
    this.defaultTtl = config.defaultTtl ?? 5 * 60 * 1000; // 5 minutes
    this.maxSize = config.maxSize ?? 100;
  }

  /**
   * Generate a cache key from prompt configuration
   */
  private getCacheKey(config: PromptVersionConfig): string {
    const parts = [config.promptName];
    if (config.version !== undefined) {
      parts.push(`v${config.version}`);
    }
    if (config.label) {
      parts.push(`l:${config.label}`);
    }
    return parts.join('::');
  }

  /**
   * Check if a cache entry is still valid
   */
  private isValid(entry: CacheEntry): boolean {
    return Date.now() - entry.timestamp < entry.ttl;
  }

  /**
   * Get a prompt from cache or fetch from Langfuse
   */
  async get(client: Langfuse, config: PromptVersionConfig, ttl?: number): Promise<PromptMetadata> {
    const key = this.getCacheKey(config);
    const entry = this.cache.get(key);

    // Return cached entry if valid
    if (entry && this.isValid(entry)) {
      return entry.metadata;
    }

    // Fetch from Langfuse
    const metadata = await getRawPrompt(client, config);

    // Store in cache
    this.set(config, metadata, ttl);

    return metadata;
  }

  /**
   * Set a prompt in the cache
   */
  set(config: PromptVersionConfig, metadata: PromptMetadata, ttl?: number): void {
    const key = this.getCacheKey(config);

    // Evict oldest entry if cache is full
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      metadata,
      timestamp: Date.now(),
      ttl: ttl ?? this.defaultTtl,
    });
  }

  /**
   * Check if a prompt exists in cache and is valid
   */
  has(config: PromptVersionConfig): boolean {
    const key = this.getCacheKey(config);
    const entry = this.cache.get(key);
    return entry !== undefined && this.isValid(entry);
  }

  /**
   * Invalidate a specific prompt from cache
   */
  invalidate(config: PromptVersionConfig): boolean {
    const key = this.getCacheKey(config);
    return this.cache.delete(key);
  }

  /**
   * Invalidate all prompts with a specific name
   */
  invalidateByName(promptName: string): number {
    let count = 0;
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${promptName}::`)) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get the current cache size
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Remove expired entries from cache
   */
  cleanup(): number {
    let removed = 0;
    for (const [key, entry] of this.cache.entries()) {
      if (!this.isValid(entry)) {
        this.cache.delete(key);
        removed++;
      }
    }
    return removed;
  }

  /**
   * Get all cached prompt names
   */
  getKeys(): string[] {
    return Array.from(this.cache.keys());
  }
}

/**
 * Create a new prompt cache instance
 */
export function createPromptCache(config?: CacheConfig): PromptCache {
  return new PromptCache(config);
}
