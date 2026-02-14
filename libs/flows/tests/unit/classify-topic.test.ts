/**
 * Tests for classify-topic node
 *
 * Covers:
 * - Normal case: valid PRD classification
 * - Malformed LLM output handling
 * - Model fallback trigger
 * - All complexity levels and distillation depths
 */

import { describe, it, expect } from 'vitest';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { BaseMessage } from '@langchain/core/messages';
import { AIMessage } from '@langchain/core/messages';
import {
  classifyTopicNode,
  type ClassifyTopicState,
  type ClassificationResult,
} from '../../src/antagonistic-review/nodes/classify-topic.js';

/**
 * TestChatModel - Mock LLM that returns predefined responses
 */
class TestChatModel extends BaseChatModel {
  private responses: string[];
  private currentIndex = 0;

  constructor(responses: string[]) {
    super({});
    this.responses = responses;
  }

  _llmType(): string {
    return 'test';
  }

  async _generate(_messages: BaseMessage[]): Promise<any> {
    if (this.currentIndex >= this.responses.length) {
      throw new Error('TestChatModel: No more responses available');
    }

    const response = this.responses[this.currentIndex];
    this.currentIndex++;

    return {
      generations: [
        {
          text: response,
          message: new AIMessage(response),
        },
      ],
    };
  }
}

describe('classify-topic node', () => {
  describe('normal case', () => {
    it('should classify small complexity PRD with depth 0', async () => {
      const smartModel = new TestChatModel([
        JSON.stringify({
          complexity: 'small',
          distillationDepth: 0,
          reasoning: 'Simple bug fix, low risk, minimal impact',
        }),
      ]);

      const state: ClassifyTopicState = {
        prd: 'Fix typo in error message for login form',
        smartModel,
      };

      const result = await classifyTopicNode(state);

      expect(result.classification).toBeDefined();
      expect(result.classification?.complexity).toBe('small');
      expect(result.classification?.distillationDepth).toBe(0);
      expect(result.classification?.reasoning).toBeTruthy();
    });

    it('should classify medium complexity PRD with depth 1', async () => {
      const smartModel = new TestChatModel([
        JSON.stringify({
          complexity: 'medium',
          distillationDepth: 1,
          reasoning: 'Standard feature requiring API and UI changes',
        }),
      ]);

      const state: ClassifyTopicState = {
        prd: 'Add user profile editing with avatar upload and bio field',
        smartModel,
      };

      const result = await classifyTopicNode(state);

      expect(result.classification).toBeDefined();
      expect(result.classification?.complexity).toBe('medium');
      expect(result.classification?.distillationDepth).toBe(1);
    });

    it('should classify large complexity PRD with depth 2', async () => {
      const smartModel = new TestChatModel([
        JSON.stringify({
          complexity: 'large',
          distillationDepth: 2,
          reasoning: 'Major feature with multiple service integration and data migration',
        }),
      ]);

      const state: ClassifyTopicState = {
        prd: 'Implement multi-tenant workspace system with role-based access control',
        smartModel,
      };

      const result = await classifyTopicNode(state);

      expect(result.classification).toBeDefined();
      expect(result.classification?.complexity).toBe('large');
      expect(result.classification?.distillationDepth).toBe(2);
    });

    it('should classify architectural complexity PRD with depth 2', async () => {
      const smartModel = new TestChatModel([
        JSON.stringify({
          complexity: 'architectural',
          distillationDepth: 2,
          reasoning: 'System-wide migration affecting core database schema and all services',
        }),
      ]);

      const state: ClassifyTopicState = {
        prd: 'Migrate from monolithic architecture to microservices with event-driven communication',
        smartModel,
      };

      const result = await classifyTopicNode(state);

      expect(result.classification).toBeDefined();
      expect(result.classification?.complexity).toBe('architectural');
      expect(result.classification?.distillationDepth).toBe(2);
    });

    it('should handle JSON in markdown code blocks', async () => {
      const smartModel = new TestChatModel([
        '```json\n' +
          JSON.stringify({
            complexity: 'small',
            distillationDepth: 0,
            reasoning: 'Minor update',
          }) +
          '\n```',
      ]);

      const state: ClassifyTopicState = {
        prd: 'Update help text in settings page',
        smartModel,
      };

      const result = await classifyTopicNode(state);

      expect(result.classification).toBeDefined();
      expect(result.classification?.complexity).toBe('small');
    });
  });

  describe('malformed LLM output', () => {
    it('should throw error on invalid JSON', async () => {
      const smartModel = new TestChatModel(['This is not JSON at all']);

      const state: ClassifyTopicState = {
        prd: 'Some PRD',
        smartModel,
      };

      await expect(classifyTopicNode(state)).rejects.toThrow('Failed to parse JSON');
    });

    it('should throw error on missing required fields', async () => {
      const smartModel = new TestChatModel([
        JSON.stringify({
          complexity: 'small',
          // missing distillationDepth and reasoning
        }),
      ]);

      const state: ClassifyTopicState = {
        prd: 'Some PRD',
        smartModel,
      };

      await expect(classifyTopicNode(state)).rejects.toThrow('Invalid classification format');
    });

    it('should throw error on invalid complexity value', async () => {
      const smartModel = new TestChatModel([
        JSON.stringify({
          complexity: 'super-huge', // invalid value
          distillationDepth: 0,
          reasoning: 'Test',
        }),
      ]);

      const state: ClassifyTopicState = {
        prd: 'Some PRD',
        smartModel,
      };

      await expect(classifyTopicNode(state)).rejects.toThrow('Invalid classification format');
    });

    it('should throw error on invalid distillation depth', async () => {
      const smartModel = new TestChatModel([
        JSON.stringify({
          complexity: 'small',
          distillationDepth: 5, // invalid, must be 0, 1, or 2
          reasoning: 'Test',
        }),
      ]);

      const state: ClassifyTopicState = {
        prd: 'Some PRD',
        smartModel,
      };

      await expect(classifyTopicNode(state)).rejects.toThrow('Invalid classification format');
    });
  });

  describe('fallback trigger', () => {
    it('should fall back to fast model when smart model fails', async () => {
      // Smart model throws error
      const smartModel = new TestChatModel([]);

      // Fast model provides valid response
      const fastModel = new TestChatModel([
        JSON.stringify({
          complexity: 'medium',
          distillationDepth: 1,
          reasoning: 'Fallback classification from fast model',
        }),
      ]);

      const state: ClassifyTopicState = {
        prd: 'Add notification preferences',
        smartModel,
        fastModel,
      };

      const result = await classifyTopicNode(state);

      // Should succeed with fast model's response
      expect(result.classification).toBeDefined();
      expect(result.classification?.complexity).toBe('medium');
      expect(result.classification?.reasoning).toContain('fast model');
    });

    it('should throw error when all models fail', async () => {
      const smartModel = new TestChatModel([]);
      const fastModel = new TestChatModel([]);

      const state: ClassifyTopicState = {
        prd: 'Some PRD',
        smartModel,
        fastModel,
      };

      await expect(classifyTopicNode(state)).rejects.toThrow('No more responses available');
    });

    it('should work with only smart model provided', async () => {
      const smartModel = new TestChatModel([
        JSON.stringify({
          complexity: 'small',
          distillationDepth: 0,
          reasoning: 'Quick fix',
        }),
      ]);

      const state: ClassifyTopicState = {
        prd: 'Fix button alignment',
        smartModel,
        // No fastModel provided
      };

      const result = await classifyTopicNode(state);

      expect(result.classification).toBeDefined();
      expect(result.classification?.complexity).toBe('small');
    });
  });
});
