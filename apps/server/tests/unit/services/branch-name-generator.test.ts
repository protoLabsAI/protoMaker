/**
 * Unit tests for the smart branch-name generator (#3794).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@protolabsai/utils', () => ({
  createLogger: () => ({ info() {}, debug() {}, warn() {}, error() {} }),
}));
vi.mock('node:fs', () => ({
  default: { promises: { mkdir: vi.fn().mockResolvedValue(undefined), appendFile: vi.fn().mockResolvedValue(undefined) } },
}));
const simpleQuery = vi.fn();
vi.mock('../../../src/providers/simple-query-service.js', () => ({
  simpleQuery: (...args: unknown[]) => simpleQuery(...args),
}));
const getWorkflowSettings = vi.fn();
vi.mock('../../../src/lib/settings-helpers.js', () => ({
  getWorkflowSettings: (...args: unknown[]) => getWorkflowSettings(...args),
}));

import { createSmartBranchNameGenerator } from '../../../src/services/branch-name-generator.js';
import fs from 'node:fs';

const prefixFor = (c?: string) => (c === 'fix' ? 'fix' : 'feature');
const input = {
  title: 'Add user authentication flow',
  description: 'Login + sessions',
  category: 'feature',
  featureId: 'feature-1779000000000-abc1234',
};

describe('createSmartBranchNameGenerator', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns null when smartBranchNames is disabled (no model call)', async () => {
    getWorkflowSettings.mockResolvedValue({ smartBranchNames: false });
    const gen = createSmartBranchNameGenerator(null, prefixFor);
    const result = await gen(input, '/proj');
    expect(result).toBeNull();
    expect(simpleQuery).not.toHaveBeenCalled();
  });

  it('generates prefix/slug-shortId from the fast model when enabled', async () => {
    getWorkflowSettings.mockResolvedValue({ smartBranchNames: true });
    simpleQuery.mockResolvedValue({ text: 'user-auth-flow' });
    const gen = createSmartBranchNameGenerator(null, prefixFor);
    const result = await gen(input, '/proj');
    expect(result).toBe('feature/user-auth-flow-abc1234');
    // routes through the fast tier
    expect(simpleQuery).toHaveBeenCalledWith(expect.objectContaining({ model: 'protolabs/fast' }));
    // captured a training row
    expect(vi.mocked(fs.promises.appendFile)).toHaveBeenCalled();
  });

  it('sanitizes model output and respects the category prefix', async () => {
    getWorkflowSettings.mockResolvedValue({ smartBranchNames: true });
    simpleQuery.mockResolvedValue({ text: '  Fix Login Bug!! \n(extra)' });
    const gen = createSmartBranchNameGenerator(null, prefixFor);
    const result = await gen({ ...input, category: 'fix' }, '/proj');
    expect(result).toMatch(/^fix\/[a-z0-9-]+-abc1234$/);
    expect(result).not.toMatch(/[^a-z0-9/-]/);
  });

  it('falls back (null) when the model errors', async () => {
    getWorkflowSettings.mockResolvedValue({ smartBranchNames: true });
    simpleQuery.mockRejectedValue(new Error('gateway 529'));
    const gen = createSmartBranchNameGenerator(null, prefixFor);
    expect(await gen(input, '/proj')).toBeNull();
  });

  it('falls back (null) on a degenerate slug', async () => {
    getWorkflowSettings.mockResolvedValue({ smartBranchNames: true });
    simpleQuery.mockResolvedValue({ text: '!!' }); // sanitizes to '' (< 3 chars)
    const gen = createSmartBranchNameGenerator(null, prefixFor);
    expect(await gen(input, '/proj')).toBeNull();
  });
});
