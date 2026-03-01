import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted so the spy is available inside vi.mock (which is hoisted)
const mocks = vi.hoisted(() => ({
  chatAnthropicSpy: vi.fn(),
}));

// Mock @langchain/anthropic to avoid requiring ANTHROPIC_API_KEY in unit tests
vi.mock('@langchain/anthropic', () => ({
  ChatAnthropic: class MockChatAnthropic {
    _options: unknown;
    constructor(options: unknown) {
      mocks.chatAnthropicSpy(options);
      this._options = options;
    }
  },
}));

// Mock langfuse to avoid requiring credentials in unit tests
vi.mock('langfuse', () => ({
  Langfuse: class MockLangfuse {
    trace() {
      return { generation: vi.fn() };
    }
  },
}));

import { createLangChainModel, ProviderFactory } from '../src/langchain-adapter.js';
import type { FlowModelSettingsProvider } from '../src/langchain-adapter.js';

describe('createLangChainModel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('adapter returns correct model instance', () => {
    it('returns an object for claude-sonnet model', () => {
      const model = createLangChainModel({ model: 'claude-sonnet-4-6' });
      expect(model).toBeDefined();
      expect(mocks.chatAnthropicSpy).toHaveBeenCalledOnce();
      expect(mocks.chatAnthropicSpy).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'claude-sonnet-4-6' })
      );
    });

    it('returns an object for claude-haiku model', () => {
      const model = createLangChainModel({ model: 'claude-haiku-4-5-20251001' });
      expect(model).toBeDefined();
      expect(mocks.chatAnthropicSpy).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'claude-haiku-4-5-20251001' })
      );
    });

    it('returns an object for claude-opus model', () => {
      const model = createLangChainModel({ model: 'claude-opus-4-6' });
      expect(model).toBeDefined();
      expect(mocks.chatAnthropicSpy).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'claude-opus-4-6' })
      );
    });

    it('passes adapter options to the model constructor', () => {
      createLangChainModel(
        { model: 'claude-sonnet-4-6' },
        {
          temperature: 0.7,
          streaming: false,
          maxTokens: 1024,
        }
      );
      expect(mocks.chatAnthropicSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-sonnet-4-6',
          temperature: 0.7,
          streaming: false,
          maxTokens: 1024,
        })
      );
    });

    it('uses default temperature 0 and streaming true when no options provided', () => {
      createLangChainModel({ model: 'claude-sonnet-4-6' });
      expect(mocks.chatAnthropicSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0,
          streaming: true,
        })
      );
    });
  });

  describe('routes to correct provider', () => {
    it('routes claude models through ProviderFactory.getProviderForModel', () => {
      const spy = vi.spyOn(ProviderFactory, 'getProviderForModel');
      const entry = { model: 'claude-sonnet-4-6' } as const;

      createLangChainModel(entry);

      expect(spy).toHaveBeenCalledOnce();
      expect(spy).toHaveBeenCalledWith(entry, undefined, undefined);
      expect(mocks.chatAnthropicSpy).toHaveBeenCalledOnce();
    });

    it('passes options through ProviderFactory.getProviderForModel', () => {
      const spy = vi.spyOn(ProviderFactory, 'getProviderForModel');
      const entry = { model: 'claude-sonnet-4-6' } as const;
      const options = { temperature: 0.5 };

      createLangChainModel(entry, options);

      expect(spy).toHaveBeenCalledWith(entry, options, undefined);
    });
  });

  describe('flow model override', () => {
    it('uses flowModels[flowId] entry from settingsService when provided', () => {
      const settingsService: FlowModelSettingsProvider = {
        getPhaseModels: () =>
          ({
            flowModels: {
              'content-creation': { model: 'claude-haiku-4-5-20251001' },
            },
          }) as never,
      };

      createLangChainModel(
        { model: 'claude-sonnet-4-6' },
        undefined,
        settingsService,
        'content-creation'
      );

      expect(mocks.chatAnthropicSpy).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'claude-haiku-4-5-20251001' })
      );
    });

    it('falls back to supplied entry when flowId not in flowModels', () => {
      const settingsService: FlowModelSettingsProvider = {
        getPhaseModels: () =>
          ({
            flowModels: {},
          }) as never,
      };

      createLangChainModel(
        { model: 'claude-sonnet-4-6' },
        undefined,
        settingsService,
        'unknown-flow'
      );

      expect(mocks.chatAnthropicSpy).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'claude-sonnet-4-6' })
      );
    });

    it('falls back to supplied entry when settingsService has no getPhaseModels', () => {
      const settingsService: FlowModelSettingsProvider = {};

      createLangChainModel(
        { model: 'claude-sonnet-4-6' },
        undefined,
        settingsService,
        'content-creation'
      );

      expect(mocks.chatAnthropicSpy).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'claude-sonnet-4-6' })
      );
    });
  });

  describe('throws on unknown model', () => {
    it('throws for an unrecognized model ID', () => {
      expect(() => createLangChainModel({ model: 'unknown-model-xyz' as never })).toThrow(
        /Unsupported model: "unknown-model-xyz"/
      );
    });

    it('throws for a cursor model (not yet supported in LangChain adapter)', () => {
      expect(() => createLangChainModel({ model: 'cursor-auto' as never })).toThrow(
        /Unsupported model/
      );
    });

    it('throws for a groq model (not yet supported in LangChain adapter)', () => {
      expect(() => createLangChainModel({ model: 'groq/llama3' as never })).toThrow(
        /Unsupported model/
      );
    });
  });
});
