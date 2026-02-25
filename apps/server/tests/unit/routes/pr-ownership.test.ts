/**
 * Unit tests for PR ownership utilities
 */

import { describe, it, expect } from 'vitest';
import {
  parsePROwnershipWatermark,
  buildPROwnershipWatermark,
  isPRStale,
} from '@/routes/github/utils/pr-ownership.js';

describe('parsePROwnershipWatermark', () => {
  it('returns nulls for empty body', () => {
    expect(parsePROwnershipWatermark('')).toEqual({
      instanceId: null,
      teamId: null,
      createdAt: null,
    });
  });

  it('returns nulls when no watermark is present', () => {
    const body = 'This is a regular PR body with no ownership watermark.';
    expect(parsePROwnershipWatermark(body)).toEqual({
      instanceId: null,
      teamId: null,
      createdAt: null,
    });
  });

  it('parses a valid watermark from a PR body', () => {
    const body = `Some PR description\n\n<!-- automaker:owner instance=ava-staging team=proto-labs-ai created=2026-02-25T19:00:00.000Z -->`;
    const result = parsePROwnershipWatermark(body);
    expect(result.instanceId).toBe('ava-staging');
    expect(result.teamId).toBe('proto-labs-ai');
    expect(result.createdAt).toBe('2026-02-25T19:00:00.000Z');
  });

  it('parses a UUID-based instance ID', () => {
    const body = `<!-- automaker:owner instance=550e8400-e29b-41d4-a716-446655440000 team=my-team created=2026-01-01T00:00:00.000Z -->`;
    const result = parsePROwnershipWatermark(body);
    expect(result.instanceId).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(result.teamId).toBe('my-team');
    expect(result.createdAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('handles watermark at the start of the body', () => {
    const body = `<!-- automaker:owner instance=dev-local team=personal created=2026-02-25T10:00:00.000Z -->`;
    const result = parsePROwnershipWatermark(body);
    expect(result.instanceId).toBe('dev-local');
    expect(result.teamId).toBe('personal');
  });

  it('ignores malformed watermarks', () => {
    const body = `<!-- automaker:owner instance= team=foo created=2026-01-01 -->`;
    const result = parsePROwnershipWatermark(body);
    // The regex requires \S+ (non-whitespace) for instance, so empty instance won't match
    expect(result.instanceId).toBeNull();
  });
});

describe('buildPROwnershipWatermark', () => {
  it('builds a valid HTML comment watermark', () => {
    const watermark = buildPROwnershipWatermark('ava-staging', 'proto-labs-ai');
    expect(watermark).toMatch(/^<!--\s*automaker:owner\s+/);
    expect(watermark).toContain('instance=ava-staging');
    expect(watermark).toContain('team=proto-labs-ai');
    expect(watermark).toMatch(/created=\d{4}-\d{2}-\d{2}T/);
    expect(watermark).toMatch(/-->$/);
  });

  it('produces a watermark that round-trips through the parser', () => {
    const instanceId = 'ci-bot';
    const teamId = 'automaker-team';
    const watermark = buildPROwnershipWatermark(instanceId, teamId);
    const body = `PR description\n\n${watermark}`;
    const parsed = parsePROwnershipWatermark(body);
    expect(parsed.instanceId).toBe(instanceId);
    expect(parsed.teamId).toBe(teamId);
    expect(parsed.createdAt).toBeTruthy();
  });

  it('handles empty teamId gracefully', () => {
    const watermark = buildPROwnershipWatermark('my-instance', '');
    expect(watermark).toContain('instance=my-instance');
    // empty team= still present but may not round-trip since regex requires \S+
    expect(watermark).toContain('team=');
  });
});

describe('isPRStale', () => {
  it('returns false when both ages are under the TTL', () => {
    expect(isPRStale(10, 10, 24)).toBe(false);
  });

  it('returns false when only commit age exceeds TTL', () => {
    expect(isPRStale(30, 10, 24)).toBe(false);
  });

  it('returns false when only activity age exceeds TTL', () => {
    expect(isPRStale(10, 30, 24)).toBe(false);
  });

  it('returns true when both ages exceed the TTL', () => {
    expect(isPRStale(25, 25, 24)).toBe(true);
  });

  it('returns false at exactly the boundary when both equal TTL', () => {
    // strictly greater than, so equal is NOT stale
    expect(isPRStale(24, 24, 24)).toBe(false);
  });

  it('returns true when both ages are significantly past TTL', () => {
    expect(isPRStale(100, 100, 24)).toBe(true);
  });

  it('uses custom TTL correctly', () => {
    expect(isPRStale(5, 5, 4)).toBe(true);
    expect(isPRStale(3, 3, 4)).toBe(false);
  });
});
