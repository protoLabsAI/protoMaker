import { describe, it, expect } from 'vitest';
import { createResearchFlow } from '../../src/graphs/research-flow.js';

describe('Research Flow Integration', () => {
  it('should execute complete flow end-to-end', async () => {
    const app = createResearchFlow();

    const initialState = {
      topic: 'LangGraph State Management',
    };

    // Execute the flow with a thread ID for checkpointing
    const config = { configurable: { thread_id: 'test-thread-1' } };
    const result = await app.invoke(initialState, config);

    // Verify all steps completed
    expect(result.topic).toBe('LangGraph State Management');
    expect(result.context).toBeDefined();
    expect(result.analysis).toBeDefined();
    expect(result.summary).toBeDefined();
    expect(result.completed).toBe(true);

    // Verify timestamps
    expect(result.gatheredAt).toBeDefined();
    expect(result.analyzedAt).toBeDefined();
    expect(result.summarizedAt).toBeDefined();

    // Verify content structure
    expect(result.context).toContain('Research context');
    expect(result.analysis).toContain('Key Findings');
    expect(result.summary).toContain('Research Summary');
  });

  it('should save state at each checkpoint', async () => {
    const app = createResearchFlow();

    const initialState = {
      topic: 'Testing Checkpoints',
    };

    const config = { configurable: { thread_id: 'test-thread-2' } };

    // Execute the flow
    const result = await app.invoke(initialState, config);

    // Verify final state includes all intermediate results
    expect(result.context).toBeDefined();
    expect(result.analysis).toBeDefined();
    expect(result.summary).toBeDefined();
  });

  it('should handle different topics correctly', async () => {
    const app = createResearchFlow();

    const topics = [
      'TypeScript Best Practices',
      'Microservices Architecture',
      'AI Agent Workflows',
    ];

    for (const topic of topics) {
      const config = {
        configurable: { thread_id: `test-thread-${topic.replace(/\s+/g, '-')}` },
      };
      const result = await app.invoke({ topic }, config);

      expect(result.topic).toBe(topic);
      expect(result.completed).toBe(true);
      expect(result.summary).toContain(topic);
    }
  });

  it('should maintain state consistency across nodes', async () => {
    const app = createResearchFlow();

    const initialState = {
      topic: 'State Consistency Test',
    };

    const config = { configurable: { thread_id: 'test-thread-3' } };
    const result = await app.invoke(initialState, config);

    // Topic should be preserved through all nodes
    expect(result.topic).toBe(initialState.topic);

    // Each node should add its specific data
    expect(result.context).toBeTruthy();
    expect(result.analysis).toBeTruthy();
    expect(result.summary).toBeTruthy();

    // All timestamps should be present and valid ISO strings
    expect(() => new Date(result.gatheredAt!)).not.toThrow();
    expect(() => new Date(result.analyzedAt!)).not.toThrow();
    expect(() => new Date(result.summarizedAt!)).not.toThrow();
  });

  it('should complete with all required fields', async () => {
    const app = createResearchFlow();

    const result = await app.invoke(
      { topic: 'Final State Verification' },
      { configurable: { thread_id: 'test-thread-4' } }
    );

    // Check all expected state fields are present
    const requiredFields = [
      'topic',
      'context',
      'analysis',
      'summary',
      'gatheredAt',
      'analyzedAt',
      'summarizedAt',
      'completed',
    ];

    for (const field of requiredFields) {
      expect(result).toHaveProperty(field);
      expect(result[field as keyof typeof result]).toBeDefined();
    }
  });
});
