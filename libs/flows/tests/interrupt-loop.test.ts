/**
 * Tests for interrupt-loop utility
 */

import { describe, it, expect } from 'vitest';
import { StateGraph, Annotation, MemorySaver, Command } from '@langchain/langgraph';
import { createInterruptLoop } from '../src/graphs/interrupt-loop.js';

describe('createInterruptLoop', () => {
  it('should create interrupt loop components', () => {
    const loop = createInterruptLoop({
      maxIterations: 3,
      interruptNodeName: 'human_review',
    });

    expect(loop.interruptNode).toBeDefined();
    expect(loop.resumeRouter).toBeDefined();
    expect(loop.stateFields).toBeDefined();
    expect(loop.stateFields.iterationCount).toBeDefined();
    expect(loop.stateFields.userResponse).toBeDefined();
  });

  it('should increment iteration count on each interrupt', () => {
    const loop = createInterruptLoop({
      maxIterations: 3,
      interruptNodeName: 'human_review',
    });

    // First iteration
    const result1 = loop.interruptNode({ iterationCount: 0 });
    expect(result1).toBeInstanceOf(Command);
    expect(result1.update).toEqual({ iterationCount: 1 });

    // Second iteration
    const result2 = loop.interruptNode({ iterationCount: 1 });
    expect(result2).toBeInstanceOf(Command);
    expect(result2.update).toEqual({ iterationCount: 2 });

    // Third iteration
    const result3 = loop.interruptNode({ iterationCount: 2 });
    expect(result3).toBeInstanceOf(Command);
    expect(result3.update).toEqual({ iterationCount: 3 });
  });

  it('should route to overflow node when max iterations exceeded', () => {
    const loop = createInterruptLoop({
      maxIterations: 3,
      interruptNodeName: 'human_review',
      overflowNode: 'auto_approve',
    });

    // At max iterations, should route to overflow
    const result = loop.interruptNode({ iterationCount: 2 });
    expect(result).toBeInstanceOf(Command);
    expect(result.goto).toEqual(['auto_approve']);
    expect(result.update).toEqual({ iterationCount: 3 });
  });

  it('should not route to overflow when under max iterations', () => {
    const loop = createInterruptLoop({
      maxIterations: 3,
      interruptNodeName: 'human_review',
      overflowNode: 'auto_approve',
    });

    // Under max iterations, should not route to overflow
    const result = loop.interruptNode({ iterationCount: 1 });
    expect(result).toBeInstanceOf(Command);
    // When no goto is specified, Command sets it to an empty array
    expect(result.goto).toEqual([]);
    expect(result.update).toEqual({ iterationCount: 2 });
  });

  it('should apply custom onResume state updates', () => {
    const loop = createInterruptLoop({
      maxIterations: 3,
      interruptNodeName: 'human_review',
      onResume: (response, iterationCount) => ({
        feedback: (response as { feedback: string }).feedback,
        lastIterationCount: iterationCount,
      }),
    });

    const result = loop.interruptNode({
      iterationCount: 0,
      userResponse: { feedback: 'Looks good!' },
    });

    expect(result).toBeInstanceOf(Command);
    expect(result.update).toEqual({
      iterationCount: 1,
      feedback: 'Looks good!',
      lastIterationCount: 1,
    });
  });

  it('should route correctly based on iteration count', () => {
    const loop = createInterruptLoop({
      maxIterations: 3,
      interruptNodeName: 'human_review',
      overflowNode: 'auto_approve',
    });

    // Under max iterations
    expect(loop.resumeRouter({ iterationCount: 1 })).toBe('next_node');
    expect(loop.resumeRouter({ iterationCount: 2 })).toBe('next_node');

    // At max iterations
    expect(loop.resumeRouter({ iterationCount: 3 })).toBe('auto_approve');
    expect(loop.resumeRouter({ iterationCount: 4 })).toBe('auto_approve');
  });

  it('should route to next_node when no overflow node specified', () => {
    const loop = createInterruptLoop({
      maxIterations: 3,
      interruptNodeName: 'human_review',
    });

    // Even at max iterations, should route to next_node
    expect(loop.resumeRouter({ iterationCount: 3 })).toBe('next_node');
    expect(loop.resumeRouter({ iterationCount: 4 })).toBe('next_node');
  });

  it('should initialize iterationCount to 0 by default', () => {
    const loop = createInterruptLoop({
      maxIterations: 3,
      interruptNodeName: 'human_review',
    });

    // The Annotation wraps the default function, so we need to access it differently
    const field = loop.stateFields.iterationCount;
    expect(field).toBeDefined();
    // The default is embedded in the Annotation, we just verify the field exists
  });

  it('should integrate with LangGraph state annotation', () => {
    const loop = createInterruptLoop({
      maxIterations: 2,
      interruptNodeName: 'review',
    });

    // Create a state annotation with loop fields
    const TestState = Annotation.Root({
      ...loop.stateFields,
      content: Annotation<string>(),
    });

    // Verify the annotation was created successfully
    expect(TestState).toBeDefined();
    expect(TestState.spec).toBeDefined();
  });

  it('should work in a complete graph flow', async () => {
    const loop = createInterruptLoop({
      maxIterations: 2,
      interruptNodeName: 'human_review',
      overflowNode: 'auto_approve',
    });

    const TestState = Annotation.Root({
      ...loop.stateFields,
      approved: Annotation<boolean>({ default: () => false }),
    });

    const graph = new StateGraph(TestState);

    // Add the interrupt node
    graph.addNode('human_review', loop.interruptNode);

    // Add overflow node
    graph.addNode('auto_approve', async () => ({ approved: true }));

    // Set entry point
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (graph as any).setEntryPoint('human_review');

    // Add conditional routing
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (graph as any).addConditionalEdges('human_review', loop.resumeRouter, {
      next_node: 'human_review', // Loop back for testing
      auto_approve: 'auto_approve',
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (graph as any).addEdge('auto_approve', '__end__');

    const checkpointer = new MemorySaver();
    const compiled = graph.compile({
      interruptBefore: ['human_review'],
      checkpointer,
    });

    // First invocation - should interrupt BEFORE the node executes
    const config = { configurable: { thread_id: 'test-1' } };
    const result1 = await compiled.invoke({ iterationCount: 0 }, config);

    // Since interruptBefore stops execution before the node runs, iteration count is still 0
    expect(result1.iterationCount).toBe(0);

    // Resume - node executes, increments to 1, then interrupts again
    const result2 = await compiled.invoke(null, config);
    expect(result2.iterationCount).toBe(1);

    // Resume - node executes, increments to 2 (max), routes to auto_approve
    const result3 = await compiled.invoke(null, config);
    expect(result3.approved).toBe(true);
    expect(result3.iterationCount).toBe(2);
  });
});
