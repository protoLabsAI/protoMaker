/**
 * Unit tests for AutomationService
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

// Mock @protolabs-ai/platform secureFs — use real fs in a temp dir
vi.mock('@protolabs-ai/platform', () => {
  return {
    secureFs: {
      access: async (p: string) => {
        await fs.promises.access(p);
      },
      readFile: async (p: string, enc: string) => {
        return fs.promises.readFile(p, enc as BufferEncoding);
      },
      writeFile: async (p: string, data: string, enc: string) => {
        return fs.promises.writeFile(p, data, enc as BufferEncoding);
      },
      mkdir: async (p: string, opts?: { recursive?: boolean }) => {
        return fs.promises.mkdir(p, opts);
      },
    },
  };
});

// Mock @protolabs-ai/utils
vi.mock('@protolabs-ai/utils', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Mock maintenance-tasks
vi.mock('../../../src/services/maintenance-tasks.js', () => ({
  registerMaintenanceFlows: vi.fn(),
}));

import { AutomationService, flowRegistry } from '../../../src/services/automation-service.js';
import type { SchedulerService } from '../../../src/services/scheduler-service.js';

function createMockScheduler(): SchedulerService {
  return {
    registerTask: vi.fn().mockResolvedValue(undefined),
    unregisterTask: vi.fn().mockResolvedValue(undefined),
    enableTask: vi.fn().mockResolvedValue(undefined),
    disableTask: vi.fn().mockResolvedValue(undefined),
    updateTaskSchedule: vi.fn().mockResolvedValue(undefined),
    getTask: vi.fn().mockReturnValue(undefined),
    initialize: vi.fn(),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    listTasks: vi.fn().mockReturnValue([]),
    triggerTask: vi.fn().mockResolvedValue(undefined),
  } as unknown as SchedulerService;
}

describe('AutomationService', () => {
  let service: AutomationService;
  let scheduler: ReturnType<typeof createMockScheduler>;
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'automation-test-'));
    scheduler = createMockScheduler();
    service = new AutomationService(scheduler, tempDir);
    vi.clearAllMocks();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('list()', () => {
    it('returns empty array when no automations exist', async () => {
      const result = await service.list();
      expect(result).toEqual([]);
    });
  });

  describe('create()', () => {
    it('creates a cron automation and persists it', async () => {
      const automation = await service.create({
        name: 'Test Cron',
        flowId: 'my-flow',
        trigger: { type: 'cron', expression: '0 * * * *' },
        enabled: true,
      });

      expect(automation.id).toBeTruthy();
      expect(automation.name).toBe('Test Cron');
      expect(automation.flowId).toBe('my-flow');
      expect(automation.trigger.type).toBe('cron');
      expect(automation.enabled).toBe(true);
      expect(automation.createdAt).toBeTruthy();
      expect(automation.updatedAt).toBeTruthy();
    });

    it('registers cron automation with scheduler on create', async () => {
      await service.create({
        name: 'Cron Auto',
        flowId: 'flow-x',
        trigger: { type: 'cron', expression: '*/5 * * * *' },
        enabled: true,
      });

      expect(scheduler.registerTask).toHaveBeenCalledOnce();
      const [taskId, name, cron] = vi.mocked(scheduler.registerTask).mock.calls[0];
      expect(taskId).toMatch(/^automation:/);
      expect(name).toBe('Cron Auto');
      expect(cron).toBe('*/5 * * * *');
    });

    it('does not register disabled automation with scheduler', async () => {
      await service.create({
        name: 'Disabled',
        flowId: 'flow-x',
        trigger: { type: 'cron', expression: '0 * * * *' },
        enabled: false,
      });

      expect(scheduler.registerTask).not.toHaveBeenCalled();
    });

    it('does not register event automation with scheduler', async () => {
      await service.create({
        name: 'Event Auto',
        flowId: 'flow-y',
        trigger: { type: 'event', eventType: 'feature.done' },
        enabled: true,
      });

      expect(scheduler.registerTask).not.toHaveBeenCalled();
    });

    it('defaults enabled to true', async () => {
      const auto = await service.create({
        name: 'Default Enabled',
        flowId: 'flow-z',
        trigger: { type: 'webhook', path: '/hook' },
      });

      expect(auto.enabled).toBe(true);
    });
  });

  describe('get()', () => {
    it('returns automation by id', async () => {
      const created = await service.create({
        name: 'Get Test',
        flowId: 'f1',
        trigger: { type: 'cron', expression: '0 0 * * *' },
        enabled: false,
      });

      const fetched = await service.get(created.id);
      expect(fetched).toBeDefined();
      expect(fetched!.id).toBe(created.id);
      expect(fetched!.name).toBe('Get Test');
    });

    it('returns undefined for unknown id', async () => {
      const result = await service.get('nonexistent');
      expect(result).toBeUndefined();
    });
  });

  describe('list() after creates', () => {
    it('returns all created automations', async () => {
      await service.create({
        name: 'A1',
        flowId: 'f1',
        trigger: { type: 'cron', expression: '0 * * * *' },
        enabled: false,
      });
      await service.create({
        name: 'A2',
        flowId: 'f2',
        trigger: { type: 'event', eventType: 'test' },
        enabled: true,
      });

      const all = await service.list();
      expect(all).toHaveLength(2);
      expect(all.map((a) => a.name)).toContain('A1');
      expect(all.map((a) => a.name)).toContain('A2');
    });
  });

  describe('update()', () => {
    it('returns undefined for unknown id', async () => {
      const result = await service.update('nonexistent', { enabled: false });
      expect(result).toBeUndefined();
    });

    it('updates fields and persists', async () => {
      const created = await service.create({
        name: 'Original',
        flowId: 'f1',
        trigger: { type: 'cron', expression: '0 0 * * *' },
        enabled: false,
      });

      const updated = await service.update(created.id, { name: 'Updated', enabled: true });
      expect(updated).toBeDefined();
      expect(updated!.name).toBe('Updated');
      expect(updated!.enabled).toBe(true);

      // Verify persistence
      const fetched = await service.get(created.id);
      expect(fetched!.name).toBe('Updated');
    });

    it('enables scheduler task when enabling cron automation', async () => {
      const created = await service.create({
        name: 'Toggle',
        flowId: 'f1',
        trigger: { type: 'cron', expression: '0 0 * * *' },
        enabled: false,
      });

      vi.mocked(scheduler.registerTask).mockClear();

      await service.update(created.id, { enabled: true });

      // Should register since there was no existing task
      expect(scheduler.registerTask).toHaveBeenCalledOnce();
    });

    it('disables scheduler task when disabling cron automation', async () => {
      const created = await service.create({
        name: 'Disable Test',
        flowId: 'f1',
        trigger: { type: 'cron', expression: '0 0 * * *' },
        enabled: true,
      });

      // Simulate existing task in scheduler
      vi.mocked(scheduler.getTask).mockReturnValue({
        id: `automation:${created.id}`,
        name: 'Disable Test',
        cronExpression: '0 0 * * *',
        enabled: true,
      } as ReturnType<SchedulerService['getTask']>);

      await service.update(created.id, { enabled: false });

      expect(scheduler.disableTask).toHaveBeenCalledWith(`automation:${created.id}`);
    });
  });

  describe('delete()', () => {
    it('returns false for unknown id', async () => {
      const result = await service.delete('nonexistent');
      expect(result).toBe(false);
    });

    it('deletes automation and unregisters from scheduler', async () => {
      const created = await service.create({
        name: 'To Delete',
        flowId: 'f1',
        trigger: { type: 'cron', expression: '0 * * * *' },
        enabled: false,
      });

      const result = await service.delete(created.id);
      expect(result).toBe(true);

      const fetched = await service.get(created.id);
      expect(fetched).toBeUndefined();

      expect(scheduler.unregisterTask).toHaveBeenCalledWith(`automation:${created.id}`);
    });
  });

  describe('getHistory()', () => {
    it('returns empty array for automation with no runs', async () => {
      const created = await service.create({
        name: 'No Runs',
        flowId: 'f1',
        trigger: { type: 'cron', expression: '0 * * * *' },
        enabled: false,
      });

      const runs = await service.getHistory(created.id);
      expect(runs).toEqual([]);
    });
  });

  describe('executeAutomation()', () => {
    it('throws for unknown automation id', async () => {
      await expect(service.executeAutomation('nonexistent')).rejects.toThrow(
        'Automation not found: nonexistent'
      );
    });

    it('throws when flow is not registered', async () => {
      const created = await service.create({
        name: 'No Flow',
        flowId: 'unregistered-flow',
        trigger: { type: 'cron', expression: '0 * * * *' },
        enabled: false,
      });

      await expect(service.executeAutomation(created.id)).rejects.toThrow(
        'Flow not registered: unregistered-flow'
      );
    });

    it('executes the flow and returns a run record', async () => {
      const flowFn = vi.fn().mockResolvedValue(undefined);
      flowRegistry.register('test-execute-flow', flowFn);

      const created = await service.create({
        name: 'Exec Test',
        flowId: 'test-execute-flow',
        trigger: { type: 'cron', expression: '0 * * * *' },
        enabled: true,
        modelConfig: { model: 'sonnet' },
      });

      const run = await service.executeAutomation(created.id, 'manual');

      expect(flowFn).toHaveBeenCalledOnce();
      expect(flowFn).toHaveBeenCalledWith({ model: 'sonnet' });
      expect(run.automationId).toBe(created.id);
      expect(run.status).toBe('success');
      expect(run.startedAt).toBeTruthy();
      expect(run.completedAt).toBeTruthy();
      expect(run.error).toBeUndefined();

      flowRegistry.unregister('test-execute-flow');
    });

    it('records failure when flow throws', async () => {
      const flowFn = vi.fn().mockRejectedValue(new Error('flow error'));
      flowRegistry.register('fail-flow', flowFn);

      const created = await service.create({
        name: 'Fail Test',
        flowId: 'fail-flow',
        trigger: { type: 'cron', expression: '0 * * * *' },
        enabled: true,
      });

      const run = await service.executeAutomation(created.id, 'manual');

      expect(run.status).toBe('failure');
      expect(run.error).toBe('flow error');

      flowRegistry.unregister('fail-flow');
    });

    it('persists run in history', async () => {
      const flowFn = vi.fn().mockResolvedValue(undefined);
      flowRegistry.register('history-flow', flowFn);

      const created = await service.create({
        name: 'History Test',
        flowId: 'history-flow',
        trigger: { type: 'cron', expression: '0 * * * *' },
        enabled: true,
      });

      await service.executeAutomation(created.id, 'manual');
      await service.executeAutomation(created.id, 'scheduler');

      const runs = await service.getHistory(created.id);
      expect(runs).toHaveLength(2);

      flowRegistry.unregister('history-flow');
    });
  });

  describe('syncWithScheduler()', () => {
    it('registers maintenance flows and user cron automations', async () => {
      const { registerMaintenanceFlows } =
        await import('../../../src/services/maintenance-tasks.js');

      // Create one enabled cron automation and one disabled
      await service.create({
        name: 'Active Cron',
        flowId: 'f1',
        trigger: { type: 'cron', expression: '0 * * * *' },
        enabled: true,
      });
      await service.create({
        name: 'Disabled Cron',
        flowId: 'f2',
        trigger: { type: 'cron', expression: '0 * * * *' },
        enabled: false,
      });

      vi.mocked(scheduler.registerTask).mockClear();

      // Pass null for optional deps to keep seeding deterministic (3 always-on built-ins only)
      const mockDeps = {
        events: {} as never,
        autoModeService: {} as never,
        featureHealthService: null as never,
        integrityWatchdogService: null as never,
        featureLoader: null as never,
        settingsService: {} as never,
      };

      await service.syncWithScheduler(mockDeps);

      expect(registerMaintenanceFlows).toHaveBeenCalledOnce();
      // 3 always-on built-ins + 1 enabled user automation; disabled user automation is skipped
      expect(scheduler.registerTask).toHaveBeenCalledTimes(4);
      const taskIds = vi.mocked(scheduler.registerTask).mock.calls.map(([id]) => id);
      expect(taskIds.every((id) => id.startsWith('automation:'))).toBe(true);
    });
  });

  describe('loadAll()', () => {
    it('is an alias for list()', async () => {
      await service.create({
        name: 'Load All Test',
        flowId: 'f1',
        trigger: { type: 'cron', expression: '0 * * * *' },
        enabled: false,
      });

      const listResult = await service.list();
      const loadAllResult = await service.loadAll();

      expect(loadAllResult).toEqual(listResult);
    });
  });
});
