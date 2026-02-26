/**
 * Linear State Mapper Tests
 *
 * Unit tests for mapLinearStateToAutomaker() covering all mapping branches.
 */

import { describe, it, expect } from 'vitest';
import {
  mapLinearStateToAutomaker,
  mapAutomakerStatusToLinear,
} from '../../../src/services/linear-state-mapper.js';

describe('mapLinearStateToAutomaker', () => {
  // Backlog states
  it('maps "Backlog" to backlog', () => {
    expect(mapLinearStateToAutomaker('Backlog')).toBe('backlog');
  });

  it('maps "Todo" to backlog', () => {
    expect(mapLinearStateToAutomaker('Todo')).toBe('backlog');
  });

  // In-progress states
  it('maps "In Progress" to in_progress', () => {
    expect(mapLinearStateToAutomaker('In Progress')).toBe('in_progress');
  });

  it('maps "Started" to in_progress', () => {
    expect(mapLinearStateToAutomaker('Started')).toBe('in_progress');
  });

  // Review states
  it('maps "In Review" to review', () => {
    expect(mapLinearStateToAutomaker('In Review')).toBe('review');
  });

  it('maps "Review" to review', () => {
    expect(mapLinearStateToAutomaker('Review')).toBe('review');
  });

  // Done states
  it('maps "Done" to done', () => {
    expect(mapLinearStateToAutomaker('Done')).toBe('done');
  });

  it('maps "Completed" to done', () => {
    expect(mapLinearStateToAutomaker('Completed')).toBe('done');
  });

  // Blocked state
  it('maps "Blocked" to blocked', () => {
    expect(mapLinearStateToAutomaker('Blocked')).toBe('blocked');
  });

  // Terminal states — must not recycle into backlog
  it('maps "Canceled" (American) to done', () => {
    expect(mapLinearStateToAutomaker('Canceled')).toBe('done');
  });

  it('maps "Cancelled" (British) to done', () => {
    expect(mapLinearStateToAutomaker('Cancelled')).toBe('done');
  });

  it('maps "Duplicate" to done', () => {
    expect(mapLinearStateToAutomaker('Duplicate')).toBe('done');
  });

  it('maps case-insensitive "CANCELED" to done', () => {
    expect(mapLinearStateToAutomaker('CANCELED')).toBe('done');
  });

  // Triage — explicitly backlog (not silent fallthrough)
  it('maps "Triage" to backlog', () => {
    expect(mapLinearStateToAutomaker('Triage')).toBe('backlog');
  });

  // Unknown fallback
  it('maps unknown state to backlog', () => {
    expect(mapLinearStateToAutomaker('Some Unknown State')).toBe('backlog');
  });
});

describe('mapAutomakerStatusToLinear', () => {
  it('maps backlog to Backlog', () => {
    expect(mapAutomakerStatusToLinear('backlog')).toBe('Backlog');
  });

  it('maps in_progress to In Progress', () => {
    expect(mapAutomakerStatusToLinear('in_progress')).toBe('In Progress');
  });

  it('maps review to In Review', () => {
    expect(mapAutomakerStatusToLinear('review')).toBe('In Review');
  });

  it('maps done to Done', () => {
    expect(mapAutomakerStatusToLinear('done')).toBe('Done');
  });

  it('maps blocked to Blocked', () => {
    expect(mapAutomakerStatusToLinear('blocked')).toBe('Blocked');
  });

  it('maps verified to Done', () => {
    expect(mapAutomakerStatusToLinear('verified')).toBe('Done');
  });
});
