/**
 * Unit tests for auto-generated feature titles in the create handler.
 *
 * Verifies:
 * - Empty title + description -> generated non-empty title
 * - Provided title -> unchanged (no regression)
 * - Generation failure -> graceful fallback (no 500)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@protolabsai/utils', () => ({
  createLogger: () => ({ info() {}, debug() {}, warn() {}, error() {} }),
}));

// Mock the title generator
const generateFeatureTitle = vi.fn();
vi.mock('../../../src/services/title-generator.js', () => ({
  generateFeatureTitle: (...args: unknown[]) => generateFeatureTitle(...args),
}));

// Mock quarantine service - spy on the constructor
const quarantineProcessSpy = vi.fn();
vi.mock('../../../src/services/quarantine-service.js', () => ({
  QuarantineService: class {
    constructor() {}
    process = quarantineProcessSpy;
  },
}));

// Mock trust tier service
vi.mock('../../../src/services/trust-tier-service.js', () => ({
  TrustTierService: class {
    classifyTrust = vi.fn().mockReturnValue('trusted');
  },
}));

// Mock feature loader methods at module level
const findDuplicateTitleMock = vi.fn();
const findCandidateEpicMock = vi.fn();
const createMock = vi.fn();
vi.mock('../../../src/services/feature-loader.js', () => ({
  FeatureLoader: {
    findDuplicateTitle: (...args: unknown[]) => findDuplicateTitleMock(...args),
    findCandidateEpicForTitle: (...args: unknown[]) => findCandidateEpicMock(...args),
    create: (...args: unknown[]) => createMock(...args),
  },
}));

vi.mock('../common.js', () => ({
  getErrorMessage: vi.fn((err) => (err instanceof Error ? err.message : 'Unknown error')),
  logError: vi.fn(),
}));

import { createCreateHandler } from '../../../src/routes/features/routes/create.js';

const mockQuarantineOutcome = {
  approved: true,
  sanitizedTitle: 'Sanitized Title',
  sanitizedDescription: 'Sanitized description',
  entry: {
    id: 'quarantine-1',
    result: 'approved',
    stage: 'passed',
    violations: [],
  },
};

const mockFeatureLoader = {
  findDuplicateTitle: findDuplicateTitleMock,
  findCandidateEpicForTitle: findCandidateEpicMock,
  create: createMock,
};

const mockTrustTierService = {
  classifyTrust: vi.fn().mockReturnValue('trusted'),
};

describe('createCreateHandler - auto-generate title', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generateFeatureTitle.mockResolvedValue('Generated Title');
    findDuplicateTitleMock.mockResolvedValue(null);
    findCandidateEpicMock.mockResolvedValue(null);
    quarantineProcessSpy.mockResolvedValue(mockQuarantineOutcome);
    createMock.mockImplementation((_projectPath, feature) =>
      Promise.resolve({ id: 'feat-1', projectPath: '/test/project', ...feature })
    );
    mockTrustTierService.classifyTrust.mockReturnValue('trusted');
  });

  it('generates a title when title is empty and description is provided', async () => {
    const handler = createCreateHandler(
      mockFeatureLoader as any,
      mockTrustTierService as any,
      undefined,
      {} as any
    );

    const req = {
      body: {
        projectPath: '/test/project',
        feature: {
          title: '',
          description: 'Add a dark-mode toggle to settings',
        },
      },
      headers: {},
      cookies: {},
    };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    await handler(req, res);

    // Should call the title generator
    expect(generateFeatureTitle).toHaveBeenCalledWith(
      'Add a dark-mode toggle to settings',
      {},
      '/test/project'
    );

    // The created feature should have the generated title (sanitized)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        feature: expect.objectContaining({
          title: 'Sanitized Title',
        }),
      })
    );
  });

  it('uses provided title verbatim when title is given', async () => {
    const handler = createCreateHandler(
      mockFeatureLoader as any,
      mockTrustTierService as any,
      undefined,
      {} as any
    );

    const req = {
      body: {
        projectPath: '/test/project',
        feature: {
          title: 'My Explicit Title',
          description: 'Some description',
        },
      },
      headers: {},
      cookies: {},
    };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    await handler(req, res);

    // Should NOT call the title generator
    expect(generateFeatureTitle).not.toHaveBeenCalled();

    // The created feature should have the explicit title (sanitized)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        feature: expect.objectContaining({
          title: 'Sanitized Title',
        }),
      })
    );
  });

  it('falls back gracefully when title generation returns null', async () => {
    generateFeatureTitle.mockResolvedValue(null);

    const handler = createCreateHandler(
      mockFeatureLoader as any,
      mockTrustTierService as any,
      undefined,
      {} as any
    );

    const req = {
      body: {
        projectPath: '/test/project',
        feature: {
          title: '',
          description: 'Add a dark-mode toggle',
        },
      },
      headers: {},
      cookies: {},
    };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    await handler(req, res);

    // Should attempt generation
    expect(generateFeatureTitle).toHaveBeenCalled();

    // Should NOT return 500 - should create with empty title
    expect(res.status).not.toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        feature: expect.objectContaining({
          title: '',
        }),
      })
    );
  });

  it('falls back gracefully when title generation throws', async () => {
    generateFeatureTitle.mockRejectedValue(new Error('Model timeout'));

    const handler = createCreateHandler(
      mockFeatureLoader as any,
      mockTrustTierService as any,
      undefined,
      {} as any
    );

    const req = {
      body: {
        projectPath: '/test/project',
        feature: {
          title: '',
          description: 'Add a dark-mode toggle',
        },
      },
      headers: {},
      cookies: {},
    };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    await handler(req, res);

    // Should attempt generation
    expect(generateFeatureTitle).toHaveBeenCalled();

    // Should return 500 error (outer catch handles the throw)
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('does not generate title when no description is provided', async () => {
    const handler = createCreateHandler(
      mockFeatureLoader as any,
      mockTrustTierService as any,
      undefined,
      {} as any
    );

    const req = {
      body: {
        projectPath: '/test/project',
        feature: {
          title: '',
          description: '',
        },
      },
      headers: {},
      cookies: {},
    };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    await handler(req, res);

    // Should NOT call the title generator when description is empty
    expect(generateFeatureTitle).not.toHaveBeenCalled();
  });
});
