/**
 * Integration tests for GroqProvider
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { GroqProvider } from '../../src/server/providers/groq.js';
import type { ExecuteOptions } from '@protolabs-ai/types';

describe('GroqProvider', () => {
  let provider: GroqProvider;

  beforeEach(() => {
    provider = new GroqProvider({
      apiKey: process.env.GROQ_API_KEY,
    });
  });

  it('should have correct provider name', () => {
    expect(provider.getName()).toBe('groq');
  });

  it('should detect installation status', async () => {
    const status = await provider.detectInstallation();
    expect(status).toHaveProperty('installed');
    expect(status).toHaveProperty('method');

    if (process.env.GROQ_API_KEY) {
      expect(status.installed).toBe(true);
      expect(status.hasApiKey).toBe(true);
    }
  });

  it('should return available models', () => {
    const models = provider.getAvailableModels();
    expect(Array.isArray(models)).toBe(true);
    expect(models.length).toBeGreaterThan(0);

    const llamaModel = models.find((m) => m.id.includes('llama'));
    expect(llamaModel).toBeDefined();
    expect(llamaModel?.provider).toBe('groq');
    expect(llamaModel?.modelString).toBeDefined();
    expect(llamaModel?.description).toBeDefined();
  });

  it('should validate config correctly', () => {
    const result = provider.validateConfig();
    expect(result).toHaveProperty('valid');
    expect(result).toHaveProperty('errors');
    expect(result).toHaveProperty('warnings');

    if (process.env.GROQ_API_KEY) {
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    }
  });

  it('should support text and streaming features', () => {
    expect(provider.supportsFeature('text')).toBe(true);
    expect(provider.supportsFeature('streaming')).toBe(true);
    expect(provider.supportsFeature('tools')).toBe(true);
    expect(provider.supportsFeature('vision')).toBe(false);
  });

  it.skipIf(!process.env.GROQ_API_KEY)(
    'should execute query and stream responses',
    async () => {
      const options: ExecuteOptions = {
        model: 'llama-3.1-8b-instant',
        prompt: 'Say "test successful" and nothing else.',
        cwd: process.cwd(),
      };

      let foundResult = false;
      for await (const message of provider.executeQuery(options)) {
        if (message.type === 'result' && message.result) {
          foundResult = true;
          expect(message.result.toLowerCase()).toContain('test');
        }
      }

      expect(foundResult).toBe(true);
    },
    30000
  );
});
