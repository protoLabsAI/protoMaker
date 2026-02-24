import { describe, it, expect, beforeEach } from 'vitest';
import { FakeProvider } from '@/providers/fake-provider.js';
import type { ExecuteOptions } from '@protolabs-ai/types';

describe('fake-provider.ts', () => {
  let provider: FakeProvider;

  beforeEach(() => {
    provider = new FakeProvider();
  });

  describe('constructor', () => {
    it('should initialize with default response', () => {
      const fakeProvider = new FakeProvider();
      expect(fakeProvider).toBeDefined();
      expect(fakeProvider.getName()).toBe('fake');
    });

    it('should initialize with custom response', () => {
      const customProvider = new FakeProvider({ responses: 'Custom response' });
      expect(customProvider.getName()).toBe('fake');
    });
  });

  describe('getName', () => {
    it('should return "fake" as provider name', () => {
      expect(provider.getName()).toBe('fake');
    });
  });

  describe('executeQuery', () => {
    it('should return an async generator', async () => {
      const options: ExecuteOptions = {
        prompt: 'test prompt',
        projectDirectory: '/test',
      };

      const generator = provider.executeQuery(options);
      expect(generator[Symbol.asyncIterator]).toBeDefined();
    });

    it('should yield assistant message with default response', async () => {
      const options: ExecuteOptions = {
        prompt: 'test prompt',
        projectDirectory: '/test',
      };

      const messages: any[] = [];
      for await (const msg of provider.executeQuery(options)) {
        messages.push(msg);
      }

      expect(messages.length).toBeGreaterThan(0);
      const assistantMsg = messages.find((m) => m.type === 'assistant');
      expect(assistantMsg).toBeDefined();
      expect(assistantMsg?.message.role).toBe('assistant');
      expect(assistantMsg?.message.content[0].type).toBe('text');
    });

    it('should yield result message', async () => {
      const options: ExecuteOptions = {
        prompt: 'test prompt',
        projectDirectory: '/test',
      };

      const messages: any[] = [];
      for await (const msg of provider.executeQuery(options)) {
        messages.push(msg);
      }

      const resultMsg = messages.find((m) => m.type === 'result');
      expect(resultMsg).toBeDefined();
      expect(resultMsg?.result).toBe('success');
    });

    it('should return custom response', async () => {
      const customProvider = new FakeProvider({ responses: 'Custom text' });
      const options: ExecuteOptions = {
        prompt: 'test',
        projectDirectory: '/test',
      };

      const messages: any[] = [];
      for await (const msg of customProvider.executeQuery(options)) {
        messages.push(msg);
      }

      const assistantMsg = messages.find((m) => m.type === 'assistant');
      expect(assistantMsg?.message.content[0].text).toBe('Custom text');
    });

    it('should cycle through multiple responses', async () => {
      const responses = ['Response A', 'Response B', 'Response C'];
      const customProvider = new FakeProvider({ responses });
      const options: ExecuteOptions = {
        prompt: 'test',
        projectDirectory: '/test',
      };

      const getText = async (p: FakeProvider) => {
        const messages: any[] = [];
        for await (const msg of p.executeQuery(options)) {
          messages.push(msg);
        }
        return messages.find((m) => m.type === 'assistant')?.message.content[0].text;
      };

      const text1 = await getText(customProvider);
      const text2 = await getText(customProvider);
      const text3 = await getText(customProvider);
      const text4 = await getText(customProvider);

      expect(text1).toBe('Response A');
      expect(text2).toBe('Response B');
      expect(text3).toBe('Response C');
      expect(text4).toBe('Response A');
    });
  });

  describe('detectInstallation', () => {
    it('should return installed status', async () => {
      const status = await provider.detectInstallation();

      expect(status.installed).toBe(true);
      expect(status.method).toBe('sdk');
      expect(status.authenticated).toBe(true);
      expect(status.hasApiKey).toBe(false);
    });
  });

  describe('getAvailableModels', () => {
    it('should return array of available models', () => {
      const models = provider.getAvailableModels();

      expect(Array.isArray(models)).toBe(true);
      expect(models.length).toBe(2);
    });

    it('should include fake-chat model', () => {
      const models = provider.getAvailableModels();
      const fakeChat = models.find((m) => m.modelString === 'fake-chat');

      expect(fakeChat).toBeDefined();
      expect(fakeChat?.provider).toBe('fake');
    });

    it('should include fake-list model', () => {
      const models = provider.getAvailableModels();
      const fakeList = models.find((m) => m.modelString === 'fake-list');

      expect(fakeList).toBeDefined();
      expect(fakeList?.provider).toBe('fake');
    });
  });

  describe('validateConfig', () => {
    it('should validate successfully', () => {
      const result = provider.validateConfig();

      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
      expect(Array.isArray(result.warnings)).toBe(true);
    });
  });

  describe('supportsFeature', () => {
    it('should support text feature', () => {
      expect(provider.supportsFeature('text')).toBe(true);
    });

    it('should support streaming feature', () => {
      expect(provider.supportsFeature('streaming')).toBe(true);
    });

    it('should not support vision', () => {
      expect(provider.supportsFeature('vision')).toBe(false);
    });

    it('should not support tools', () => {
      expect(provider.supportsFeature('tools')).toBe(false);
    });
  });

  describe('integration', () => {
    it('should handle complete query-response cycle', async () => {
      const customProvider = new FakeProvider({
        responses: 'Integration test response',
      });

      const status = await customProvider.detectInstallation();
      expect(status.installed).toBe(true);

      const models = customProvider.getAvailableModels();
      expect(models.length).toBeGreaterThan(0);

      const validation = customProvider.validateConfig();
      expect(validation.valid).toBe(true);

      const options: ExecuteOptions = {
        prompt: 'Integration test prompt',
        projectDirectory: '/test',
        model: 'fake-chat',
      };

      const messages: any[] = [];
      for await (const msg of customProvider.executeQuery(options)) {
        messages.push(msg);
      }

      expect(messages.length).toBe(2);
      expect(messages[0].type).toBe('assistant');
      expect(messages[1].type).toBe('result');
    });

    it('should work without API keys', async () => {
      const newProvider = new FakeProvider();

      const status = await newProvider.detectInstallation();
      expect(status.hasApiKey).toBe(false);
      expect(status.authenticated).toBe(true);

      const options: ExecuteOptions = {
        prompt: 'test',
        projectDirectory: '/test',
      };

      const messages: any[] = [];
      for await (const msg of newProvider.executeQuery(options)) {
        messages.push(msg);
      }

      expect(messages.length).toBeGreaterThan(0);
    });
  });
});
