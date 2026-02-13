/**
 * Mock Anthropic API for testing
 *
 * Provides mock implementations to test AnthropicProvider without making real API calls.
 */

import { vi } from 'vitest';

/**
 * Mock ChatAnthropic class
 */
export class MockChatAnthropic {
  model: string;
  apiKey?: string;
  temperature?: number;
  maxTokens?: number;

  constructor(config: {
    model: string;
    apiKey?: string;
    temperature?: number;
    maxTokens?: number;
  }) {
    this.model = config.model;
    this.apiKey = config.apiKey;
    this.temperature = config.temperature;
    this.maxTokens = config.maxTokens;
  }

  async invoke(messages: Array<{ role: string; content: string }>) {
    // Simulate API call
    if (!this.apiKey || this.apiKey === 'invalid-key') {
      throw new Error('Invalid API key');
    }

    return {
      role: 'assistant',
      content: 'Mock response from Claude',
    };
  }
}

/**
 * Create a mock ChatAnthropic module
 */
export function createMockAnthropicModule() {
  return {
    ChatAnthropic: MockChatAnthropic,
  };
}

/**
 * Setup mocks for Anthropic provider tests
 */
export function setupAnthropicMocks() {
  // Mock the @langchain/anthropic module
  vi.mock('@langchain/anthropic', () => createMockAnthropicModule());
}

/**
 * Reset all mocks
 */
export function resetAnthropicMocks() {
  vi.clearAllMocks();
}
