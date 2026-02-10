/**
 * Tests for configurable MAX_SYSTEM_CONCURRENCY
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getMaxSystemConcurrency } from '../src/settings.js';

describe('getMaxSystemConcurrency', () => {
  const originalEnv = process.env.AUTOMAKER_MAX_CONCURRENCY;

  beforeEach(() => {
    delete process.env.AUTOMAKER_MAX_CONCURRENCY;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.AUTOMAKER_MAX_CONCURRENCY = originalEnv;
    } else {
      delete process.env.AUTOMAKER_MAX_CONCURRENCY;
    }
  });

  it('should return default of 2 when env var is not set', () => {
    const result = getMaxSystemConcurrency();
    expect(result).toBe(2);
  });

  it('should return parsed value when env var is valid', () => {
    process.env.AUTOMAKER_MAX_CONCURRENCY = '8';
    const result = getMaxSystemConcurrency();
    expect(result).toBe(8);
  });

  it('should enforce minimum of 1', () => {
    process.env.AUTOMAKER_MAX_CONCURRENCY = '0';
    const result = getMaxSystemConcurrency();
    expect(result).toBe(1);
  });

  it('should enforce maximum of 20', () => {
    process.env.AUTOMAKER_MAX_CONCURRENCY = '50';
    const result = getMaxSystemConcurrency();
    expect(result).toBe(20);
  });

  it('should handle invalid non-numeric strings gracefully', () => {
    process.env.AUTOMAKER_MAX_CONCURRENCY = 'invalid';
    const result = getMaxSystemConcurrency();
    expect(result).toBe(2); // Falls back to default
  });

  it('should handle negative numbers gracefully', () => {
    process.env.AUTOMAKER_MAX_CONCURRENCY = '-5';
    const result = getMaxSystemConcurrency();
    expect(result).toBe(1); // Enforces minimum
  });

  it('should handle edge case: exactly 1', () => {
    process.env.AUTOMAKER_MAX_CONCURRENCY = '1';
    const result = getMaxSystemConcurrency();
    expect(result).toBe(1);
  });

  it('should handle edge case: exactly 20', () => {
    process.env.AUTOMAKER_MAX_CONCURRENCY = '20';
    const result = getMaxSystemConcurrency();
    expect(result).toBe(20);
  });

  it('should handle decimal strings by truncating', () => {
    process.env.AUTOMAKER_MAX_CONCURRENCY = '6.7';
    const result = getMaxSystemConcurrency();
    expect(result).toBe(6);
  });

  it('should handle whitespace-padded numbers', () => {
    process.env.AUTOMAKER_MAX_CONCURRENCY = '  5  ';
    const result = getMaxSystemConcurrency();
    expect(result).toBe(5);
  });
});
