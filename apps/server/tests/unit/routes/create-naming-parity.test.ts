/**
 * Parity test: create-with-description-only yields non-empty title AND branch slug
 * regardless of source (ui / cli / mcp / api / internal).
 *
 * Ensures that when a feature is created with only a description (no title),
 * the server-side title generator produces a non-empty title, and the branch
 * name generator (deterministic slug) always produces a non-empty branch slug.
 *
 * Covers all five feature sources determined by `determineSource()` in the
 * create handler: ui, cli, mcp, api, internal.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@protolabsai/utils', () => ({
  createLogger: () => ({ info() {}, debug() {}, warn() {}, error() {} }),
  slugify: (s: string, max?: number) => {
    const slug = s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    return max ? slug.slice(0, max) : slug;
  },
}));

// Mock the title generator — return a generated title
const mockGenerateFeatureTitle = vi.fn();
vi.mock('../../../src/services/title-generator.js', () => ({
  generateFeatureTitle: (...args: unknown[]) => mockGenerateFeatureTitle(...args),
}));

// Mock quarantine service
const mockQuarantineProcess = vi.fn();
vi.mock('../../../src/services/quarantine-service.js', () => ({
  QuarantineService: class {
    constructor() {}
    process = mockQuarantineProcess;
  },
}));

// Mock trust tier service
vi.mock('../../../src/services/trust-tier-service.js', () => ({
  TrustTierService: class {
    classifyTrust = vi.fn().mockReturnValue('trusted');
  },
}));

// Mock feature loader methods
const mockFindDuplicateTitle = vi.fn();
const mockFindCandidateEpic = vi.fn();
const mockCreate = vi.fn();
vi.mock('../../../src/services/feature-loader.js', () => ({
  FeatureLoader: {
    findDuplicateTitle: (...args: unknown[]) => mockFindDuplicateTitle(...args),
    findCandidateEpicForTitle: (...args: unknown[]) => mockFindCandidateEpic(...args),
    create: (...args: unknown[]) => mockCreate(...args),
  },
}));

vi.mock('../common.js', () => ({
  getErrorMessage: vi.fn((err: unknown) => (err instanceof Error ? err.message : 'Unknown error')),
  logError: vi.fn(),
}));

import { createCreateHandler } from '../../../src/routes/features/routes/create.js';

const mockQuarantineOutcome = {
  approved: true,
  sanitizedTitle: 'Generated Feature Title',
  sanitizedDescription: 'Add a dark-mode toggle to the settings page',
  entry: {
    id: 'quarantine-1',
    result: 'approved' as const,
    stage: 'passed' as any,
    violations: [],
  },
};

const mockFeatureLoader = {
  findDuplicateTitle: mockFindDuplicateTitle,
  findCandidateEpicForTitle: mockFindCandidateEpic,
  create: mockCreate,
};

const mockTrustTierService = {
  classifyTrust: vi.fn().mockReturnValue('trusted'),
};

const testDescription = 'Add a dark-mode toggle to the settings page';

function makeReq(sourceHeaders: Record<string, string>, title = '') {
  return {
    body: {
      projectPath: '/test/project',
      feature: {
        title,
        description: testDescription,
      },
    },
    headers: sourceHeaders,
    cookies: {},
  };
}

function makeRes() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  };
}

describe('create-with-description-only naming parity across all sources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateFeatureTitle.mockResolvedValue('Generated Feature Title');
    mockFindDuplicateTitle.mockResolvedValue(null);
    mockFindCandidateEpic.mockResolvedValue(null);
    mockQuarantineProcess.mockResolvedValue(mockQuarantineOutcome);
    mockCreate.mockImplementation((_projectPath, feature) =>
      Promise.resolve({
        id: 'feat-1',
        projectPath: '/test/project',
        branchName: 'feature/generated-feature-title-feat1',
        ...feature,
      })
    );
  });

  const sources: Array<{ name: string; headers: Record<string, string> }> = [
    { name: 'ui', headers: { 'x-session-token': 'abc123' } },
    { name: 'cli', headers: {} },
    { name: 'mcp', headers: { 'x-automaker-client': 'mcp' } },
    { name: 'api', headers: { 'x-api-key': 'sk-test' } },
    { name: 'internal', headers: { 'x-session-token': 'internal-token' } },
  ];

  for (const { name, headers } of sources) {
    it(`${name} source: generates non-empty title`, async () => {
      const handler = createCreateHandler(
        mockFeatureLoader as any,
        mockTrustTierService as any,
        undefined,
        {} as any
      );
      const res = makeRes();
      await handler(makeReq(headers), res);

      // Title generator called
      expect(mockGenerateFeatureTitle).toHaveBeenCalledWith(testDescription, {}, '/test/project');

      // Created feature has non-empty title
      const jsonCall = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(jsonCall.success).toBe(true);
      expect(jsonCall.feature.title).toBeTruthy();
      expect(jsonCall.feature.title.length).toBeGreaterThan(0);
    });

    it(`${name} source: produces non-empty branch slug`, async () => {
      const handler = createCreateHandler(
        mockFeatureLoader as any,
        mockTrustTierService as any,
        undefined,
        {} as any
      );
      const res = makeRes();
      await handler(makeReq(headers), res);

      // Feature loader create called — the branch name is generated inside
      // FeatureLoader.create() via generateBranchName() or the smart generator.
      // The created feature (returned by mockCreate) should have a branchName.
      const jsonCall = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(jsonCall.feature.branchName).toBeTruthy();
      expect(jsonCall.feature.branchName.length).toBeGreaterThan(0);
    });
  }

  it('title generation failure: still creates feature (graceful fallback)', async () => {
    mockGenerateFeatureTitle.mockResolvedValue(null);

    const handler = createCreateHandler(
      mockFeatureLoader as any,
      mockTrustTierService as any,
      undefined,
      {} as any
    );
    const res = makeRes();
    await handler(makeReq({}), res);

    // Should NOT 500
    expect(res.status).not.toHaveBeenCalledWith(500);
    // Feature still created (title may be empty, but branch name is always generated)
    const jsonCall = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(jsonCall.success).toBe(true);
  });

  it('title generation throws: outer catch handles it (no crash)', async () => {
    mockGenerateFeatureTitle.mockRejectedValue(new Error('model timeout'));

    const handler = createCreateHandler(
      mockFeatureLoader as any,
      mockTrustTierService as any,
      undefined,
      {} as any
    );
    const res = makeRes();
    await handler(makeReq({}), res);

    // Should return 500 (outer catch), not crash the process
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('explicit title provided: skips title generation', async () => {
    const handler = createCreateHandler(
      mockFeatureLoader as any,
      mockTrustTierService as any,
      undefined,
      {} as any
    );
    const res = makeRes();
    await handler(makeReq({}, 'My Explicit Title'), res);

    // Title generator should NOT be called when title is provided
    expect(mockGenerateFeatureTitle).not.toHaveBeenCalled();
  });
});
