/**
 * IntegrationService GitHub-issue intake gate (#3991)
 *
 * Verifies the `githubIssueIntake` policy: only opened issues that pass the
 * enabled flag and the required-label filter are converted into board signals.
 * This is the double-handling boundary that keeps protoMaker from grabbing every
 * opened issue when another receiver also processes the org's issues.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IntegrationService } from '../../../src/services/integration-service.js';
import type { EventEmitter } from '../../../src/lib/events.js';
import type { FeatureLoader } from '../../../src/services/feature-loader.js';
import type { SettingsService } from '../../../src/services/settings-service.js';
import {
  createMockEventEmitter,
  createMockFeatureLoader,
  createMockSettingsService,
} from '../../helpers/mock-factories.js';

const issuePayload = (overrides: Record<string, unknown> = {}) => ({
  action: 'opened',
  issueNumber: 42,
  title: 'Something needs doing',
  body: 'Details here',
  author: 'octocat',
  createdAt: new Date().toISOString(),
  repository: 'protoLabsAI/protoContent',
  labels: ['board-intake'],
  ...overrides,
});

const flushAsync = () => new Promise((resolve) => setTimeout(resolve, 20));

describe('IntegrationService — GitHub-issue intake gate (#3991)', () => {
  let service: IntegrationService;
  let emitter: ReturnType<typeof createMockEventEmitter>;
  let settingsService: SettingsService;
  let featureLoader: FeatureLoader;

  const init = (githubIssueIntake?: { enabled: boolean; requiredLabel: string }) => {
    settingsService = createMockSettingsService({
      getGlobalSettings: vi.fn().mockResolvedValue({ githubIssueIntake }),
    }) as unknown as SettingsService;
    featureLoader = createMockFeatureLoader([]) as unknown as FeatureLoader;
    service = new IntegrationService();
    service.initialize(emitter as unknown as EventEmitter, settingsService, featureLoader);
  };

  const signalEmitted = () =>
    (emitter.emit as ReturnType<typeof vi.fn>).mock.calls.some(
      (call) => call[0] === 'signal:received'
    );

  beforeEach(() => {
    emitter = createMockEventEmitter();
  });

  it('ingests an opened issue carrying the required label', async () => {
    init({ enabled: true, requiredLabel: 'board-intake' });

    emitter._fire('webhook:github:issue', issuePayload({ labels: ['bug', 'board-intake'] }));
    await flushAsync();

    expect(signalEmitted()).toBe(true);
  });

  it('skips an opened issue that lacks the required label', async () => {
    init({ enabled: true, requiredLabel: 'board-intake' });

    emitter._fire('webhook:github:issue', issuePayload({ labels: ['bug', 'enhancement'] }));
    await flushAsync();

    expect(signalEmitted()).toBe(false);
  });

  it('matches the required label case-insensitively', async () => {
    init({ enabled: true, requiredLabel: 'board-intake' });

    emitter._fire('webhook:github:issue', issuePayload({ labels: ['Board-Intake'] }));
    await flushAsync();

    expect(signalEmitted()).toBe(true);
  });

  it('skips all issues when intake is disabled', async () => {
    init({ enabled: false, requiredLabel: 'board-intake' });

    emitter._fire('webhook:github:issue', issuePayload({ labels: ['board-intake'] }));
    await flushAsync();

    expect(signalEmitted()).toBe(false);
  });

  it('ingests any opened issue when requiredLabel is empty', async () => {
    init({ enabled: true, requiredLabel: '' });

    emitter._fire('webhook:github:issue', issuePayload({ labels: [] }));
    await flushAsync();

    expect(signalEmitted()).toBe(true);
  });

  it('defaults to requiring the board-intake label when no policy is configured', async () => {
    init(undefined);

    emitter._fire('webhook:github:issue', issuePayload({ labels: ['unrelated'] }));
    await flushAsync();
    expect(signalEmitted()).toBe(false);

    emitter._fire('webhook:github:issue', issuePayload({ labels: ['board-intake'] }));
    await flushAsync();
    expect(signalEmitted()).toBe(true);
  });

  it('ignores non-opened issue actions regardless of label', async () => {
    init({ enabled: true, requiredLabel: 'board-intake' });

    emitter._fire(
      'webhook:github:issue',
      issuePayload({ action: 'closed', labels: ['board-intake'] })
    );
    await flushAsync();

    expect(signalEmitted()).toBe(false);
  });

  it('forwards projectPath, labels and repository into the signal channelContext', async () => {
    init({ enabled: true, requiredLabel: 'board-intake' });

    emitter._fire(
      'webhook:github:issue',
      issuePayload({ projectPath: '/repos/protocontent', labels: ['board-intake'] })
    );
    await flushAsync();

    const signalCall = (emitter.emit as ReturnType<typeof vi.fn>).mock.calls.find(
      (call) => call[0] === 'signal:received'
    );
    expect(signalCall).toBeDefined();
    expect(signalCall![1]).toMatchObject({
      source: 'github',
      channelContext: {
        issueNumber: 42,
        repository: 'protoLabsAI/protoContent',
        projectPath: '/repos/protocontent',
        labels: ['board-intake'],
      },
    });
  });
});
