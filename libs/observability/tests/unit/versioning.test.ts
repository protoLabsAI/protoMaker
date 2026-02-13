import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getLangfuseClient,
  getRawPrompt,
  prefetchPrompts,
  pinPromptVersion,
  pinPromptLabel,
  type PromptVersionConfig,
} from '../../src/langfuse/versioning.js';
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

describe('versioning', () => {
  describe('getLangfuseClient', () => {
    it('should create a Langfuse client with credentials', () => {
      const client = getLangfuseClient('public-key', 'secret-key');
      expect(client).toBeDefined();
    });

    it('should create a Langfuse client with custom base URL', () => {
      const client = getLangfuseClient('public-key', 'secret-key', 'https://custom.langfuse.com');
      expect(client).toBeDefined();
    });
  });

  describe('getRawPrompt', () => {
    let mockClient: Langfuse;

    beforeEach(() => {
      mockClient = {
        getPrompt: vi.fn(),
      } as unknown as Langfuse;
    });

    it('should fetch a prompt by name', async () => {
      const mockPrompt = {
        version: 1,
        prompt: 'Hello {{name}}',
        config: { temperature: 0.7 },
      };

      vi.mocked(mockClient.getPrompt).mockResolvedValue(mockPrompt as any);

      const config: PromptVersionConfig = { promptName: 'greeting' };
      const result = await getRawPrompt(mockClient, config);

      expect(result).toEqual({
        name: 'greeting',
        version: 1,
        label: undefined,
        config: { temperature: 0.7 },
        compiledPrompt: 'Hello {{name}}',
      });

      expect(mockClient.getPrompt).toHaveBeenCalledWith('greeting', undefined, undefined);
    });

    it('should fetch a prompt with specific version', async () => {
      const mockPrompt = {
        version: 2,
        prompt: 'Hello {{name}}!',
        config: {},
      };

      vi.mocked(mockClient.getPrompt).mockResolvedValue(mockPrompt as any);

      const config: PromptVersionConfig = {
        promptName: 'greeting',
        version: 2,
      };
      const result = await getRawPrompt(mockClient, config);

      expect(result.version).toBe(2);
      expect(mockClient.getPrompt).toHaveBeenCalledWith('greeting', 2, undefined);
    });

    it('should fetch a prompt with label', async () => {
      const mockPrompt = {
        version: 3,
        prompt: 'Production greeting',
        config: {},
      };

      vi.mocked(mockClient.getPrompt).mockResolvedValue(mockPrompt as any);

      const config: PromptVersionConfig = {
        promptName: 'greeting',
        label: 'production',
      };
      const result = await getRawPrompt(mockClient, config);

      expect(result.label).toBe('production');
      expect(mockClient.getPrompt).toHaveBeenCalledWith('greeting', undefined, {
        label: 'production',
      });
    });

    it('should throw error if prompt not found', async () => {
      vi.mocked(mockClient.getPrompt).mockResolvedValue(null as any);

      const config: PromptVersionConfig = { promptName: 'missing' };

      await expect(getRawPrompt(mockClient, config)).rejects.toThrow('Prompt not found: missing');
    });

    it('should include version in error message', async () => {
      vi.mocked(mockClient.getPrompt).mockResolvedValue(null as any);

      const config: PromptVersionConfig = {
        promptName: 'missing',
        version: 5,
      };

      await expect(getRawPrompt(mockClient, config)).rejects.toThrow(
        'Prompt not found: missing (v5)'
      );
    });

    it('should include label in error message', async () => {
      vi.mocked(mockClient.getPrompt).mockResolvedValue(null as any);

      const config: PromptVersionConfig = {
        promptName: 'missing',
        label: 'staging',
      };

      await expect(getRawPrompt(mockClient, config)).rejects.toThrow(
        'Prompt not found: missing [staging]'
      );
    });
  });

  describe('prefetchPrompts', () => {
    let mockClient: Langfuse;

    beforeEach(() => {
      mockClient = {
        getPrompt: vi.fn(),
      } as unknown as Langfuse;
    });

    it('should fetch multiple prompts successfully', async () => {
      const mockPrompt1 = {
        version: 1,
        prompt: 'Prompt 1',
        config: {},
      };
      const mockPrompt2 = {
        version: 2,
        prompt: 'Prompt 2',
        config: {},
      };

      vi.mocked(mockClient.getPrompt)
        .mockResolvedValueOnce(mockPrompt1 as any)
        .mockResolvedValueOnce(mockPrompt2 as any);

      const configs: PromptVersionConfig[] = [{ promptName: 'prompt1' }, { promptName: 'prompt2' }];

      const results = await prefetchPrompts(mockClient, configs);

      expect(results.size).toBe(2);
      expect(results.get('prompt1')).toBeDefined();
      expect(results.get('prompt2')).toBeDefined();
    });

    it('should throw error if any prompt fails to fetch', async () => {
      const mockPrompt1 = {
        version: 1,
        prompt: 'Prompt 1',
        config: {},
      };

      vi.mocked(mockClient.getPrompt)
        .mockResolvedValueOnce(mockPrompt1 as any)
        .mockResolvedValueOnce(null as any);

      const configs: PromptVersionConfig[] = [{ promptName: 'prompt1' }, { promptName: 'missing' }];

      await expect(prefetchPrompts(mockClient, configs)).rejects.toThrow(
        'Failed to prefetch prompts'
      );
    });

    it('should return empty map for empty configs', async () => {
      const results = await prefetchPrompts(mockClient, []);
      expect(results.size).toBe(0);
    });
  });

  describe('pinPromptVersion', () => {
    it('should create config with pinned version', () => {
      const config = pinPromptVersion('test-prompt', 5);
      expect(config).toEqual({
        promptName: 'test-prompt',
        version: 5,
      });
    });
  });

  describe('pinPromptLabel', () => {
    it('should create config with pinned label', () => {
      const config = pinPromptLabel('test-prompt', 'production');
      expect(config).toEqual({
        promptName: 'test-prompt',
        label: 'production',
      });
    });
  });
});
