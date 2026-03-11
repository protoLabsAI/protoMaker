import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JobExecutorService, sanitizeCommand } from '@/services/job-executor-service.js';
import type { CalendarService } from '@/services/calendar-service.js';
import type { AutoModeService } from '@/services/auto-mode-service.js';
import type { AutomationService } from '@/services/automation-service.js';
import type { SettingsService } from '@/services/settings-service.js';
import type { CalendarEvent } from '@protolabsai/types';
import { createMockEventEmitter } from '../../helpers/mock-factories.js';

// Mock node:child_process so run-command tests don't spawn real processes
// Use importOriginal to preserve other exports (execFile, spawn, etc.)
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    exec: vi.fn(),
  };
});

// Import after mock so vi.mocked() works
import { exec } from 'node:child_process';

// Silence logger output during tests
vi.mock('@protolabsai/utils', async () => {
  const actual = await vi.importActual<typeof import('@protolabsai/utils')>('@protolabsai/utils');
  return {
    ...actual,
    createLogger: vi.fn(() => ({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    })),
  };
});

describe('JobExecutorService', () => {
  let service: JobExecutorService;
  let mockCalendarService: Partial<CalendarService>;
  let mockAutoModeService: Partial<AutoModeService>;
  let mockAutomationService: Partial<AutomationService>;
  let mockSettingsService: Partial<SettingsService>;
  let mockEvents: ReturnType<typeof createMockEventEmitter>;

  const projectPath = '/test/project';

  function makeJob(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
    return {
      id: 'job-1',
      title: 'Test Job',
      date: '2026-03-10',
      time: '09:00',
      type: 'job',
      jobStatus: 'pending',
      jobAction: { type: 'start-agent', featureId: 'feature-123' },
      projectPath,
      createdAt: '2026-03-01T00:00:00Z',
      updatedAt: '2026-03-01T00:00:00Z',
      ...overrides,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();

    mockCalendarService = {
      updateEvent: vi.fn().mockResolvedValue({}),
      emitReminder: vi.fn(),
      getDueJobs: vi.fn().mockResolvedValue([]),
    };

    mockAutoModeService = {
      executeFeature: vi.fn().mockResolvedValue(undefined),
    };

    mockAutomationService = {
      executeAutomation: vi.fn().mockResolvedValue(undefined),
    };

    mockSettingsService = {
      getGlobalSettings: vi.fn().mockResolvedValue({ projects: [] }),
    };

    mockEvents = createMockEventEmitter();

    service = new JobExecutorService(
      mockCalendarService as CalendarService,
      mockAutoModeService as AutoModeService,
      mockAutomationService as AutomationService,
      mockSettingsService as SettingsService,
      mockEvents
    );
  });

  describe('executeJob', () => {
    describe('action dispatch', () => {
      it('dispatches start-agent action to autoModeService.executeFeature', async () => {
        const job = makeJob({ jobAction: { type: 'start-agent', featureId: 'feature-abc' } });

        await service.executeJob(projectPath, job);

        expect(mockAutoModeService.executeFeature).toHaveBeenCalledWith(
          projectPath,
          'feature-abc',
          true
        );
      });

      it('dispatches run-automation action to automationService.executeAutomation', async () => {
        const job = makeJob({
          jobAction: { type: 'run-automation', automationId: 'automation-xyz' },
        });

        await service.executeJob(projectPath, job);

        expect(mockAutomationService.executeAutomation).toHaveBeenCalledWith(
          'automation-xyz',
          'scheduler'
        );
      });

      it('dispatches run-command action via exec', async () => {
        const mockExec = vi.mocked(exec);
        mockExec.mockImplementation((_cmd: string, _opts: unknown, callback: unknown) => {
          (callback as (err: null, stdout: string, stderr: string) => void)(null, 'ok', '');
          return {} as ReturnType<typeof exec>;
        });

        const job = makeJob({
          jobAction: { type: 'run-command', command: 'npm run build' },
        });

        await service.executeJob(projectPath, job);

        expect(mockExec).toHaveBeenCalledWith(
          'npm run build',
          expect.objectContaining({ timeout: expect.any(Number) }),
          expect.any(Function)
        );
      });
    });

    describe('status transitions', () => {
      it('marks job as running before dispatch', async () => {
        const job = makeJob({ jobAction: { type: 'start-agent', featureId: 'feat-1' } });

        await service.executeJob(projectPath, job);

        // First updateEvent call should set status to 'running'
        expect(mockCalendarService.updateEvent).toHaveBeenNthCalledWith(
          1,
          projectPath,
          job.id,
          expect.objectContaining({ jobStatus: 'running' })
        );
      });

      it('marks job as completed after successful dispatch', async () => {
        const job = makeJob({ jobAction: { type: 'start-agent', featureId: 'feat-1' } });

        await service.executeJob(projectPath, job);

        expect(mockCalendarService.updateEvent).toHaveBeenCalledWith(
          projectPath,
          job.id,
          expect.objectContaining({ jobStatus: 'completed' })
        );
      });

      it('marks job as failed when dispatch throws', async () => {
        mockAutoModeService.executeFeature = vi.fn().mockRejectedValue(new Error('Agent failed'));
        const job = makeJob({ jobAction: { type: 'start-agent', featureId: 'feat-fail' } });

        await service.executeJob(projectPath, job);

        expect(mockCalendarService.updateEvent).toHaveBeenCalledWith(
          projectPath,
          job.id,
          expect.objectContaining({ jobStatus: 'failed' })
        );
      });

      it('includes error message in jobResult when job fails', async () => {
        const errorMsg = 'Something broke';
        mockAutoModeService.executeFeature = vi.fn().mockRejectedValue(new Error(errorMsg));
        const job = makeJob({ jobAction: { type: 'start-agent', featureId: 'feat-fail' } });

        await service.executeJob(projectPath, job);

        expect(mockCalendarService.updateEvent).toHaveBeenCalledWith(
          projectPath,
          job.id,
          expect.objectContaining({
            jobStatus: 'failed',
            jobResult: expect.objectContaining({ error: errorMsg }),
          })
        );
      });

      it('includes timing info in jobResult on success', async () => {
        const job = makeJob({ jobAction: { type: 'start-agent', featureId: 'feat-1' } });

        await service.executeJob(projectPath, job);

        expect(mockCalendarService.updateEvent).toHaveBeenCalledWith(
          projectPath,
          job.id,
          expect.objectContaining({
            jobStatus: 'completed',
            jobResult: expect.objectContaining({
              startedAt: expect.any(String),
              completedAt: expect.any(String),
              durationMs: expect.any(Number),
            }),
          })
        );
      });
    });

    describe('event emission', () => {
      it('emits job:started and job:completed events on success', async () => {
        const job = makeJob({ jobAction: { type: 'start-agent', featureId: 'feat-1' } });

        await service.executeJob(projectPath, job);

        expect(mockEvents.emit).toHaveBeenCalledWith(
          'job:started',
          expect.objectContaining({ jobId: job.id, projectPath })
        );
        expect(mockEvents.emit).toHaveBeenCalledWith(
          'job:completed',
          expect.objectContaining({ jobId: job.id, projectPath })
        );
      });

      it('emits job:started and job:failed events on failure', async () => {
        mockAutoModeService.executeFeature = vi.fn().mockRejectedValue(new Error('fail'));
        const job = makeJob({ jobAction: { type: 'start-agent', featureId: 'feat-1' } });

        await service.executeJob(projectPath, job);

        expect(mockEvents.emit).toHaveBeenCalledWith(
          'job:started',
          expect.objectContaining({ jobId: job.id })
        );
        expect(mockEvents.emit).toHaveBeenCalledWith(
          'job:failed',
          expect.objectContaining({ jobId: job.id, error: 'fail' })
        );
      });
    });

    it('skips execution if job has no jobAction', async () => {
      const job = makeJob({ jobAction: undefined });

      await service.executeJob(projectPath, job);

      expect(mockAutoModeService.executeFeature).not.toHaveBeenCalled();
      expect(mockAutomationService.executeAutomation).not.toHaveBeenCalled();
      expect(mockCalendarService.updateEvent).not.toHaveBeenCalled();
    });
  });

  describe('sanitizeCommand', () => {
    describe('allows valid commands', () => {
      it('allows a simple npm command', () => {
        expect(() => sanitizeCommand('npm run build')).not.toThrow();
      });

      it('allows git commands', () => {
        expect(() => sanitizeCommand('git status')).not.toThrow();
      });

      it('allows commands with flags', () => {
        expect(() => sanitizeCommand('ls -la')).not.toThrow();
      });

      it('allows python scripts', () => {
        expect(() => sanitizeCommand('python3 scripts/migrate.py')).not.toThrow();
      });

      it('returns the command unchanged when valid', () => {
        const cmd = 'npm run build';
        expect(sanitizeCommand(cmd)).toBe(cmd);
      });

      it('accepts a command at exactly the max length (1024 chars)', () => {
        const exactCommand = 'a'.repeat(1024);
        expect(() => sanitizeCommand(exactCommand)).not.toThrow();
      });
    });

    describe('rejects shell metacharacters', () => {
      it('rejects commands with semicolons', () => {
        expect(() => sanitizeCommand('npm run build; rm -rf /')).toThrow(
          /unescaped shell metacharacters/
        );
      });

      it('rejects commands with pipe operator', () => {
        expect(() => sanitizeCommand('cat /etc/passwd | grep root')).toThrow(
          /unescaped shell metacharacters/
        );
      });

      it('rejects commands with output redirect', () => {
        expect(() => sanitizeCommand('echo hello > /tmp/file')).toThrow(
          /unescaped shell metacharacters/
        );
      });

      it('rejects commands with input redirect', () => {
        expect(() => sanitizeCommand('cat < /etc/passwd')).toThrow(
          /unescaped shell metacharacters/
        );
      });

      it('rejects commands with $ variable expansion', () => {
        expect(() => sanitizeCommand('echo $HOME')).toThrow(/unescaped shell metacharacters/);
      });

      it('rejects commands with backtick substitution', () => {
        expect(() => sanitizeCommand('echo `whoami`')).toThrow(/unescaped shell metacharacters/);
      });

      it('rejects commands with && chaining', () => {
        expect(() => sanitizeCommand('npm run build && npm run test')).toThrow(
          /unescaped shell metacharacters/
        );
      });
    });

    describe('rejects oversized commands', () => {
      it('rejects a command exceeding the 1024-character limit', () => {
        const longCommand = 'a'.repeat(1025);
        expect(() => sanitizeCommand(longCommand)).toThrow(/exceeds maximum length/);
      });
    });
  });
});
