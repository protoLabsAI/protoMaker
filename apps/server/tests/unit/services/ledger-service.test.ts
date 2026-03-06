/**
 * LedgerService tests — Baseline documentation of record-writing behavior.
 *
 * These tests verify that LedgerService only writes ledger entries for features
 * that reach done or verified status. Failed, blocked, or in-progress features
 * are never recorded — proving they have no ledger entry.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LedgerService } from '@/services/ledger-service.js';
import type { FeatureLoader } from '@/services/feature-loader.js';
import { createEventEmitter } from '@/lib/events.js';
import type { Feature } from '@protolabsai/types';

// -- fs mock (node:fs used directly by LedgerService) --
const mockExistsSync = vi.hoisted(() => vi.fn(() => false));
const mockMkdir = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockAppendFile = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('node:fs', () => ({
  default: {
    existsSync: mockExistsSync,
    promises: {
      mkdir: mockMkdir,
      appendFile: mockAppendFile,
      writeFile: vi.fn().mockResolvedValue(undefined),
      rename: vi.fn().mockResolvedValue(undefined),
    },
    createReadStream: vi.fn(() => {
      // Return an object that readline can iterate — only needed if existsSync returns true
      return {};
    }),
  },
}));

// -- readline mock (only reached if existsSync returns true) --
vi.mock('node:readline', () => ({
  default: {
    createInterface: vi.fn(() => ({
      [Symbol.asyncIterator]: async function* () {
        // empty — no records
      },
    })),
  },
}));

// -- Prevent real GitHub CLI calls in buildRecord --
vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));
vi.mock('node:util', () => ({
  promisify: vi.fn(() => async (..._args: unknown[]) => ({ stdout: '[]', stderr: '' })),
}));

describe('LedgerService', () => {
  let ledgerService: LedgerService;
  let mockFeatureLoader: {
    get: ReturnType<typeof vi.fn>;
    getAll: ReturnType<typeof vi.fn>;
  };
  let events: ReturnType<typeof createEventEmitter>;

  const projectPath = '/test/project';

  function makeDoneFeature(overrides: Partial<Feature> = {}): Feature {
    return {
      id: 'feature-done-1',
      title: 'Done Feature',
      status: 'done',
      category: 'backend',
      description: 'A completed feature',
      createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      completedAt: new Date().toISOString(),
      ...overrides,
    } as Feature;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(false);
    mockAppendFile.mockResolvedValue(undefined);
    mockMkdir.mockResolvedValue(undefined);

    mockFeatureLoader = {
      get: vi.fn(),
      getAll: vi.fn().mockResolvedValue([]),
    };

    events = createEventEmitter();

    ledgerService = new LedgerService(mockFeatureLoader as unknown as FeatureLoader, events);
  });

  describe('recordFeatureCompletion — only done/verified features get ledger entries', () => {
    it('writes a JSONL ledger entry for a done feature', async () => {
      const feature = makeDoneFeature();

      await ledgerService.recordFeatureCompletion(projectPath, feature);

      expect(mockAppendFile).toHaveBeenCalled();
      const [, content] = mockAppendFile.mock.calls[0] as [string, string];
      const record = JSON.parse(content.trim());
      expect(record.featureId).toBe('feature-done-1');
      expect(record.recordType).toBe('feature_completion');
      expect(record.finalStatus).toBe('done');
    });

    it('writes a JSONL ledger entry for a verified feature', async () => {
      const feature = makeDoneFeature({ id: 'feature-verified-1', status: 'verified' });

      await ledgerService.recordFeatureCompletion(projectPath, feature);

      expect(mockAppendFile).toHaveBeenCalled();
      const [, content] = mockAppendFile.mock.calls[0] as [string, string];
      const record = JSON.parse(content.trim());
      expect(record.featureId).toBe('feature-verified-1');
      expect(record.finalStatus).toBe('verified');
    });

    it('includes featureTitle, category, and timestamps in the ledger record', async () => {
      const feature = makeDoneFeature({
        title: 'Auth Feature',
        category: 'auth',
      });

      await ledgerService.recordFeatureCompletion(projectPath, feature);

      const [, content] = mockAppendFile.mock.calls[0] as [string, string];
      const record = JSON.parse(content.trim());
      expect(record.featureTitle).toBe('Auth Feature');
      expect(record.category).toBe('auth');
      expect(record.recordId).toBeDefined();
      expect(record.timestamp).toBeDefined();
    });

    it('is idempotent — skips writing if a record already exists for the featureId', async () => {
      const feature = makeDoneFeature();

      // First call: existsSync returns false → getRecords returns [] → no existing record
      await ledgerService.recordFeatureCompletion(projectPath, feature);
      expect(mockAppendFile).toHaveBeenCalledTimes(1);

      // Simulate an existing ledger line being returned on second call
      mockExistsSync.mockReturnValue(true);
      const existingRecord = JSON.stringify({
        featureId: 'feature-done-1',
        recordType: 'feature_completion',
        recordId: 'some-id',
        timestamp: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        totalCostUsd: 0,
        cycleTimeMs: 0,
        agentTimeMs: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        costByModel: {},
        executionCount: 0,
        failureCount: 0,
        escalated: false,
        isEpic: false,
        executions: [],
        finalStatus: 'done',
        featureTitle: 'Done Feature',
      });

      const { default: readline } = await import('node:readline');
      vi.mocked(readline.createInterface).mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          yield existingRecord;
        },
      } as any);

      await ledgerService.recordFeatureCompletion(projectPath, feature);

      // appendFile should NOT have been called a second time
      expect(mockAppendFile).toHaveBeenCalledTimes(1);
    });
  });

  describe('event subscription — only done/verified trigger record creation', () => {
    it('does NOT write a ledger entry when feature:status-changed fires with newStatus=failed', async () => {
      ledgerService.initialize();

      events.emit('feature:status-changed', {
        projectPath,
        featureId: 'feature-failed-1',
        newStatus: 'failed',
      });

      // Allow async callbacks to run
      await new Promise((resolve) => setTimeout(resolve, 20));

      // featureLoader.get was never called — the subscription filtered it out
      expect(mockFeatureLoader.get).not.toHaveBeenCalled();
      // No ledger record was written — proving failed features have no ledger entry
      expect(mockAppendFile).not.toHaveBeenCalled();
    });

    it('does NOT write a ledger entry when feature:status-changed fires with newStatus=blocked', async () => {
      ledgerService.initialize();

      events.emit('feature:status-changed', {
        projectPath,
        featureId: 'feature-blocked-1',
        newStatus: 'blocked',
      });

      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(mockFeatureLoader.get).not.toHaveBeenCalled();
      expect(mockAppendFile).not.toHaveBeenCalled();
    });

    it('does NOT write a ledger entry when feature:status-changed fires with newStatus=in_progress', async () => {
      ledgerService.initialize();

      events.emit('feature:status-changed', {
        projectPath,
        featureId: 'feature-in-progress',
        newStatus: 'in_progress',
      });

      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(mockFeatureLoader.get).not.toHaveBeenCalled();
      expect(mockAppendFile).not.toHaveBeenCalled();
    });

    it('does NOT write a ledger entry when feature:status-changed fires with newStatus=backlog', async () => {
      ledgerService.initialize();

      events.emit('feature:status-changed', {
        projectPath,
        featureId: 'feature-backlog-1',
        newStatus: 'backlog',
      });

      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(mockFeatureLoader.get).not.toHaveBeenCalled();
      expect(mockAppendFile).not.toHaveBeenCalled();
    });

    it('writes a ledger entry when feature:status-changed fires with newStatus=done', async () => {
      const doneFeature = makeDoneFeature({ id: 'feature-done-ev' });
      ledgerService.initialize();
      mockFeatureLoader.get.mockResolvedValue(doneFeature);

      events.emit('feature:status-changed', {
        projectPath,
        featureId: 'feature-done-ev',
        newStatus: 'done',
      });

      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(mockFeatureLoader.get).toHaveBeenCalledWith(projectPath, 'feature-done-ev');
      expect(mockAppendFile).toHaveBeenCalled();
    });

    it('writes a ledger entry when feature:status-changed fires with newStatus=verified', async () => {
      const verifiedFeature = makeDoneFeature({
        id: 'feature-verified-ev',
        status: 'verified',
      });
      ledgerService.initialize();
      mockFeatureLoader.get.mockResolvedValue(verifiedFeature);

      events.emit('feature:status-changed', {
        projectPath,
        featureId: 'feature-verified-ev',
        newStatus: 'verified',
      });

      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(mockAppendFile).toHaveBeenCalled();
    });
  });

  describe('backfillFromFeatures — only done/verified features get backfilled', () => {
    it('backfills done and verified features, skips all others', async () => {
      const now = new Date().toISOString();
      const features: Partial<Feature>[] = [
        {
          id: 'f-done',
          status: 'done',
          title: 'Done',
          completedAt: now,
          category: 'ui',
          description: '',
        },
        {
          id: 'f-verified',
          status: 'verified',
          title: 'Verified',
          completedAt: now,
          category: 'ui',
          description: '',
        },
        { id: 'f-failed', status: 'failed', title: 'Failed', category: 'ui', description: '' },
        { id: 'f-blocked', status: 'blocked', title: 'Blocked', category: 'ui', description: '' },
        { id: 'f-active', status: 'in_progress', title: 'Active', category: 'ui', description: '' },
      ];

      mockFeatureLoader.getAll.mockResolvedValue(features as Feature[]);

      const count = await ledgerService.backfillFromFeatures(projectPath);

      // Only done + verified = 2 features get backfilled
      expect(count).toBe(2);
      expect(mockAppendFile).toHaveBeenCalledTimes(2);
    });
  });
});
