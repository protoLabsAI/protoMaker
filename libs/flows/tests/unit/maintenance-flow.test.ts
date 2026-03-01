/**
 * Maintenance Flow Tests
 *
 * Unit tests for createMaintenanceFlow() — verifies the 3-node LangGraph flow
 * runs successfully end-to-end with mock dependencies.
 */

import { describe, it, expect, vi } from 'vitest';
import { createMaintenanceFlow } from '../../src/maintenance/maintenance-flow.js';
import type { MaintenanceFlowDeps } from '../../src/maintenance/maintenance-flow.js';

describe('createMaintenanceFlow()', () => {
  const mockFeatures = [
    { id: 'feat-1', title: 'Feature A', status: 'backlog' },
    { id: 'feat-2', title: 'Feature B', status: 'in_progress' },
    { id: 'feat-3', title: 'Feature C', status: 'blocked' },
    { id: 'feat-4', title: 'Feature D', status: 'done' },
  ];

  function makeDeps(overrides?: Partial<MaintenanceFlowDeps>): MaintenanceFlowDeps {
    return {
      featureLoader: {
        getAll: vi.fn().mockResolvedValue(mockFeatures),
      },
      model: {
        invoke: vi.fn().mockResolvedValue({
          content: '- Board looks healthy\n- 1 blocked feature needs attention',
        }),
      } as unknown as MaintenanceFlowDeps['model'],
      discordBot: {
        sendMessage: vi.fn().mockResolvedValue({ id: 'msg-123' }),
      },
      projectPath: '/test/project',
      discordChannelId: '1234567890',
      ...overrides,
    };
  }

  it('compiles without throwing', () => {
    expect(() => createMaintenanceFlow(makeDeps())).not.toThrow();
  });

  it('invokes featureLoader.getAll with the configured projectPath', async () => {
    const deps = makeDeps();
    const flow = createMaintenanceFlow(deps);
    await flow.invoke({});
    expect(deps.featureLoader.getAll).toHaveBeenCalledWith('/test/project');
  });

  it('invokes model.invoke with a prompt containing the board summary', async () => {
    const deps = makeDeps();
    const flow = createMaintenanceFlow(deps);
    await flow.invoke({});

    const callArg = vi.mocked(deps.model.invoke).mock.calls[0][0] as unknown[];
    const msg = callArg[0] as { role: string; content: string };
    expect(msg.content).toContain('blocked');
    expect(msg.content).toContain('Board state');
  });

  it('sends the analysis to Discord with the configured channelId', async () => {
    const deps = makeDeps();
    const flow = createMaintenanceFlow(deps);
    await flow.invoke({});

    expect(deps.discordBot.sendMessage).toHaveBeenCalledWith(
      '1234567890',
      expect.stringContaining('Board Health Report')
    );
  });

  it('includes "blocked" features by name in the board summary', async () => {
    const deps = makeDeps();
    const flow = createMaintenanceFlow(deps);
    await flow.invoke({});

    const invokeCall = vi.mocked(deps.model.invoke).mock.calls[0][0] as unknown[];
    const content = (invokeCall[0] as { content: string }).content;
    expect(content).toContain('Feature C');
  });

  it('truncates Discord message to 2000 chars when analysis is very long', async () => {
    const longAnalysis = 'x'.repeat(2100);
    const deps = makeDeps({
      model: {
        invoke: vi.fn().mockResolvedValue({ content: longAnalysis }),
      } as unknown as MaintenanceFlowDeps['model'],
    });

    const flow = createMaintenanceFlow(deps);
    await flow.invoke({});

    const [, sentMessage] = vi.mocked(deps.discordBot.sendMessage).mock.calls[0];
    expect((sentMessage as string).length).toBeLessThanOrEqual(2000);
    expect(sentMessage as string).toMatch(/\.\.\.$/);
  });
});
