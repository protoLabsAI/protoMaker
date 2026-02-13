/**
 * Integration tests for review flow
 *
 * Tests demonstrate:
 * 1. Graph interrupts at human_review node
 * 2. State can be inspected with getState()
 * 3. State can be modified with updateState()
 * 4. Resume continues from interrupt point
 * 5. Both approval and rejection paths work correctly
 */

import { describe, it, expect } from 'vitest';
import { createReviewFlow } from '../../src/graphs/review-flow.js';

describe('Review Flow Integration Tests', () => {
  it('should interrupt at human_review node', async () => {
    const flow = createReviewFlow();

    // Start the flow
    const thread = { configurable: { thread_id: 'test-1' } };
    let result = await flow.invoke({ content: '' }, thread);

    // Should interrupt at human_review
    const state = await flow.getState(thread);
    expect(state.next).toEqual(['human_review']);
    expect(state.values.content).toContain('draft document');
  });

  it('should allow state inspection with getState()', async () => {
    const flow = createReviewFlow();

    const thread = { configurable: { thread_id: 'test-2' } };
    await flow.invoke({ content: '' }, thread);

    // Inspect state at interrupt
    const state = await flow.getState(thread);

    // Verify state structure
    expect(state.values).toHaveProperty('content');
    expect(state.values).toHaveProperty('revision');
    expect(state.values.revision).toBe(1);
    expect(state.next).toEqual(['human_review']);
  });

  it('should allow state modification with updateState()', async () => {
    const flow = createReviewFlow();

    const thread = { configurable: { thread_id: 'test-3' } };
    await flow.invoke({ content: '' }, thread);

    // Get initial state
    const stateBefore = await flow.getState(thread);
    expect(stateBefore.values.feedback).toBeUndefined();

    // Update state during interrupt
    await flow.updateState(thread, {
      feedback: 'Please add more details',
      approved: false,
    });

    // Verify state was updated
    const state = await flow.getState(thread);
    expect(state.values.feedback).toBe('Please add more details');
    // Note: approved may be undefined until the node processes it
  });

  it('should handle approval path - resume to END', async () => {
    const flow = createReviewFlow();

    const thread = { configurable: { thread_id: 'test-4' } };

    // Step 1: Run to interrupt
    await flow.invoke({ content: '' }, thread);

    // Step 2: Approve during interrupt
    await flow.updateState(thread, {
      approved: true,
    });

    // Step 3: Resume - should go to END
    const result = await flow.invoke(null, thread);

    // Verify flow completed
    const finalState = await flow.getState(thread);
    expect(finalState.next).toEqual([]);
    expect(finalState.values.approved).toBe(true);
  });

  it('should handle rejection path - resume to revise', async () => {
    const flow = createReviewFlow();

    const thread = { configurable: { thread_id: 'test-5' } };

    // Step 1: Run to interrupt
    await flow.invoke({ content: '' }, thread);

    // Step 2: Reject with feedback
    await flow.updateState(thread, {
      feedback: 'Add section about testing',
      approved: false,
    });

    // Step 3: Resume - should go to revise
    await flow.invoke(null, thread);

    // Verify state after revision
    const afterRevise = await flow.getState(thread);
    expect(afterRevise.next).toEqual(['human_review']); // Back at review
    expect(afterRevise.values.content).toContain('Applied feedback');
    expect(afterRevise.values.content).toContain('Add section about testing');
    expect(afterRevise.values.revision).toBe(2);
  });

  it('should handle multiple revision cycles', async () => {
    const flow = createReviewFlow();

    const thread = { configurable: { thread_id: 'test-6' } };

    // Initial run to interrupt
    await flow.invoke({ content: '' }, thread);

    // First rejection
    await flow.updateState(thread, {
      feedback: 'First revision needed',
      approved: false,
    });
    await flow.invoke(null, thread);

    let state = await flow.getState(thread);
    expect(state.values.revision).toBe(2);

    // Second rejection
    await flow.updateState(thread, {
      feedback: 'Second revision needed',
      approved: false,
    });
    await flow.invoke(null, thread);

    state = await flow.getState(thread);
    expect(state.values.revision).toBe(3);

    // Final approval
    await flow.updateState(thread, {
      approved: true,
    });
    await flow.invoke(null, thread);

    const finalState = await flow.getState(thread);
    expect(finalState.next).toEqual([]);
    expect(finalState.values.approved).toBe(true);
    expect(finalState.values.revision).toBe(3);
  });

  it('should maintain state across resume calls', async () => {
    const flow = createReviewFlow();

    const thread = { configurable: { thread_id: 'test-7' } };

    // Run to interrupt
    await flow.invoke({ content: '' }, thread);

    const stateBeforeUpdate = await flow.getState(thread);
    const originalContent = stateBeforeUpdate.values.content;

    // Update with rejection
    await flow.updateState(thread, {
      feedback: 'Test feedback',
      approved: false,
    });

    // Resume
    await flow.invoke(null, thread);

    // Verify original content is still present
    const stateAfterRevise = await flow.getState(thread);
    expect(stateAfterRevise.values.content).toContain(originalContent);
  });

  it('should demonstrate full workflow from draft to approval', async () => {
    const flow = createReviewFlow();

    const thread = { configurable: { thread_id: 'test-8' } };

    // Start flow - creates draft and interrupts
    await flow.invoke({ content: '' }, thread);

    // Human reviews and requests changes
    const reviewState = await flow.getState(thread);
    expect(reviewState.next).toEqual(['human_review']);
    expect(reviewState.values.content).toContain('draft document');

    // Provide feedback and reject
    await flow.updateState(thread, {
      feedback: 'Please add executive summary',
      approved: false,
    });

    // Resume - goes to revise, then back to review
    await flow.invoke(null, thread);

    // Check revised state
    const afterRevision = await flow.getState(thread);
    expect(afterRevision.values.content).toContain('Applied feedback');
    expect(afterRevision.values.content).toContain('executive summary');

    // Approve the revision
    await flow.updateState(thread, {
      approved: true,
    });

    // Resume to end
    await flow.invoke(null, thread);

    // Verify completion
    const finalState = await flow.getState(thread);
    expect(finalState.next).toEqual([]);
    expect(finalState.values.approved).toBe(true);
  });
});
