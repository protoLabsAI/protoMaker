/**
 * DiscordChannelHandler Unit Tests
 *
 * Tests for the signal-aware Discord channel handler:
 * - ✅ reaction on a gate message calls resolveGate with action: 'advance'
 * - ❌ reaction on a gate message calls resolveGate with action: 'reject'
 * - cancelPending edits the gate message to resolved status
 * - requestApproval delegates to DiscordBotService.postGateHoldMessage
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  DiscordChannelHandler,
  UIChannelHandler,
} from '../../../src/services/channel-handlers/discord-channel-handler.js';
import type { DiscordBotService } from '../../../src/services/discord-bot-service.js';

// Minimal mock of DiscordBotService for channel handler tests
const createMockDiscordBotService = (): DiscordBotService => {
  const gatePendingMessages = new Map<string, string>(); // featureId → messageId
  const gateMessageChannels = new Map<string, string>(); // featureId → channelId

  return {
    postGateHoldMessage: vi.fn(
      async (channelId: string, featureId: string, _projectPath: string) => {
        const messageId = `msg-${featureId}`;
        gatePendingMessages.set(featureId, messageId);
        gateMessageChannels.set(featureId, channelId);
        return messageId;
      }
    ),
    editGateMessage: vi.fn(async () => {}),
    getGateMessageId: vi.fn((featureId: string) => gatePendingMessages.get(featureId)),
    getGateMessageChannelId: vi.fn((featureId: string) => gateMessageChannels.get(featureId)),
    createThread: vi.fn(async () => 'thread-123'),
    sendToChannel: vi.fn(async () => true),
    waitForReply: vi.fn(async () => 'test reply'),
  } as unknown as DiscordBotService;
};

/**
 * Thin wrapper around DiscordBotService to test gate reaction handling logic.
 *
 * Simulates the internal pendingGateMessages map and handleReaction logic
 * without requiring a live Discord client.
 */
class GateReactionTestHarness {
  private pendingGateMessages = new Map<
    string,
    { featureId: string; projectPath: string; channelId: string }
  >();
  private gateMessagesByFeature = new Map<string, string>();
  private gateResolver?: (
    featureId: string,
    projectPath: string,
    action: 'advance' | 'reject'
  ) => Promise<void>;

  setGateResolver(
    fn: (featureId: string, projectPath: string, action: 'advance' | 'reject') => Promise<void>
  ): void {
    this.gateResolver = fn;
  }

  registerGateMessage(
    messageId: string,
    featureId: string,
    projectPath: string,
    channelId: string
  ): void {
    this.pendingGateMessages.set(messageId, { featureId, projectPath, channelId });
    this.gateMessagesByFeature.set(featureId, messageId);
  }

  /**
   * Simulate the handleReaction logic for gate messages.
   * Mirrors the implementation in DiscordBotService.handleReaction().
   */
  async simulateReaction(messageId: string, emoji: string): Promise<boolean> {
    const gateData = this.pendingGateMessages.get(messageId);
    if (gateData && this.gateResolver) {
      if (emoji === '✅') {
        this.pendingGateMessages.delete(messageId);
        this.gateMessagesByFeature.delete(gateData.featureId);
        await this.gateResolver(gateData.featureId, gateData.projectPath, 'advance');
        return true;
      } else if (emoji === '❌') {
        this.pendingGateMessages.delete(messageId);
        this.gateMessagesByFeature.delete(gateData.featureId);
        await this.gateResolver(gateData.featureId, gateData.projectPath, 'reject');
        return true;
      }
    }
    return false;
  }

  hasPendingGate(messageId: string): boolean {
    return this.pendingGateMessages.has(messageId);
  }
}

describe('DiscordChannelHandler', () => {
  let discordBotService: DiscordBotService;
  let handler: DiscordChannelHandler;

  beforeEach(() => {
    discordBotService = createMockDiscordBotService();
    handler = new DiscordChannelHandler(discordBotService);
  });

  describe('requestApproval', () => {
    it('calls postGateHoldMessage with correct params', async () => {
      await handler.requestApproval({
        featureId: 'feat-001',
        projectPath: '/projects/test',
        featureTitle: 'Test Feature',
        channelId: 'channel-abc',
        phase: 'SPEC_REVIEW',
      });

      expect(discordBotService.postGateHoldMessage).toHaveBeenCalledWith(
        'channel-abc',
        'feat-001',
        '/projects/test',
        'Test Feature',
        'SPEC_REVIEW'
      );
    });

    it('falls back gracefully when postGateHoldMessage returns null', async () => {
      vi.mocked(discordBotService.postGateHoldMessage).mockResolvedValue(null);

      await expect(
        handler.requestApproval({
          featureId: 'feat-002',
          projectPath: '/projects/test',
          channelId: 'channel-abc',
        })
      ).resolves.not.toThrow();
    });
  });

  describe('cancelPending', () => {
    it('calls editGateMessage to show resolved status', async () => {
      await handler.cancelPending('feat-001');

      expect(discordBotService.editGateMessage).toHaveBeenCalledWith(
        'feat-001',
        expect.stringContaining('Resolved')
      );
    });
  });

  describe('sendHITLForm', () => {
    it('creates a thread and captures first reply', async () => {
      vi.mocked(discordBotService.getGateMessageId).mockReturnValue('msg-feat-001');
      vi.mocked(discordBotService.getGateMessageChannelId).mockReturnValue('channel-abc');

      const result = await handler.sendHITLForm({
        featureId: 'feat-001',
        projectPath: '/projects/test',
        questions: ['What is the target audience?', 'What is the deadline?'],
        channelId: 'channel-abc',
      });

      expect(discordBotService.createThread).toHaveBeenCalledWith(
        'channel-abc',
        'msg-feat-001',
        'Form: feat-001'
      );
      expect(discordBotService.sendToChannel).toHaveBeenCalledWith(
        'thread-123',
        expect.stringContaining('What is the target audience?')
      );
      expect(result).toEqual({ response: 'test reply' });
    });

    it('returns empty object when waitForReply times out', async () => {
      vi.mocked(discordBotService.waitForReply).mockResolvedValue(null);

      const result = await handler.sendHITLForm({
        featureId: 'feat-001',
        projectPath: '/projects/test',
        questions: ['Question 1'],
        channelId: 'channel-abc',
      });

      expect(result).toEqual({});
    });
  });
});

describe('Gate reaction handling — ✅ triggers resolveGate advance', () => {
  it('calls resolveGate with action: advance when ✅ reaction is added', async () => {
    const harness = new GateReactionTestHarness();
    const resolveGate = vi.fn(async () => {});
    harness.setGateResolver(resolveGate);

    harness.registerGateMessage('msg-001', 'feat-001', '/projects/test', 'channel-abc');
    expect(harness.hasPendingGate('msg-001')).toBe(true);

    const handled = await harness.simulateReaction('msg-001', '✅');

    expect(handled).toBe(true);
    expect(resolveGate).toHaveBeenCalledWith('feat-001', '/projects/test', 'advance');
    expect(harness.hasPendingGate('msg-001')).toBe(false);
  });

  it('calls resolveGate with action: reject when ❌ reaction is added', async () => {
    const harness = new GateReactionTestHarness();
    const resolveGate = vi.fn(async () => {});
    harness.setGateResolver(resolveGate);

    harness.registerGateMessage('msg-002', 'feat-002', '/projects/test', 'channel-abc');

    await harness.simulateReaction('msg-002', '❌');

    expect(resolveGate).toHaveBeenCalledWith('feat-002', '/projects/test', 'reject');
  });

  it('does NOT call resolveGate for non-gate messages', async () => {
    const harness = new GateReactionTestHarness();
    const resolveGate = vi.fn(async () => {});
    harness.setGateResolver(resolveGate);

    // msg-999 is not registered as a gate message
    const handled = await harness.simulateReaction('msg-999', '✅');

    expect(handled).toBe(false);
    expect(resolveGate).not.toHaveBeenCalled();
  });

  it('does NOT call resolveGate when resolver is not set', async () => {
    const harness = new GateReactionTestHarness();
    // No resolver set

    harness.registerGateMessage('msg-003', 'feat-003', '/projects/test', 'channel-abc');

    const handled = await harness.simulateReaction('msg-003', '✅');

    expect(handled).toBe(false);
  });

  it('removes the gate from pending map after reaction', async () => {
    const harness = new GateReactionTestHarness();
    harness.setGateResolver(vi.fn(async () => {}));

    harness.registerGateMessage('msg-004', 'feat-004', '/projects/test', 'channel-abc');
    await harness.simulateReaction('msg-004', '✅');

    // Second reaction on same message should NOT trigger again
    const resolveGate2 = vi.fn(async () => {});
    harness.setGateResolver(resolveGate2);
    await harness.simulateReaction('msg-004', '✅');

    expect(resolveGate2).not.toHaveBeenCalled();
  });
});

describe('UIChannelHandler', () => {
  it('requestApproval is a no-op that resolves', async () => {
    const handler = new UIChannelHandler();
    await expect(
      handler.requestApproval({
        featureId: 'feat-001',
        projectPath: '/projects/test',
        channelId: '',
      })
    ).resolves.not.toThrow();
  });

  it('sendHITLForm returns empty object', async () => {
    const handler = new UIChannelHandler();
    const result = await handler.sendHITLForm({
      featureId: 'feat-001',
      projectPath: '/projects/test',
      questions: ['Q1'],
      channelId: '',
    });
    expect(result).toEqual({});
  });

  it('cancelPending is a no-op that resolves', async () => {
    const handler = new UIChannelHandler();
    await expect(handler.cancelPending('feat-001')).resolves.not.toThrow();
  });
});
