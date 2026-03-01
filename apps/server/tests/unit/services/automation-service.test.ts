import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AutomationService } from '@/services/automation-service.js';
import * as secureFs from '@/lib/secure-fs.js';
import { atomicWriteJson, readJsonWithRecovery } from '@protolabs-ai/utils';
import type { Automation, AutomationRunRecord } from '@protolabs-ai/types';

vi.mock('@/lib/secure-fs.js');
vi.mock('@protolabs-ai/utils', async () => {
  const actual = await vi.importActual<typeof import('@protolabs-ai/utils')>('@protolabs-ai/utils');
  return {
    ...actual,
    atomicWriteJson: vi.fn(),
    readJsonWithRecovery: vi.fn(),
    createLogger: vi.fn(() => ({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    })),
  };
});

const projectPath = '/test/project';

const baseModelConfig: Automation['modelConfig'] = {
  model: 'claude-sonnet-4-6',
  thinkingLevel: 'none',
};

function makeAutomation(overrides: Partial<Automation> = {}): Automation {
  return {
    id: 'auto-123',
    name: 'Test Automation',
    enabled: true,
    trigger: { type: 'cron', expression: '0 * * * *' },
    flowId: 'flow-abc',
    modelConfig: baseModelConfig,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('AutomationService', () => {
  let service: AutomationService;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset singleton for each test
    // @ts-expect-error accessing private static for test isolation
    AutomationService.instance = undefined;
    service = AutomationService.getInstance();

    vi.mocked(secureFs.access).mockResolvedValue(undefined);
    vi.mocked(secureFs.mkdir).mockResolvedValue(undefined);
    vi.mocked(secureFs.unlink).mockResolvedValue(undefined);
    vi.mocked(atomicWriteJson).mockResolvedValue(undefined);
    vi.mocked(readJsonWithRecovery).mockResolvedValue({
      data: null,
      recovered: false,
      source: 'default',
    });
  });

  describe('getInstance', () => {
    it('should return the same instance', () => {
      const a = AutomationService.getInstance();
      const b = AutomationService.getInstance();
      expect(a).toBe(b);
    });
  });

  describe('create', () => {
    it('should create automation with generated id and timestamps', async () => {
      const result = await service.create(projectPath, {
        name: 'My Automation',
        trigger: { type: 'cron', expression: '0 0 * * *' },
        flowId: 'flow-1',
        modelConfig: baseModelConfig,
      });

      expect(result.id).toBeDefined();
      expect(result.name).toBe('My Automation');
      expect(result.enabled).toBe(true);
      expect(result.trigger).toEqual({ type: 'cron', expression: '0 0 * * *' });
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
    });

    it('should persist automation via atomicWriteJson', async () => {
      await service.create(projectPath, {
        name: 'My Automation',
        trigger: { type: 'event', eventType: 'feature:created' },
        flowId: 'flow-1',
        modelConfig: baseModelConfig,
      });

      expect(atomicWriteJson).toHaveBeenCalledWith(
        expect.stringContaining('.automaker/automations/'),
        expect.objectContaining({ name: 'My Automation' }),
        expect.any(Object)
      );
    });

    it('should set enabled=false when passed explicitly', async () => {
      const result = await service.create(projectPath, {
        name: 'Disabled',
        enabled: false,
        trigger: { type: 'webhook', path: '/my-hook' },
        flowId: 'flow-2',
        modelConfig: baseModelConfig,
      });

      expect(result.enabled).toBe(false);
    });

    it('should store optional fields when provided', async () => {
      const result = await service.create(projectPath, {
        name: 'Full',
        description: 'A full automation',
        trigger: { type: 'cron', expression: '* * * * *' },
        flowId: 'flow-full',
        modelConfig: baseModelConfig,
        tags: ['alpha', 'beta'],
        metadata: { owner: 'team-a' },
        inputSchema: { type: 'object', properties: {} },
      });

      expect(result.description).toBe('A full automation');
      expect(result.tags).toEqual(['alpha', 'beta']);
      expect(result.metadata).toEqual({ owner: 'team-a' });
      expect(result.inputSchema).toEqual({ type: 'object', properties: {} });
    });
  });

  describe('get', () => {
    it('should return automation when file exists', async () => {
      const automation = makeAutomation();
      vi.mocked(readJsonWithRecovery).mockResolvedValue({
        data: automation,
        recovered: false,
        source: 'main',
      });

      const result = await service.get(projectPath, 'auto-123');
      expect(result).toEqual(automation);
    });

    it('should return null when file does not exist', async () => {
      vi.mocked(secureFs.access).mockRejectedValue(new Error('ENOENT'));

      const result = await service.get(projectPath, 'missing-id');
      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    it('should update fields and bump updatedAt', async () => {
      const original = makeAutomation();
      vi.mocked(readJsonWithRecovery).mockResolvedValue({
        data: original,
        recovered: false,
        source: 'main',
      });

      const updated = await service.update(projectPath, 'auto-123', { name: 'New Name' });

      expect(updated.name).toBe('New Name');
      expect(updated.id).toBe('auto-123');
      expect(updated.createdAt).toBe('2026-01-01T00:00:00Z');
      expect(updated.updatedAt).not.toBe('2026-01-01T00:00:00Z');
    });

    it('should throw if automation not found', async () => {
      vi.mocked(secureFs.access).mockRejectedValue(new Error('ENOENT'));

      await expect(service.update(projectPath, 'missing-id', { name: 'x' })).rejects.toThrow(
        'Automation missing-id not found'
      );
    });

    it('should persist updated automation', async () => {
      const original = makeAutomation();
      vi.mocked(readJsonWithRecovery).mockResolvedValue({
        data: original,
        recovered: false,
        source: 'main',
      });

      await service.update(projectPath, 'auto-123', { enabled: false });

      expect(atomicWriteJson).toHaveBeenCalledWith(
        expect.stringContaining('auto-123.json'),
        expect.objectContaining({ enabled: false }),
        expect.any(Object)
      );
    });
  });

  describe('delete', () => {
    it('should delete the automation file', async () => {
      await service.delete(projectPath, 'auto-123');

      expect(secureFs.unlink).toHaveBeenCalledWith(expect.stringContaining('auto-123.json'));
    });

    it('should also delete history file if it exists', async () => {
      await service.delete(projectPath, 'auto-123');

      // unlink called for main file and history file
      expect(secureFs.unlink).toHaveBeenCalledTimes(2);
    });

    it('should throw if automation file does not exist', async () => {
      vi.mocked(secureFs.access).mockRejectedValue(new Error('ENOENT'));

      await expect(service.delete(projectPath, 'missing')).rejects.toThrow(
        'Automation missing not found'
      );
    });

    it('should not throw if history file is missing during delete', async () => {
      // First access (automation file) succeeds; second (history file) fails
      vi.mocked(secureFs.access)
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('ENOENT'));

      await expect(service.delete(projectPath, 'auto-123')).resolves.not.toThrow();
      expect(secureFs.unlink).toHaveBeenCalledTimes(1);
    });
  });

  describe('list', () => {
    it('should return empty array when directory does not exist', async () => {
      vi.mocked(secureFs.access).mockRejectedValue(new Error('ENOENT'));

      const result = await service.list(projectPath);
      expect(result).toEqual([]);
    });

    it('should list all automations', async () => {
      const auto1 = makeAutomation({ id: 'auto-1', name: 'First' });
      const auto2 = makeAutomation({ id: 'auto-2', name: 'Second' });

      vi.mocked(secureFs.readdir).mockResolvedValue(['auto-1.json', 'auto-2.json'] as any);
      vi.mocked(readJsonWithRecovery)
        .mockResolvedValueOnce({ data: auto1, recovered: false, source: 'main' })
        .mockResolvedValueOnce({ data: auto2, recovered: false, source: 'main' });

      const result = await service.list(projectPath);
      expect(result).toHaveLength(2);
    });

    it('should filter by enabled status', async () => {
      const enabledAuto = makeAutomation({ id: 'auto-enabled', enabled: true });
      const disabledAuto = makeAutomation({ id: 'auto-disabled', enabled: false });

      vi.mocked(secureFs.readdir).mockResolvedValue([
        'auto-enabled.json',
        'auto-disabled.json',
      ] as any);
      vi.mocked(readJsonWithRecovery)
        .mockResolvedValueOnce({ data: enabledAuto, recovered: false, source: 'main' })
        .mockResolvedValueOnce({ data: disabledAuto, recovered: false, source: 'main' });

      const result = await service.list(projectPath, { enabled: true });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('auto-enabled');
    });

    it('should filter by trigger type', async () => {
      const cronAuto = makeAutomation({
        id: 'cron-auto',
        trigger: { type: 'cron', expression: '0 * * * *' },
      });
      const eventAuto = makeAutomation({
        id: 'event-auto',
        trigger: { type: 'event', eventType: 'feature:created' },
      });

      vi.mocked(secureFs.readdir).mockResolvedValue(['cron-auto.json', 'event-auto.json'] as any);
      vi.mocked(readJsonWithRecovery)
        .mockResolvedValueOnce({ data: cronAuto, recovered: false, source: 'main' })
        .mockResolvedValueOnce({ data: eventAuto, recovered: false, source: 'main' });

      const result = await service.list(projectPath, { triggerType: 'cron' });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('cron-auto');
    });

    it('should filter by tags', async () => {
      const tagged = makeAutomation({ id: 'tagged', tags: ['alpha', 'beta'] });
      const untagged = makeAutomation({ id: 'untagged', tags: ['gamma'] });

      vi.mocked(secureFs.readdir).mockResolvedValue(['tagged.json', 'untagged.json'] as any);
      vi.mocked(readJsonWithRecovery)
        .mockResolvedValueOnce({ data: tagged, recovered: false, source: 'main' })
        .mockResolvedValueOnce({ data: untagged, recovered: false, source: 'main' });

      const result = await service.list(projectPath, { tags: ['alpha'] });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('tagged');
    });

    it('should exclude history files from listing', async () => {
      const auto1 = makeAutomation({ id: 'auto-1' });

      vi.mocked(secureFs.readdir).mockResolvedValue(['auto-1.json', 'auto-1.history.json'] as any);
      vi.mocked(readJsonWithRecovery).mockResolvedValue({
        data: auto1,
        recovered: false,
        source: 'main',
      });

      const result = await service.list(projectPath);
      expect(result).toHaveLength(1);
    });
  });

  describe('getHistory', () => {
    it('should return empty array when no history file exists', async () => {
      const automation = makeAutomation();
      vi.mocked(readJsonWithRecovery)
        .mockResolvedValueOnce({ data: automation, recovered: false, source: 'main' }) // get automation
        .mockResolvedValueOnce({ data: [], recovered: false, source: 'default' }); // history
      // history file access fails
      vi.mocked(secureFs.access)
        .mockResolvedValueOnce(undefined) // automation file exists
        .mockRejectedValueOnce(new Error('ENOENT')); // history file missing

      const result = await service.getHistory(projectPath, 'auto-123');
      expect(result).toEqual([]);
    });

    it('should return history records when file exists', async () => {
      const automation = makeAutomation();
      const records: AutomationRunRecord[] = [
        {
          id: 'run-1',
          automationId: 'auto-123',
          status: 'success',
          startedAt: '2026-01-01T00:00:00Z',
          completedAt: '2026-01-01T00:01:00Z',
        },
      ];

      vi.mocked(readJsonWithRecovery)
        .mockResolvedValueOnce({ data: automation, recovered: false, source: 'main' })
        .mockResolvedValueOnce({ data: records, recovered: false, source: 'main' });

      const result = await service.getHistory(projectPath, 'auto-123');
      expect(result).toEqual(records);
    });

    it('should throw if automation not found', async () => {
      vi.mocked(secureFs.access).mockRejectedValue(new Error('ENOENT'));

      await expect(service.getHistory(projectPath, 'missing')).rejects.toThrow(
        'Automation missing not found'
      );
    });
  });
});
