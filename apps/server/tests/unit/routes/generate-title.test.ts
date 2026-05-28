/**
 * Unit tests for the generate-title route handler (#feature-1779913907802-36blk88h8).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@protolabsai/utils', () => ({
  createLogger: () => ({ info() {}, debug() {}, warn() {}, error() {} }),
}));

vi.mock('@protolabsai/model-resolver', () => ({
  resolvePhaseModel: vi.fn((phaseModel) => phaseModel),
}));

const simpleQuery = vi.fn();
vi.mock('../../../src/providers/simple-query-service.js', () => ({
  simpleQuery: (...args: unknown[]) => simpleQuery(...args),
}));

const captureTrainingRow = vi.fn();
vi.mock('../../../src/services/training-capture.js', () => ({
  captureTrainingRow: (...args: unknown[]) => captureTrainingRow(...args),
}));

const getPromptCustomization = vi.fn();
const getPhaseModelWithOverrides = vi.fn();
vi.mock('../../../src/lib/settings-helpers.js', () => ({
  getPromptCustomization: (...args: unknown[]) => getPromptCustomization(...args),
  getPhaseModelWithOverrides: (...args: unknown[]) => getPhaseModelWithOverrides(...args),
}));

import { createGenerateTitleHandler } from '../../../src/routes/features/routes/generate-title.js';
import { resolvePhaseModel } from '@protolabsai/model-resolver';

// Mock settings service
const mockSettingsService = {
  getCredentials: vi.fn(),
};

describe('createGenerateTitleHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: phaseModel resolves to protolabs/nano
    getPhaseModelWithOverrides.mockResolvedValue({
      phaseModel: { model: 'protolabs/nano' },
      isProjectOverride: false,
    });

    // resolvePhaseModel returns the phaseModel as-is (model: 'protolabs/nano')
    vi.mocked(resolvePhaseModel).mockReturnValue({ model: 'protolabs/nano' });

    // Default prompt customization
    getPromptCustomization.mockResolvedValue({
      titleGeneration: {
        systemPrompt: 'You are a helpful assistant that generates concise titles.',
      },
    });

    // Default credentials
    mockSettingsService.getCredentials.mockResolvedValue({});
  });

  it('resolves model from getPhaseModelWithOverrides and passes to simpleQuery', async () => {
    simpleQuery.mockResolvedValue({ text: 'Add user auth' });

    const handler = createGenerateTitleHandler(mockSettingsService);
    const req = { body: { description: 'Add user authentication' } };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    await handler(req, res);

    expect(getPhaseModelWithOverrides).toHaveBeenCalledWith(
      'titleGenerationModel',
      mockSettingsService,
      undefined,
      '[TitleGenerator]'
    );
    expect(simpleQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'protolabs/nano',
      })
    );
  });

  it('returns { success: true, title } with trimmed title from simpleQuery', async () => {
    simpleQuery.mockResolvedValue({ text: '  Add User Auth  ' });

    const handler = createGenerateTitleHandler(mockSettingsService);
    const req = { body: { description: 'Add user authentication' } };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    await handler(req, res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      title: 'Add User Auth',
    });
  });

  it('responds 400 with success: false on empty description', async () => {
    const handler = createGenerateTitleHandler(mockSettingsService);
    const req = { body: { description: '' } };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });

  it('responds 400 with success: false on whitespace-only description', async () => {
    const handler = createGenerateTitleHandler(mockSettingsService);
    const req = { body: { description: '   ' } };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });

  it('responds 400 when description is missing', async () => {
    const handler = createGenerateTitleHandler(mockSettingsService);
    const req = { body: {} };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });
});
