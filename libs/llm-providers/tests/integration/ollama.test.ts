/**
 * Integration tests for OllamaProvider
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { OllamaProvider } from '../../src/server/providers/ollama.js';
import type { ExecuteOptions } from '@protolabs-ai/types';

describe('OllamaProvider', () => {
  let provider: OllamaProvider;

  beforeEach(() => {
    provider = new OllamaProvider({
      host: process.env.OLLAMA_HOST || 'http://localhost:11434',
    });
  });

  it('should have correct provider name', () => {
    expect(provider.getName()).toBe('ollama');
  });

  it('should detect installation status', async () => {
    const status = await provider.detectInstallation();
    expect(status).toHaveProperty('installed');
    expect(status).toHaveProperty('method');
    // Installation status depends on whether Ollama is running locally
  });

  it('should return available models', () => {
    const models = provider.getAvailableModels();
    expect(Array.isArray(models)).toBe(true);
    expect(models.length).toBeGreaterThan(0);

    const model = models[0];
    expect(model).toHaveProperty('id');
    expect(model).toHaveProperty('name');
    expect(model).toHaveProperty('modelString');
    expect(model).toHaveProperty('description');
    expect(model.provider).toBe('ollama');
  });

  it('should validate config correctly', () => {
    const result = provider.validateConfig();
    expect(result).toHaveProperty('valid');
    expect(result).toHaveProperty('errors');
    expect(result).toHaveProperty('warnings');
    expect(result.valid).toBe(true);
  });

  it('should support text, streaming, and local features', () => {
    expect(provider.supportsFeature('text')).toBe(true);
    expect(provider.supportsFeature('streaming')).toBe(true);
    expect(provider.supportsFeature('local')).toBe(true);
    expect(provider.supportsFeature('tools')).toBe(true);
    expect(provider.supportsFeature('vision')).toBe(false);
  });

  it('should execute query with local models', async () => {
    const status = await provider.detectInstallation();
    if (!status.installed) {
      console.log('Skipping query test - Ollama not running');
      return;
    }

    const models = await provider.getInstalledModels();
    if (models.length === 0) {
      console.log('Skipping query test - No models available');
      return;
    }

    const options: ExecuteOptions = {
      model: models[0].id,
      prompt: 'Say "test successful" and nothing else.',
      cwd: process.cwd(),
    };

    let foundResult = false;
    for await (const message of provider.executeQuery(options)) {
      if (message.type === 'result' && message.result) {
        foundResult = true;
        expect(message.result.length).toBeGreaterThan(0);
      }
    }

    expect(foundResult).toBe(true);
  }, 60000);
});
