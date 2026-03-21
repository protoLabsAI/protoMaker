/**
 * Unit tests for Ava self-scheduling tools
 *
 * Covers the 4 scheduling tools added to buildAvaTools() when
 * config.scheduling is true and a SchedulerService is provided:
 *
 *   schedule_task        – create/update a recurring Ava task
 *   cancel_task          – remove a recurring Ava task
 *   list_scheduled_tasks – list all ava:-prefixed tasks
 *   trigger_task         – immediately execute a task by ID
 *
 * Verifies:
 *   - ava: namespace enforcement
 *   - simpleQuery callback invocation
 *   - persistence round-trip (.automaker/ava-tasks.json)
 *   - SchedulerService delegation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import * as fsSync from 'fs';

// ---------------------------------------------------------------------------
// Module mocks – must be declared before imports
// ---------------------------------------------------------------------------

vi.mock('@protolabsai/platform', () => ({
  getNotesWorkspacePath: vi.fn().mockReturnValue('/tmp/notes'),
  ensureNotesDir: vi.fn().mockResolvedValue(undefined),
  getAutomakerDir: vi.fn().mockReturnValue('/tmp/.automaker'),
  secureFs: {
    readFile: vi.fn().mockRejectedValue(new Error('not found')),
    writeFile: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
    access: vi.fn().mockRejectedValue(new Error('not found')),
    exists: vi.fn().mockResolvedValue(false),
    listFiles: vi.fn().mockResolvedValue([]),
    stat: vi.fn().mockRejectedValue(new Error('not found')),
    unlink: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@protolabsai/utils', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('@protolabsai/git-utils', () => ({}));

vi.mock('../../src/services/github-merge-service.js', () => ({
  githubMergeService: { merge: vi.fn(), getPRStatus: vi.fn() },
}));

vi.mock('../../src/services/pr-watcher-service.js', () => ({
  getPRWatcherService: vi.fn().mockReturnValue(null),
}));

vi.mock('../../src/services/event-history-service.js', () => ({
  getEventHistoryService: vi.fn().mockReturnValue(null),
}));

vi.mock('../../src/services/briefing-cursor-service.js', () => ({
  getBriefingCursorService: vi.fn().mockReturnValue(null),
}));

vi.mock('../../src/routes/project-pm/pm-agent.js', () => ({
  queryPm: vi.fn().mockResolvedValue({ text: '' }),
}));

vi.mock('../../src/providers/simple-query-service.js', () => ({
  simpleQuery: vi.fn().mockResolvedValue({ text: 'task result' }),
}));

import { buildAvaTools } from '../../src/routes/chat/ava-tools.js';
import type { SchedulerService } from '../../src/services/scheduler-service.js';
import type { TimerRegistryEntry } from '@protolabsai/types';
import { simpleQuery } from '../../src/providers/simple-query-service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ExecutableTool = {
  execute: (input: unknown, opts: { toolCallId: string }) => Promise<unknown>;
};

function getExecute(tools: Record<string, unknown>, name: string) {
  const tool = tools[name] as ExecutableTool | undefined;
  if (!tool) throw new Error(`Tool "${name}" not found`);
  return (input: unknown) => tool.execute(input, { toolCallId: `test-${name}` });
}

function createMockScheduler(overrides?: Partial<SchedulerService>): SchedulerService {
  return {
    registerTask: vi.fn().mockResolvedValue(undefined),
    unregisterTask: vi.fn().mockResolvedValue(false),
    registerInterval: vi.fn(),
    unregisterInterval: vi.fn().mockReturnValue(false),
    listAll: vi.fn().mockReturnValue([]),
    listTasks: vi.fn().mockReturnValue([]),
    enableTask: vi.fn().mockResolvedValue(undefined),
    disableTask: vi.fn().mockResolvedValue(undefined),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    triggerTask: vi.fn().mockResolvedValue(undefined),
    initialize: vi.fn(),
    getTask: vi.fn().mockReturnValue(undefined),
    updateTaskSchedule: vi.fn().mockResolvedValue(undefined),
    getMetrics: vi.fn().mockReturnValue({}),
    ...overrides,
  } as unknown as SchedulerService;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Ava scheduling tools', () => {
  let tempDir: string;
  let schedulerService: SchedulerService;

  beforeEach(() => {
    tempDir = fsSync.mkdtempSync(path.join(os.tmpdir(), 'ava-scheduling-test-'));
    // Create .automaker directory so file writes succeed
    fsSync.mkdirSync(path.join(tempDir, '.automaker'), { recursive: true });
    schedulerService = createMockScheduler();
    // Reset simpleQuery default (mockReset:true in vitest config clears per-test)
    vi.mocked(simpleQuery).mockResolvedValue({ text: 'task result' });
  });

  afterEach(() => {
    fsSync.rmSync(tempDir, { recursive: true, force: true });
  });

  function buildSchedulingTools() {
    return buildAvaTools(tempDir, { schedulerService }, { scheduling: true });
  }

  // -------------------------------------------------------------------------
  // schedule_task
  // -------------------------------------------------------------------------

  describe('schedule_task', () => {
    it('registers a cron task with ava: namespace prefix', async () => {
      const tools = buildSchedulingTools();
      const exec = getExecute(tools, 'schedule_task');

      const result = (await exec({
        name: 'Daily Report',
        prompt: 'Summarise the board',
        schedule: { type: 'cron', expression: '0 9 * * 1-5' },
      })) as Record<string, unknown>;

      expect(result.taskId).toBe('ava:daily-report');
      expect(result.message).toContain('Daily Report');
    });

    it('calls schedulerService.registerTask for cron schedules', async () => {
      const tools = buildSchedulingTools();
      const exec = getExecute(tools, 'schedule_task');

      await exec({
        name: 'Standup',
        prompt: 'Run standup',
        schedule: { type: 'cron', expression: '0 9 * * *' },
      });

      expect(schedulerService.registerTask).toHaveBeenCalledWith(
        'ava:standup',
        'Standup',
        '0 9 * * *',
        expect.any(Function)
      );
    });

    it('calls schedulerService.registerInterval for interval schedules', async () => {
      const tools = buildSchedulingTools();
      const exec = getExecute(tools, 'schedule_task');

      await exec({
        name: 'Health Ping',
        prompt: 'Check health',
        schedule: { type: 'interval', intervalMs: 60_000 },
      });

      expect(schedulerService.registerInterval).toHaveBeenCalledWith(
        'ava:health-ping',
        'Health Ping',
        60_000,
        expect.any(Function),
        expect.objectContaining({ category: 'monitor' })
      );
    });

    it('unregisters existing interval before re-registering with new interval', async () => {
      const tools = buildSchedulingTools();
      const exec = getExecute(tools, 'schedule_task');

      await exec({
        name: 'Poller',
        prompt: 'Poll',
        schedule: { type: 'interval', intervalMs: 30_000 },
      });

      expect(schedulerService.unregisterInterval).toHaveBeenCalledWith('ava:poller');
      expect(schedulerService.registerInterval).toHaveBeenCalled();
    });

    it('persists task definition to .automaker/ava-tasks.json', async () => {
      const tools = buildSchedulingTools();
      const exec = getExecute(tools, 'schedule_task');

      await exec({
        name: 'Weekly Summary',
        prompt: 'Weekly prompt',
        schedule: { type: 'cron', expression: '0 8 * * 1' },
        description: 'Runs every Monday',
      });

      const filePath = path.join(tempDir, '.automaker', 'ava-tasks.json');
      const content = JSON.parse(fsSync.readFileSync(filePath, 'utf-8')) as unknown[];
      expect(content).toHaveLength(1);
      const task = content[0] as Record<string, unknown>;
      expect(task.id).toBe('ava:weekly-summary');
      expect(task.name).toBe('Weekly Summary');
      expect(task.prompt).toBe('Weekly prompt');
      expect(task.description).toBe('Runs every Monday');
      expect((task.schedule as Record<string, unknown>).type).toBe('cron');
      expect(task.createdAt).toBeTruthy();
    });

    it('updates existing persisted task when re-scheduling with same name', async () => {
      const tools = buildSchedulingTools();
      const exec = getExecute(tools, 'schedule_task');

      // First schedule
      await exec({
        name: 'Report',
        prompt: 'Old prompt',
        schedule: { type: 'cron', expression: '0 9 * * *' },
      });

      // Re-schedule with updated prompt
      await exec({
        name: 'Report',
        prompt: 'New prompt',
        schedule: { type: 'cron', expression: '0 10 * * *' },
      });

      const filePath = path.join(tempDir, '.automaker', 'ava-tasks.json');
      const content = JSON.parse(fsSync.readFileSync(filePath, 'utf-8')) as unknown[];
      expect(content).toHaveLength(1);
      expect((content[0] as Record<string, unknown>).prompt).toBe('New prompt');
    });

    it('task handler invokes simpleQuery with stored prompt', async () => {
      const tools = buildSchedulingTools();
      const exec = getExecute(tools, 'schedule_task');

      await exec({
        name: 'Alert Check',
        prompt: 'Check for alerts',
        schedule: { type: 'cron', expression: '*/5 * * * *' },
      });

      // Capture the handler passed to registerTask and invoke it
      const registeredHandler = vi.mocked(schedulerService.registerTask).mock.calls[0]?.[3];
      expect(registeredHandler).toBeDefined();
      await registeredHandler!();

      expect(simpleQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: 'Check for alerts',
          cwd: tempDir,
          maxTurns: 1,
          allowedTools: [],
        })
      );
    });
  });

  // -------------------------------------------------------------------------
  // cancel_task
  // -------------------------------------------------------------------------

  describe('cancel_task', () => {
    it('rejects task IDs that do not start with ava:', async () => {
      const tools = buildSchedulingTools();
      const exec = getExecute(tools, 'cancel_task');

      const result = (await exec({ taskId: 'system:heartbeat' })) as Record<string, unknown>;

      expect(result.error).toMatch(/ava:/);
      expect(schedulerService.unregisterTask).not.toHaveBeenCalled();
    });

    it('calls unregisterTask and unregisterInterval for valid ava: task', async () => {
      vi.mocked(schedulerService.unregisterTask).mockResolvedValue(true);
      vi.mocked(schedulerService.unregisterInterval).mockReturnValue(false);

      // Persist a task first so cancel_task can find it
      const filePath = path.join(tempDir, '.automaker', 'ava-tasks.json');
      fsSync.writeFileSync(
        filePath,
        JSON.stringify([
          {
            id: 'ava:my-task',
            name: 'My Task',
            prompt: 'Do something',
            schedule: { type: 'cron', expression: '0 * * * *' },
            createdAt: new Date().toISOString(),
          },
        ])
      );

      const tools = buildSchedulingTools();
      const exec = getExecute(tools, 'cancel_task');

      const result = (await exec({ taskId: 'ava:my-task' })) as Record<string, unknown>;

      expect(schedulerService.unregisterTask).toHaveBeenCalledWith('ava:my-task');
      expect(schedulerService.unregisterInterval).toHaveBeenCalledWith('ava:my-task');
      expect(result.taskId).toBe('ava:my-task');
      expect(result.message).toContain('cancelled');
    });

    it('returns error when task is not registered in scheduler', async () => {
      vi.mocked(schedulerService.unregisterTask).mockResolvedValue(false);
      vi.mocked(schedulerService.unregisterInterval).mockReturnValue(false);

      const tools = buildSchedulingTools();
      const exec = getExecute(tools, 'cancel_task');

      const result = (await exec({ taskId: 'ava:ghost-task' })) as Record<string, unknown>;

      expect(result.error).toBeTruthy();
    });

    it('removes task from persisted .automaker/ava-tasks.json on cancel', async () => {
      vi.mocked(schedulerService.unregisterTask).mockResolvedValue(true);

      const filePath = path.join(tempDir, '.automaker', 'ava-tasks.json');
      fsSync.writeFileSync(
        filePath,
        JSON.stringify([
          {
            id: 'ava:keep-me',
            name: 'Keep Me',
            prompt: 'p1',
            schedule: { type: 'cron', expression: '0 * * * *' },
            createdAt: new Date().toISOString(),
          },
          {
            id: 'ava:delete-me',
            name: 'Delete Me',
            prompt: 'p2',
            schedule: { type: 'cron', expression: '0 * * * *' },
            createdAt: new Date().toISOString(),
          },
        ])
      );

      const tools = buildSchedulingTools();
      const exec = getExecute(tools, 'cancel_task');
      await exec({ taskId: 'ava:delete-me' });

      const remaining = JSON.parse(fsSync.readFileSync(filePath, 'utf-8')) as unknown[];
      expect(remaining).toHaveLength(1);
      expect((remaining[0] as Record<string, unknown>).id).toBe('ava:keep-me');
    });
  });

  // -------------------------------------------------------------------------
  // list_scheduled_tasks
  // -------------------------------------------------------------------------

  describe('list_scheduled_tasks', () => {
    it('returns empty list when no tasks are persisted', async () => {
      const tools = buildSchedulingTools();
      const exec = getExecute(tools, 'list_scheduled_tasks');

      const result = (await exec({})) as Record<string, unknown>;

      expect(result.tasks).toEqual([]);
      expect(result.count).toBe(0);
    });

    it('lists persisted tasks with live timer state merged in', async () => {
      const liveTimer: Partial<TimerRegistryEntry> = {
        id: 'ava:reporter',
        name: 'Reporter',
        type: 'cron',
        enabled: true,
        executionCount: 5,
        failureCount: 0,
        lastRun: '2026-03-21T09:00:00.000Z',
      };
      vi.mocked(schedulerService.listAll).mockReturnValue([liveTimer as TimerRegistryEntry]);

      const filePath = path.join(tempDir, '.automaker', 'ava-tasks.json');
      fsSync.writeFileSync(
        filePath,
        JSON.stringify([
          {
            id: 'ava:reporter',
            name: 'Reporter',
            prompt: 'Report on board',
            schedule: { type: 'cron', expression: '0 9 * * *' },
            createdAt: '2026-03-01T00:00:00.000Z',
          },
        ])
      );

      const tools = buildSchedulingTools();
      const exec = getExecute(tools, 'list_scheduled_tasks');
      const result = (await exec({})) as Record<string, unknown>;

      expect(result.count).toBe(1);
      const tasks = result.tasks as Array<Record<string, unknown>>;
      expect(tasks[0]?.id).toBe('ava:reporter');
      expect(tasks[0]?.enabled).toBe(true);
      expect(tasks[0]?.executionCount).toBe(5);
      expect(tasks[0]?.lastRun).toBe('2026-03-21T09:00:00.000Z');
    });

    it('filters live timers to ava: prefix only', async () => {
      const liveTimers: Partial<TimerRegistryEntry>[] = [
        {
          id: 'system:heartbeat',
          name: 'Heartbeat',
          type: 'interval',
          enabled: true,
          executionCount: 0,
          failureCount: 0,
        },
        {
          id: 'ava:my-check',
          name: 'My Check',
          type: 'interval',
          enabled: true,
          executionCount: 1,
          failureCount: 0,
        },
      ];
      vi.mocked(schedulerService.listAll).mockReturnValue(liveTimers as TimerRegistryEntry[]);

      const filePath = path.join(tempDir, '.automaker', 'ava-tasks.json');
      fsSync.writeFileSync(
        filePath,
        JSON.stringify([
          {
            id: 'ava:my-check',
            name: 'My Check',
            prompt: 'Check things',
            schedule: { type: 'interval', intervalMs: 60_000 },
            createdAt: new Date().toISOString(),
          },
        ])
      );

      const tools = buildSchedulingTools();
      const exec = getExecute(tools, 'list_scheduled_tasks');
      const result = (await exec({})) as Record<string, unknown>;

      // Only the ava: task should be listed
      const tasks = result.tasks as Array<Record<string, unknown>>;
      expect(tasks.every((t) => (t.id as string).startsWith('ava:'))).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // trigger_task
  // -------------------------------------------------------------------------

  describe('trigger_task', () => {
    it('rejects task IDs that do not start with ava:', async () => {
      const tools = buildSchedulingTools();
      const exec = getExecute(tools, 'trigger_task');

      const result = (await exec({ taskId: 'system:heartbeat' })) as Record<string, unknown>;

      expect(result.error).toMatch(/ava:/);
      expect(simpleQuery).not.toHaveBeenCalled();
    });

    it('returns error when task is not in persisted store', async () => {
      const tools = buildSchedulingTools();
      const exec = getExecute(tools, 'trigger_task');

      const result = (await exec({ taskId: 'ava:nonexistent' })) as Record<string, unknown>;

      expect(result.error).toBeTruthy();
      expect(simpleQuery).not.toHaveBeenCalled();
    });

    it('calls simpleQuery with the task prompt when task exists', async () => {
      const filePath = path.join(tempDir, '.automaker', 'ava-tasks.json');
      fsSync.writeFileSync(
        filePath,
        JSON.stringify([
          {
            id: 'ava:ping',
            name: 'Ping',
            prompt: 'Check system status',
            schedule: { type: 'cron', expression: '0 * * * *' },
            createdAt: new Date().toISOString(),
          },
        ])
      );

      const tools = buildSchedulingTools();
      const exec = getExecute(tools, 'trigger_task');
      const result = (await exec({ taskId: 'ava:ping' })) as Record<string, unknown>;

      expect(simpleQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: 'Check system status',
          cwd: tempDir,
          maxTurns: 1,
          allowedTools: [],
        })
      );
      expect(result.success).toBe(true);
      expect(result.taskId).toBe('ava:ping');
      expect(result.executedAt).toBeTruthy();
      expect(typeof result.duration).toBe('number');
    });

    it('returns success: false with error message when simpleQuery throws', async () => {
      vi.mocked(simpleQuery).mockRejectedValueOnce(new Error('LLM timeout'));

      const filePath = path.join(tempDir, '.automaker', 'ava-tasks.json');
      fsSync.writeFileSync(
        filePath,
        JSON.stringify([
          {
            id: 'ava:flaky',
            name: 'Flaky',
            prompt: 'Flaky prompt',
            schedule: { type: 'cron', expression: '0 * * * *' },
            createdAt: new Date().toISOString(),
          },
        ])
      );

      const tools = buildSchedulingTools();
      const exec = getExecute(tools, 'trigger_task');
      const result = (await exec({ taskId: 'ava:flaky' })) as Record<string, unknown>;

      expect(result.success).toBe(false);
      expect(result.error).toBe('LLM timeout');
    });

    it('truncates long simpleQuery results to 1000 characters', async () => {
      vi.mocked(simpleQuery).mockResolvedValueOnce({ text: 'x'.repeat(2000) });

      const filePath = path.join(tempDir, '.automaker', 'ava-tasks.json');
      fsSync.writeFileSync(
        filePath,
        JSON.stringify([
          {
            id: 'ava:verbose',
            name: 'Verbose',
            prompt: 'Generate verbose output',
            schedule: { type: 'cron', expression: '0 * * * *' },
            createdAt: new Date().toISOString(),
          },
        ])
      );

      const tools = buildSchedulingTools();
      const exec = getExecute(tools, 'trigger_task');
      const result = (await exec({ taskId: 'ava:verbose' })) as Record<string, unknown>;

      expect((result.result as string).length).toBe(1000);
    });
  });

  // -------------------------------------------------------------------------
  // Scheduling tools disabled when config.scheduling is false
  // -------------------------------------------------------------------------

  describe('tools absent when scheduling is disabled', () => {
    it('does not include scheduling tools when config.scheduling is false', () => {
      const tools = buildAvaTools(tempDir, { schedulerService }, { scheduling: false });
      expect(tools['schedule_task']).toBeUndefined();
      expect(tools['cancel_task']).toBeUndefined();
      expect(tools['list_scheduled_tasks']).toBeUndefined();
      expect(tools['trigger_task']).toBeUndefined();
    });

    it('does not include scheduling tools when schedulerService is absent', () => {
      const tools = buildAvaTools(tempDir, {}, { scheduling: true });
      expect(tools['schedule_task']).toBeUndefined();
    });
  });
});
