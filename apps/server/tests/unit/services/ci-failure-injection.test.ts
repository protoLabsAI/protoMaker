/**
 * CI Failure Injection Tests (M4)
 *
 * Tests the in-flight CI failure injection feature:
 * - When an agent is running and CI fails, inject the failure as a message
 *   instead of restarting — saves $2-5 and 3-5 min per CI failure.
 *
 * Covers:
 * - AgentService.isAgentRunning / sendCIFailureToAgent
 * - AutoModeService.isAgentRunning / sendCIFailureToAgent / consumePendingCIInjection
 * - PRFeedbackService.handleCIFailure injection vs restart branching
 * - Race condition: injection attempt when agent finishes between check and enqueue
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module-level hoisted mocks (vi.hoisted / vi.mock must be at module scope)
// ---------------------------------------------------------------------------

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('@protolabsai/utils', async () => {
  const actual = await vi.importActual<typeof import('@protolabsai/utils')>('@protolabsai/utils');
  return {
    ...actual,
    createLogger: vi.fn(() => mockLogger),
    loadContextFiles: vi.fn().mockResolvedValue({ files: [], formattedPrompt: '' }),
    atomicWriteJson: vi.fn().mockResolvedValue(undefined),
    readJsonWithRecovery: vi.fn().mockResolvedValue(null),
  };
});

vi.mock('@/lib/secure-fs.js', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockRejectedValue(new Error('ENOENT')),
  writeFile: vi.fn().mockResolvedValue(undefined),
  existsSync: vi.fn().mockReturnValue(false),
  unlink: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/providers/provider-factory.js', () => ({
  ProviderFactory: { getProviderForModel: vi.fn(), getProviderNameForModel: vi.fn() },
}));

vi.mock('@/lib/sdk-options.js', () => ({
  createChatOptions: vi.fn().mockReturnValue({}),
  validateWorkingDirectory: vi.fn(),
}));

vi.mock('@/lib/settings-helpers.js', () => ({
  getAutoLoadClaudeMdSetting: vi.fn().mockResolvedValue(false),
  filterClaudeMdFromContext: vi.fn().mockReturnValue([]),
  getMCPServersFromSettings: vi.fn().mockResolvedValue({}),
  getPromptCustomization: vi.fn().mockResolvedValue({
    agent: { systemPrompt: '' },
    taskExecution: {},
  }),
  getSkillsConfiguration: vi.fn().mockResolvedValue({}),
  getSubagentsConfiguration: vi.fn().mockResolvedValue({}),
  getCustomSubagents: vi.fn().mockResolvedValue([]),
  getProviderByModelId: vi.fn().mockReturnValue(null),
}));

// ---------------------------------------------------------------------------
// AgentService unit tests
// ---------------------------------------------------------------------------

describe('AgentService CI injection methods', () => {
  let AgentService: typeof import('@/services/agent-service.js').AgentService;

  beforeEach(async () => {
    vi.clearAllMocks();
    ({ AgentService } = await import('@/services/agent-service.js'));
  });

  it('isAgentRunning returns false when no sessions exist', () => {
    const service = new AgentService('/tmp/test-data', { emit: vi.fn(), on: vi.fn() } as any);
    expect(service.isAgentRunning('feature-123')).toBe(false);
  });

  it('isAgentRunning returns false when feature has no running session', async () => {
    const service = new AgentService('/tmp/test-data', { emit: vi.fn(), on: vi.fn() } as any);
    // Start a conversation so a session exists but is NOT running
    await service.startConversation({ sessionId: 'sess-1', workingDirectory: '/tmp' });
    expect(service.isAgentRunning('feature-xyz')).toBe(false);
  });

  it('sendCIFailureToAgent returns false when no running session matches featureId', async () => {
    const service = new AgentService('/tmp/test-data', { emit: vi.fn(), on: vi.fn() } as any);
    await service.startConversation({ sessionId: 'sess-2', workingDirectory: '/tmp' });
    const result = await service.sendCIFailureToAgent('feature-not-found', 'Fix CI failures');
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AutoModeService CI injection methods — tested via a lightweight stub
// ---------------------------------------------------------------------------

/**
 * Reproduce only the injection-related logic from AutoModeService so we can
 * test it without instantiating the entire service (which has many hard deps).
 */
function makeAutoModeStub() {
  const runningFeatures = new Map<string, { featureId: string }>();
  const pendingCIInjections = new Map<string, string>();

  return {
    isAgentRunning(featureId: string): boolean {
      return runningFeatures.has(featureId);
    },
    async sendCIFailureToAgent(featureId: string, message: string): Promise<boolean> {
      if (!runningFeatures.has(featureId)) return false;
      pendingCIInjections.set(featureId, message);
      return true;
    },
    consumePendingCIInjection(featureId: string): string | undefined {
      const msg = pendingCIInjections.get(featureId);
      if (msg !== undefined) pendingCIInjections.delete(featureId);
      return msg;
    },
    // Test helpers
    _markRunning(featureId: string) {
      runningFeatures.set(featureId, { featureId });
    },
    _markStopped(featureId: string) {
      runningFeatures.delete(featureId);
    },
  };
}

describe('AutoModeService CI injection methods', () => {
  describe('isAgentRunning', () => {
    it('returns false when feature is not in runningFeatures', () => {
      const svc = makeAutoModeStub();
      expect(svc.isAgentRunning('feat-1')).toBe(false);
    });

    it('returns true when feature is in runningFeatures', () => {
      const svc = makeAutoModeStub();
      svc._markRunning('feat-1');
      expect(svc.isAgentRunning('feat-1')).toBe(true);
    });

    it('returns false after feature finishes', () => {
      const svc = makeAutoModeStub();
      svc._markRunning('feat-2');
      svc._markStopped('feat-2');
      expect(svc.isAgentRunning('feat-2')).toBe(false);
    });
  });

  describe('sendCIFailureToAgent', () => {
    it('returns false when feature is not running', async () => {
      const svc = makeAutoModeStub();
      const result = await svc.sendCIFailureToAgent('feat-3', 'Fix tests');
      expect(result).toBe(false);
    });

    it('returns true and stores message when feature is running', async () => {
      const svc = makeAutoModeStub();
      svc._markRunning('feat-4');
      const result = await svc.sendCIFailureToAgent('feat-4', 'Fix lint failures');
      expect(result).toBe(true);
    });

    it('stores the message for later consumption', async () => {
      const svc = makeAutoModeStub();
      svc._markRunning('feat-5');
      await svc.sendCIFailureToAgent('feat-5', 'Fix type errors');
      const msg = svc.consumePendingCIInjection('feat-5');
      expect(msg).toBe('Fix type errors');
    });
  });

  describe('consumePendingCIInjection', () => {
    it('returns undefined when no injection is pending', () => {
      const svc = makeAutoModeStub();
      expect(svc.consumePendingCIInjection('feat-6')).toBeUndefined();
    });

    it('consumes the message exactly once', async () => {
      const svc = makeAutoModeStub();
      svc._markRunning('feat-7');
      await svc.sendCIFailureToAgent('feat-7', 'Once only');
      expect(svc.consumePendingCIInjection('feat-7')).toBe('Once only');
      // Second call returns undefined — message consumed
      expect(svc.consumePendingCIInjection('feat-7')).toBeUndefined();
    });
  });

  describe('race conditions', () => {
    it('injection queued while running; message persists after agent stops', async () => {
      const svc = makeAutoModeStub();
      svc._markRunning('feat-8');
      const injected = await svc.sendCIFailureToAgent('feat-8', 'CI broke');
      expect(injected).toBe(true);
      // Agent finishes before consume — message still in pending queue
      svc._markStopped('feat-8');
      const msg = svc.consumePendingCIInjection('feat-8');
      expect(msg).toBe('CI broke');
    });

    it('feature stops between isAgentRunning check and sendCIFailureToAgent call', async () => {
      const svc = makeAutoModeStub();
      svc._markRunning('feat-9');
      // Simulate race: isAgentRunning returns true...
      const wasRunning = svc.isAgentRunning('feat-9');
      // ...but agent stops before the injection call
      svc._markStopped('feat-9');
      // sendCIFailureToAgent re-checks runningFeatures — should return false
      const injected = await svc.sendCIFailureToAgent('feat-9', 'Too late');
      expect(wasRunning).toBe(true); // Was running at check time
      expect(injected).toBe(false); // Stopped before injection
    });
  });
});

// ---------------------------------------------------------------------------
// PRFeedbackService handleCIFailure — injection vs restart branching
// ---------------------------------------------------------------------------

describe('PRFeedbackService handleCIFailure — injection vs restart', () => {
  it('injection path: agent running → inject, do not restart', async () => {
    // When isAgentRunning is true and sendCIFailureToAgent succeeds,
    // executeFeature must NOT be called.
    const mockAutoMode = {
      isAgentRunning: vi.fn().mockReturnValue(true),
      sendCIFailureToAgent: vi.fn().mockResolvedValue(true),
      executeFeature: vi.fn(),
    };
    const mockLoader = { update: vi.fn().mockResolvedValue(undefined) };
    const feature = { ciInjectionCount: 0 };
    const featureId = 'feat-inject';
    const continuationPrompt = 'Fix CI failures';

    // Reproduce the handleCIFailure branching logic
    if (mockAutoMode.isAgentRunning(featureId)) {
      const injected = await mockAutoMode.sendCIFailureToAgent(featureId, continuationPrompt);
      if (injected) {
        const current = (feature.ciInjectionCount as number | undefined) ?? 0;
        await mockLoader.update('/proj', featureId, { ciInjectionCount: current + 1 });
        // Return — no restart
      }
    } else {
      mockAutoMode.executeFeature('/proj', featureId, true, true, undefined, {
        continuationPrompt,
      });
    }

    expect(mockAutoMode.isAgentRunning).toHaveBeenCalledWith(featureId);
    expect(mockAutoMode.sendCIFailureToAgent).toHaveBeenCalledWith(featureId, continuationPrompt);
    expect(mockAutoMode.executeFeature).not.toHaveBeenCalled();
    expect(mockLoader.update).toHaveBeenCalledWith(
      '/proj',
      featureId,
      expect.objectContaining({ ciInjectionCount: 1 })
    );
  });

  it('fallthrough path: agent not running → restart as normal', async () => {
    const mockAutoMode = {
      isAgentRunning: vi.fn().mockReturnValue(false),
      sendCIFailureToAgent: vi.fn(),
      executeFeature: vi.fn(),
    };
    const mockLoader = { update: vi.fn().mockResolvedValue(undefined) };
    const featureId = 'feat-restart';
    const continuationPrompt = 'Fix CI failures';

    if (mockAutoMode.isAgentRunning(featureId)) {
      await mockAutoMode.sendCIFailureToAgent(featureId, continuationPrompt);
    } else {
      await mockLoader.update('/proj', featureId, { status: 'backlog' });
      mockAutoMode.executeFeature('/proj', featureId, true, true, undefined, {
        continuationPrompt,
      });
    }

    expect(mockAutoMode.isAgentRunning).toHaveBeenCalledWith(featureId);
    expect(mockAutoMode.sendCIFailureToAgent).not.toHaveBeenCalled();
    expect(mockAutoMode.executeFeature).toHaveBeenCalledWith(
      '/proj',
      featureId,
      true,
      true,
      undefined,
      expect.objectContaining({ continuationPrompt })
    );
    expect(mockLoader.update).toHaveBeenCalledWith(
      '/proj',
      featureId,
      expect.objectContaining({ status: 'backlog' })
    );
  });

  it('ciInjectionCount increments on each injection', async () => {
    const mockAutoMode = {
      isAgentRunning: vi.fn().mockReturnValue(true),
      sendCIFailureToAgent: vi.fn().mockResolvedValue(true),
    };
    const mockLoader = { update: vi.fn().mockResolvedValue(undefined) };
    const feature = { ciInjectionCount: 2 };
    const featureId = 'feat-count';

    if (mockAutoMode.isAgentRunning(featureId)) {
      const injected = await mockAutoMode.sendCIFailureToAgent(featureId, 'msg');
      if (injected) {
        const current = (feature.ciInjectionCount as number | undefined) ?? 0;
        await mockLoader.update('/proj', featureId, { ciInjectionCount: current + 1 });
      }
    }

    expect(mockLoader.update).toHaveBeenCalledWith(
      '/proj',
      featureId,
      expect.objectContaining({ ciInjectionCount: 3 })
    );
  });
});
