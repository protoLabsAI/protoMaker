import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PromptCache, createPromptCache, type CacheConfig } from '../../src/langfuse/cache.js';
import type { PromptVersionConfig, PromptMetadata } from '../../src/langfuse/versioning.js';
import type { Langfuse } from 'langfuse';

// Mock Langfuse
vi.mock('langfuse', () => {
  const MockLangfuse = class {
    constructor() {
      // @ts-expect-error - mocking
      this.getPrompt = vi.fn();
    }
  };
  return {
    Langfuse: MockLangfuse,
  };
});

// Mock versioning module
vi.mock('../../src/langfuse/versioning.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/langfuse/versioning.js')>(
    '../../src/langfuse/versioning.js'
  );
  return {
    ...actual,
    getRawPrompt: vi.fn(),
  };
});

describe('cache', () => {
  let mockClient: Langfuse;

  beforeEach(() => {
    mockClient = {
      getPrompt: vi.fn(),
    } as unknown as Langfuse;
    vi.clearAllMocks();
  });

  describe('PromptCache', () => {
    describe('constructor', () => {
      it('should create cache with default config', () => {
        const cache = new PromptCache();
        expect(cache.size()).toBe(0);
      });

      it('should create cache with custom TTL', () => {
        const cache = new PromptCache({ defaultTtl: 1000 });
        expect(cache.size()).toBe(0);
      });

      it('should create cache with custom max size', () => {
        const cache = new PromptCache({ maxSize: 10 });
        expect(cache.size()).toBe(0);
      });
    });

    describe('get', () => {
      it('should fetch and cache a prompt', async () => {
        const { getRawPrompt } = await import('../../src/langfuse/versioning.js');

        const mockMetadata: PromptMetadata = {
          name: 'test-prompt',
          version: 1,
          config: {},
          compiledPrompt: 'Hello',
        };

        vi.mocked(getRawPrompt).mockResolvedValue(mockMetadata);

        const cache = new PromptCache();
        const config: PromptVersionConfig = { promptName: 'test-prompt' };

        const result = await cache.get(mockClient, config);

        expect(result).toEqual(mockMetadata);
        expect(getRawPrompt).toHaveBeenCalledWith(mockClient, config);
        expect(cache.has(config)).toBe(true);
      });

      it('should return cached prompt on second call', async () => {
        const { getRawPrompt } = await import('../../src/langfuse/versioning.js');

        const mockMetadata: PromptMetadata = {
          name: 'test-prompt',
          version: 1,
          config: {},
          compiledPrompt: 'Hello',
        };

        vi.mocked(getRawPrompt).mockResolvedValue(mockMetadata);

        const cache = new PromptCache();
        const config: PromptVersionConfig = { promptName: 'test-prompt' };

        // First call - should fetch
        await cache.get(mockClient, config);
        expect(getRawPrompt).toHaveBeenCalledTimes(1);

        // Second call - should use cache
        const result = await cache.get(mockClient, config);
        expect(result).toEqual(mockMetadata);
        expect(getRawPrompt).toHaveBeenCalledTimes(1); // Still 1
      });

      it('should refetch expired entries', async () => {
        const { getRawPrompt } = await import('../../src/langfuse/versioning.js');

        const mockMetadata: PromptMetadata = {
          name: 'test-prompt',
          version: 1,
          config: {},
          compiledPrompt: 'Hello',
        };

        vi.mocked(getRawPrompt).mockResolvedValue(mockMetadata);

        const cache = new PromptCache({ defaultTtl: 10 }); // 10ms TTL
        const config: PromptVersionConfig = { promptName: 'test-prompt' };

        // First call
        await cache.get(mockClient, config);
        expect(getRawPrompt).toHaveBeenCalledTimes(1);

        // Wait for expiry
        await new Promise((resolve) => setTimeout(resolve, 20));

        // Second call - should refetch
        await cache.get(mockClient, config);
        expect(getRawPrompt).toHaveBeenCalledTimes(2);
      });

      it('should cache different versions separately', async () => {
        const { getRawPrompt } = await import('../../src/langfuse/versioning.js');

        const mockMetadata1: PromptMetadata = {
          name: 'test-prompt',
          version: 1,
          config: {},
          compiledPrompt: 'Hello v1',
        };

        const mockMetadata2: PromptMetadata = {
          name: 'test-prompt',
          version: 2,
          config: {},
          compiledPrompt: 'Hello v2',
        };

        vi.mocked(getRawPrompt)
          .mockResolvedValueOnce(mockMetadata1)
          .mockResolvedValueOnce(mockMetadata2);

        const cache = new PromptCache();

        const result1 = await cache.get(mockClient, { promptName: 'test-prompt', version: 1 });
        const result2 = await cache.get(mockClient, { promptName: 'test-prompt', version: 2 });

        expect(result1.compiledPrompt).toBe('Hello v1');
        expect(result2.compiledPrompt).toBe('Hello v2');
        expect(cache.size()).toBe(2);
      });

      it('should cache different labels separately', async () => {
        const { getRawPrompt } = await import('../../src/langfuse/versioning.js');

        const mockMetadata1: PromptMetadata = {
          name: 'test-prompt',
          version: 1,
          label: 'dev',
          config: {},
          compiledPrompt: 'Hello dev',
        };

        const mockMetadata2: PromptMetadata = {
          name: 'test-prompt',
          version: 2,
          label: 'prod',
          config: {},
          compiledPrompt: 'Hello prod',
        };

        vi.mocked(getRawPrompt)
          .mockResolvedValueOnce(mockMetadata1)
          .mockResolvedValueOnce(mockMetadata2);

        const cache = new PromptCache();

        const result1 = await cache.get(mockClient, { promptName: 'test-prompt', label: 'dev' });
        const result2 = await cache.get(mockClient, { promptName: 'test-prompt', label: 'prod' });

        expect(result1.compiledPrompt).toBe('Hello dev');
        expect(result2.compiledPrompt).toBe('Hello prod');
        expect(cache.size()).toBe(2);
      });
    });

    describe('set', () => {
      it('should store a prompt in cache', () => {
        const cache = new PromptCache();
        const config: PromptVersionConfig = { promptName: 'test-prompt' };
        const metadata: PromptMetadata = {
          name: 'test-prompt',
          version: 1,
          config: {},
          compiledPrompt: 'Hello',
        };

        cache.set(config, metadata);

        expect(cache.has(config)).toBe(true);
        expect(cache.size()).toBe(1);
      });

      it('should evict oldest entry when cache is full', () => {
        const cache = new PromptCache({ maxSize: 2 });

        const metadata: PromptMetadata = {
          name: 'test',
          version: 1,
          config: {},
          compiledPrompt: 'Hello',
        };

        // Fill cache
        cache.set({ promptName: 'prompt1' }, { ...metadata, name: 'prompt1' });
        cache.set({ promptName: 'prompt2' }, { ...metadata, name: 'prompt2' });
        expect(cache.size()).toBe(2);

        // Add third entry - should evict first
        cache.set({ promptName: 'prompt3' }, { ...metadata, name: 'prompt3' });
        expect(cache.size()).toBe(2);
        expect(cache.has({ promptName: 'prompt1' })).toBe(false);
        expect(cache.has({ promptName: 'prompt2' })).toBe(true);
        expect(cache.has({ promptName: 'prompt3' })).toBe(true);
      });

      it('should use custom TTL when provided', async () => {
        const cache = new PromptCache({ defaultTtl: 1000 });
        const config: PromptVersionConfig = { promptName: 'test-prompt' };
        const metadata: PromptMetadata = {
          name: 'test-prompt',
          version: 1,
          config: {},
          compiledPrompt: 'Hello',
        };

        cache.set(config, metadata, 10); // 10ms TTL
        expect(cache.has(config)).toBe(true);

        // Wait for expiry
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(cache.has(config)).toBe(false);
      });
    });

    describe('has', () => {
      it('should return false for non-existent entry', () => {
        const cache = new PromptCache();
        expect(cache.has({ promptName: 'missing' })).toBe(false);
      });

      it('should return true for valid cached entry', () => {
        const cache = new PromptCache();
        const config: PromptVersionConfig = { promptName: 'test-prompt' };
        const metadata: PromptMetadata = {
          name: 'test-prompt',
          version: 1,
          config: {},
          compiledPrompt: 'Hello',
        };

        cache.set(config, metadata);
        expect(cache.has(config)).toBe(true);
      });

      it('should return false for expired entry', async () => {
        const cache = new PromptCache({ defaultTtl: 10 });
        const config: PromptVersionConfig = { promptName: 'test-prompt' };
        const metadata: PromptMetadata = {
          name: 'test-prompt',
          version: 1,
          config: {},
          compiledPrompt: 'Hello',
        };

        cache.set(config, metadata);
        expect(cache.has(config)).toBe(true);

        // Wait for expiry
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(cache.has(config)).toBe(false);
      });
    });

    describe('invalidate', () => {
      it('should remove a specific entry from cache', () => {
        const cache = new PromptCache();
        const config: PromptVersionConfig = { promptName: 'test-prompt' };
        const metadata: PromptMetadata = {
          name: 'test-prompt',
          version: 1,
          config: {},
          compiledPrompt: 'Hello',
        };

        cache.set(config, metadata);
        expect(cache.has(config)).toBe(true);

        const removed = cache.invalidate(config);
        expect(removed).toBe(true);
        expect(cache.has(config)).toBe(false);
      });

      it('should return false when removing non-existent entry', () => {
        const cache = new PromptCache();
        const removed = cache.invalidate({ promptName: 'missing' });
        expect(removed).toBe(false);
      });

      it('should only remove the specific version', () => {
        const cache = new PromptCache();
        const metadata: PromptMetadata = {
          name: 'test-prompt',
          version: 1,
          config: {},
          compiledPrompt: 'Hello',
        };

        cache.set({ promptName: 'test-prompt', version: 1 }, metadata);
        cache.set({ promptName: 'test-prompt', version: 2 }, { ...metadata, version: 2 });

        cache.invalidate({ promptName: 'test-prompt', version: 1 });

        expect(cache.has({ promptName: 'test-prompt', version: 1 })).toBe(false);
        expect(cache.has({ promptName: 'test-prompt', version: 2 })).toBe(true);
      });
    });

    describe('invalidateByName', () => {
      it('should remove all versions of a prompt', () => {
        const cache = new PromptCache();
        const metadata: PromptMetadata = {
          name: 'test-prompt',
          version: 1,
          config: {},
          compiledPrompt: 'Hello',
        };

        cache.set({ promptName: 'test-prompt', version: 1 }, metadata);
        cache.set({ promptName: 'test-prompt', version: 2 }, { ...metadata, version: 2 });
        cache.set({ promptName: 'other-prompt' }, { ...metadata, name: 'other-prompt' });

        const removed = cache.invalidateByName('test-prompt');

        expect(removed).toBe(2);
        expect(cache.has({ promptName: 'test-prompt', version: 1 })).toBe(false);
        expect(cache.has({ promptName: 'test-prompt', version: 2 })).toBe(false);
        expect(cache.has({ promptName: 'other-prompt' })).toBe(true);
      });

      it('should return 0 when no entries match', () => {
        const cache = new PromptCache();
        const removed = cache.invalidateByName('missing');
        expect(removed).toBe(0);
      });
    });

    describe('clear', () => {
      it('should remove all entries from cache', () => {
        const cache = new PromptCache();
        const metadata: PromptMetadata = {
          name: 'test',
          version: 1,
          config: {},
          compiledPrompt: 'Hello',
        };

        cache.set({ promptName: 'prompt1' }, metadata);
        cache.set({ promptName: 'prompt2' }, metadata);
        expect(cache.size()).toBe(2);

        cache.clear();
        expect(cache.size()).toBe(0);
      });
    });

    describe('size', () => {
      it('should return the number of cached entries', () => {
        const cache = new PromptCache();
        expect(cache.size()).toBe(0);

        const metadata: PromptMetadata = {
          name: 'test',
          version: 1,
          config: {},
          compiledPrompt: 'Hello',
        };

        cache.set({ promptName: 'prompt1' }, metadata);
        expect(cache.size()).toBe(1);

        cache.set({ promptName: 'prompt2' }, metadata);
        expect(cache.size()).toBe(2);
      });
    });

    describe('cleanup', () => {
      it('should remove expired entries', async () => {
        const cache = new PromptCache({ defaultTtl: 10 });
        const metadata: PromptMetadata = {
          name: 'test',
          version: 1,
          config: {},
          compiledPrompt: 'Hello',
        };

        // Add entries with short TTL
        cache.set({ promptName: 'prompt1' }, metadata);
        cache.set({ promptName: 'prompt2' }, metadata);

        // Add entry with long TTL
        cache.set({ promptName: 'prompt3' }, metadata, 10000);

        expect(cache.size()).toBe(3);

        // Wait for short TTL entries to expire
        await new Promise((resolve) => setTimeout(resolve, 20));

        const removed = cache.cleanup();
        expect(removed).toBe(2);
        expect(cache.size()).toBe(1);
        expect(cache.has({ promptName: 'prompt3' })).toBe(true);
      });

      it('should return 0 when no entries are expired', () => {
        const cache = new PromptCache();
        const metadata: PromptMetadata = {
          name: 'test',
          version: 1,
          config: {},
          compiledPrompt: 'Hello',
        };

        cache.set({ promptName: 'prompt1' }, metadata);

        const removed = cache.cleanup();
        expect(removed).toBe(0);
        expect(cache.size()).toBe(1);
      });
    });

    describe('getKeys', () => {
      it('should return all cache keys', () => {
        const cache = new PromptCache();
        const metadata: PromptMetadata = {
          name: 'test',
          version: 1,
          config: {},
          compiledPrompt: 'Hello',
        };

        cache.set({ promptName: 'prompt1' }, metadata);
        cache.set({ promptName: 'prompt2', version: 1 }, metadata);
        cache.set({ promptName: 'prompt3', label: 'prod' }, metadata);

        const keys = cache.getKeys();
        expect(keys).toHaveLength(3);
        expect(keys).toContain('prompt1');
        expect(keys).toContain('prompt2::v1');
        expect(keys).toContain('prompt3::l:prod');
      });

      it('should return empty array for empty cache', () => {
        const cache = new PromptCache();
        expect(cache.getKeys()).toEqual([]);
      });
    });
  });

  describe('createPromptCache', () => {
    it('should create a new PromptCache instance', () => {
      const cache = createPromptCache();
      expect(cache).toBeInstanceOf(PromptCache);
      expect(cache.size()).toBe(0);
    });

    it('should pass config to PromptCache', () => {
      const config: CacheConfig = { defaultTtl: 1000, maxSize: 50 };
      const cache = createPromptCache(config);
      expect(cache).toBeInstanceOf(PromptCache);
    });
  });
});
