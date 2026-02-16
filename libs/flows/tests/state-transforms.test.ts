/**
 * Tests for state transformation boundary pattern
 */

import { describe, it, expect, vi } from 'vitest';
import {
  StateTransformer,
  createSubgraphBridge,
  createFieldMapper,
  createIdentityTransformer,
  type CompiledSubgraph,
} from '../src/graphs/state-transforms.js';

// Mock state types for testing
interface ParentState {
  topic: string;
  config: { enabled: boolean };
  result?: string;
  metadata?: { timestamp: string };
}

interface ChildState {
  query: string;
  settings: { enabled: boolean };
  output?: string;
}

describe('StateTransformer', () => {
  it('should define the correct interface', () => {
    // Type-level test - ensures StateTransformer interface is properly defined
    const transformer: StateTransformer<ParentState, ChildState> = {
      toInput: (parent) => ({
        query: parent.topic,
        settings: parent.config,
      }),
      extractOutput: (child) => ({
        result: child.output,
      }),
    };

    expect(transformer.toInput).toBeDefined();
    expect(transformer.extractOutput).toBeDefined();
  });
});

describe('createSubgraphBridge', () => {
  it('should transform input, invoke subgraph, and transform output', async () => {
    // Mock transformer
    const transformer: StateTransformer<ParentState, ChildState> = {
      toInput: (parent) => ({
        query: parent.topic,
        settings: parent.config,
      }),
      extractOutput: (child) => ({
        result: child.output,
      }),
    };

    // Mock subgraph
    const mockSubgraph = {
      invoke: vi.fn().mockResolvedValue({
        query: 'test query',
        settings: { enabled: true },
        output: 'processed result',
      }),
    } as unknown as CompiledSubgraph<ChildState>;

    // Create bridge
    const bridge = createSubgraphBridge({
      transformer,
      subgraph: mockSubgraph,
    });

    // Test invocation
    const parentState: ParentState = {
      topic: 'test query',
      config: { enabled: true },
    };

    const result = await bridge(parentState);

    // Verify subgraph was called with transformed input
    expect(mockSubgraph.invoke).toHaveBeenCalledWith({
      query: 'test query',
      settings: { enabled: true },
    });

    // Verify output was transformed back
    expect(result).toEqual({
      result: 'processed result',
    });
  });

  it('should handle undefined output fields gracefully', async () => {
    const transformer: StateTransformer<ParentState, ChildState> = {
      toInput: (parent) => ({
        query: parent.topic,
        settings: parent.config,
      }),
      extractOutput: (child) => ({
        result: child.output,
      }),
    };

    const mockSubgraph = {
      invoke: vi.fn().mockResolvedValue({
        query: 'test',
        settings: { enabled: true },
        // output is undefined
      }),
    } as unknown as CompiledSubgraph<ChildState>;

    const bridge = createSubgraphBridge({
      transformer,
      subgraph: mockSubgraph,
    });

    const result = await bridge({
      topic: 'test',
      config: { enabled: true },
    });

    expect(result).toEqual({ result: undefined });
  });

  it('should pass parent state to extractOutput for context', async () => {
    const transformer: StateTransformer<ParentState, ChildState> = {
      toInput: (parent) => ({
        query: parent.topic,
        settings: parent.config,
      }),
      extractOutput: (child, parent) => ({
        result: child.output,
        // Use parent state for context
        metadata: { timestamp: new Date().toISOString() },
      }),
    };

    const mockSubgraph = {
      invoke: vi.fn().mockResolvedValue({
        query: 'test',
        settings: { enabled: true },
        output: 'result',
      }),
    } as unknown as CompiledSubgraph<ChildState>;

    const bridge = createSubgraphBridge({
      transformer,
      subgraph: mockSubgraph,
    });

    const result = await bridge({
      topic: 'test',
      config: { enabled: true },
    });

    expect(result.result).toBe('result');
    expect(result.metadata).toBeDefined();
    expect(result.metadata?.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('createFieldMapper', () => {
  it('should map fields from parent to child in toInput', () => {
    const mapper = createFieldMapper<ParentState, ChildState>({
      query: 'topic',
      settings: 'config',
    });

    const parent: ParentState = {
      topic: 'test topic',
      config: { enabled: true },
    };

    const child = mapper.toInput(parent);

    expect(child).toEqual({
      query: 'test topic',
      settings: { enabled: true },
    });
  });

  it('should map fields from child to parent in extractOutput', () => {
    const mapper = createFieldMapper<ParentState, ChildState>({
      query: 'topic',
      output: 'result',
    });

    const child: ChildState = {
      query: 'updated query',
      settings: { enabled: false },
      output: 'final result',
    };

    const parent: ParentState = {
      topic: 'original topic',
      config: { enabled: true },
    };

    const update = mapper.extractOutput(child, parent);

    expect(update).toEqual({
      topic: 'updated query',
      result: 'final result',
    });
  });

  it('should handle missing fields gracefully', () => {
    const mapper = createFieldMapper<ParentState, ChildState>({
      query: 'topic',
      output: 'result',
    });

    const parent: ParentState = {
      topic: 'test',
      config: { enabled: true },
      // result is undefined
    };

    const child = mapper.toInput(parent);

    // Should only map existing fields
    expect(child).toEqual({
      query: 'test',
    });
  });

  it('should work with partial state', () => {
    const mapper = createFieldMapper<ParentState, Partial<ChildState>>({
      query: 'topic',
    });

    const parent: ParentState = {
      topic: 'test',
      config: { enabled: true },
    };

    const child = mapper.toInput(parent);

    expect(child).toEqual({
      query: 'test',
    });
  });
});

describe('createIdentityTransformer', () => {
  it('should return parent state unchanged in toInput', () => {
    interface SharedState {
      value: string;
      count: number;
    }

    const transformer = createIdentityTransformer<SharedState>();

    const state: SharedState = {
      value: 'test',
      count: 42,
    };

    const result = transformer.toInput(state);

    expect(result).toEqual(state);
    expect(result).toBe(state); // Should be same reference
  });

  it('should return child state in extractOutput', () => {
    interface SharedState {
      value: string;
      count: number;
    }

    const transformer = createIdentityTransformer<SharedState>();

    const child: SharedState = {
      value: 'updated',
      count: 100,
    };

    const parent: SharedState = {
      value: 'original',
      count: 42,
    };

    const result = transformer.extractOutput(child, parent);

    expect(result).toEqual(child);
    expect(result).toBe(child); // Should be same reference
  });

  it('should work with createSubgraphBridge', async () => {
    interface SharedState {
      value: string;
    }

    const transformer = createIdentityTransformer<SharedState>();

    const mockSubgraph = {
      invoke: vi.fn().mockResolvedValue({
        value: 'processed',
      }),
    } as unknown as CompiledSubgraph<SharedState>;

    const bridge = createSubgraphBridge({
      transformer,
      subgraph: mockSubgraph,
    });

    const result = await bridge({ value: 'input' });

    expect(mockSubgraph.invoke).toHaveBeenCalledWith({ value: 'input' });
    expect(result).toEqual({ value: 'processed' });
  });
});
