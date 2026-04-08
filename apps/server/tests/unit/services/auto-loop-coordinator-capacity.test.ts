/**
 * Unit tests for AutoLoopCoordinator.updateMaxConcurrency.
 *
 * Covers:
 * - Successful capacity adjustment
 * - No-op when value unchanged
 * - Returns false for non-existent loop
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AutoLoopCoordinator } from '../../../src/services/auto-mode/auto-loop-coordinator.js';

describe('AutoLoopCoordinator — updateMaxConcurrency', () => {
  let coordinator: AutoLoopCoordinator;

  beforeEach(() => {
    coordinator = new AutoLoopCoordinator();
  });

  it('updates maxConcurrency for an existing loop', () => {
    const key = coordinator.makeKey('/project', null);
    coordinator.startLoop(
      key,
      { maxConcurrency: 2, useWorktrees: true, projectPath: '/project', branchName: null },
      async () => {}
    );

    const result = coordinator.updateMaxConcurrency(key, 5, 'WSJF reallocation');
    expect(result).toBe(true);

    const state = coordinator.getState(key);
    expect(state?.config.maxConcurrency).toBe(5);
  });

  it('returns true without changes when value is same', () => {
    const key = coordinator.makeKey('/project', null);
    coordinator.startLoop(
      key,
      { maxConcurrency: 3, useWorktrees: true, projectPath: '/project', branchName: null },
      async () => {}
    );

    const result = coordinator.updateMaxConcurrency(key, 3);
    expect(result).toBe(true);
    expect(coordinator.getState(key)?.config.maxConcurrency).toBe(3);
  });

  it('returns false for non-existent loop', () => {
    const result = coordinator.updateMaxConcurrency('nonexistent', 5);
    expect(result).toBe(false);
  });

  it('reflects in public state after update', () => {
    const key = coordinator.makeKey('/project', null);
    coordinator.startLoop(
      key,
      { maxConcurrency: 1, useWorktrees: true, projectPath: '/project', branchName: null },
      async () => {}
    );

    coordinator.updateMaxConcurrency(key, 4);
    const publicState = coordinator.getPublicState(key);
    expect(publicState?.maxConcurrency).toBe(4);
  });
});
