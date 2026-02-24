/**
 * Integration tests for BedrockProvider
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BedrockProvider } from '../../src/server/providers/bedrock.js';
import type { ExecuteOptions } from '@protolabs-ai/types';

describe('BedrockProvider', () => {
  let provider: BedrockProvider;

  beforeEach(() => {
    provider = new BedrockProvider({
      region: process.env.AWS_REGION || 'us-east-1',
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    });
  });

  it('should have correct provider name', () => {
    expect(provider.getName()).toBe('bedrock');
  });

  it('should detect installation status', async () => {
    const status = await provider.detectInstallation();
    expect(status).toHaveProperty('installed');
    expect(status).toHaveProperty('method');

    if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
      expect(status.installed).toBe(true);
      expect(status.authenticated).toBe(true);
    }
  });

  it('should return available models', () => {
    const models = provider.getAvailableModels();
    expect(Array.isArray(models)).toBe(true);
    expect(models.length).toBeGreaterThan(0);

    const claudeModel = models.find((m) => m.id.includes('claude'));
    expect(claudeModel).toBeDefined();
    expect(claudeModel?.provider).toBe('bedrock');
    expect(claudeModel?.modelString).toBeDefined();
    expect(claudeModel?.description).toBeDefined();
    expect(claudeModel?.supportsVision).toBe(true);
  });

  it('should validate config correctly', () => {
    const result = provider.validateConfig();
    expect(result).toHaveProperty('valid');
    expect(result).toHaveProperty('errors');
    expect(result).toHaveProperty('warnings');

    if (
      process.env.AWS_ACCESS_KEY_ID &&
      process.env.AWS_SECRET_ACCESS_KEY &&
      process.env.AWS_REGION
    ) {
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    }
  });

  it('should support text, vision, and streaming features', () => {
    expect(provider.supportsFeature('text')).toBe(true);
    expect(provider.supportsFeature('vision')).toBe(true);
    expect(provider.supportsFeature('streaming')).toBe(true);
    expect(provider.supportsFeature('tools')).toBe(true);
  });

  it('should execute query and stream responses', async () => {
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      console.log('Skipping query test - AWS credentials not set');
      return;
    }

    const options: ExecuteOptions = {
      model: 'anthropic.claude-3-haiku-20240307-v1:0',
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
  }, 30000);
});
