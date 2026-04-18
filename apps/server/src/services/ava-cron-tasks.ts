/**
 * Ava Cron Tasks — deterministic recurring heartbeats registered in the SchedulerService.
 *
 * Built-in tasks:
 * 1. ava-staging-ping (every 30 min) — capacity heartbeat (board counts, uptime, auto-mode)
 *
 * All tasks are deterministic — no LLM calls. Data is queried from services
 * and formatted as Discord embeds. If Discord is unavailable, output goes to
 * server logs instead.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { createLogger } from '@protolabsai/utils';
import type { Feature, EscalationSignal } from '@protolabsai/types';
import { EscalationSeverity, EscalationSource } from '@protolabsai/types';
import { resolveModelString } from '@protolabsai/model-resolver';

import type { SchedulerService } from './scheduler-service.js';
import { TrajectoryPatternMiner } from './trajectory-pattern-miner.js';
import type { FeatureLoader } from './feature-loader.js';
import type { AutoModeService } from './auto-mode-service.js';
import type { DiscordBotService } from './discord-bot-service.js';
import type { EscalationRouter } from './escalation-router.js';
import type { SettingsService } from './settings-service.js';
import { getWorkflowSettings } from '../lib/settings-helpers.js';
import { simpleQuery } from '../providers/simple-query-service.js';
import {
  generateHeartbeatPrompt,
  parseHeartbeatResponse,
} from '../lib/prompts/heartbeat-prompt.js';
import { getVersion } from '../lib/version.js';

const logger = createLogger('AvaCronTasks');

// Embed colors
const COLOR_GREEN = 0x2ecc71;

export interface AvaCronTaskDeps {
  schedulerService: SchedulerService;
  projectPath: string;
  featureLoader: FeatureLoader;
  autoModeService: AutoModeService;
  discordBotService: DiscordBotService;
  /** Optional — required for adaptive heartbeat task */
  settingsService?: SettingsService | null;
  /** Optional — required for adaptive heartbeat alert routing */
  escalationRouter?: EscalationRouter | null;
}

/**
 * Send a Discord embed, falling back to server logs if Discord is unavailable.
 */
async function sendEmbed(
  discordBotService: DiscordBotService,
  channelId: string | undefined,
  embed: {
    title: string;
    description?: string;
    color?: number;
    fields?: Array<{ name: string; value: string; inline?: boolean }>;
    footer?: { text: string };
    timestamp?: string;
  }
): Promise<void> {
  if (channelId) {
    try {
      const sent = await discordBotService.sendEmbed(channelId, embed);
      if (sent) return;
    } catch {
      // Fall through to log output
    }
  }

  // Discord unavailable or no channel configured — log the embed content
  const fields = embed.fields?.map((f) => `  ${f.name}: ${f.value}`).join('\n') ?? '';
  logger.info(`[CronEmbed] ${embed.title}\n${embed.description ?? ''}\n${fields}`);
}

/**
 * Format seconds into a human-readable uptime string.
 */
function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// Task handlers
// ---------------------------------------------------------------------------

/**
 * Staging Ping — capacity heartbeat every 30 minutes.
 * Reports version, uptime, board counts, running agents, and auto-mode state.
 */
async function handleStagingPing(deps: AvaCronTaskDeps): Promise<void> {
  const { featureLoader, autoModeService, discordBotService, projectPath } = deps;
  const infraChannelId = await discordBotService.getChannelId('infra');

  let features: Feature[];
  try {
    features = await featureLoader.getAll(projectPath);
  } catch (err) {
    logger.error('[ava-staging-ping] Failed to load features', err);
    features = [];
  }

  const counts: Record<string, number> = {};
  for (const f of features) {
    const s = f.status || 'backlog';
    counts[s] = (counts[s] || 0) + 1;
  }

  const autoStatus = autoModeService.getStatus();
  const version = getVersion();
  const uptime = formatUptime(process.uptime());

  const boardLine = [
    counts['backlog'] ? `${counts['backlog']} backlog` : null,
    counts['in_progress'] ? `${counts['in_progress']} in-progress` : null,
    counts['review'] ? `${counts['review']} review` : null,
    counts['blocked'] ? `${counts['blocked']} blocked` : null,
    counts['done'] ? `${counts['done']} done` : null,
  ]
    .filter(Boolean)
    .join(' / ');

  await sendEmbed(discordBotService, infraChannelId, {
    title: 'Staging Heartbeat',
    color: COLOR_GREEN,
    fields: [
      { name: 'Version', value: `v${version}`, inline: true },
      { name: 'Uptime', value: uptime, inline: true },
      { name: 'Board', value: boardLine || 'No features', inline: false },
      {
        name: 'Agents Running',
        value: String(autoStatus.runningCount),
        inline: true,
      },
      {
        name: 'Auto-mode',
        value: autoStatus.isRunning ? 'ON' : 'OFF',
        inline: true,
      },
    ],
    footer: { text: 'ava-staging-ping' },
    timestamp: new Date().toISOString(),
  });
}

/**
 * Adaptive Heartbeat — reads HEARTBEAT.md, runs an isolated Haiku call (~3K tokens),
 * and routes any alerts through the EscalationRouter. HEARTBEAT_OK suppresses delivery.
 *
 * Skips if HEARTBEAT.md is missing or empty.
 */
export async function handleAdaptiveHeartbeat(deps: AvaCronTaskDeps): Promise<void> {
  const { featureLoader, projectPath, escalationRouter } = deps;

  // Read HEARTBEAT.md from .automaker/
  const heartbeatMdPath = join(projectPath, '.automaker', 'HEARTBEAT.md');
  let heartbeatMd: string;
  try {
    heartbeatMd = await readFile(heartbeatMdPath, 'utf-8');
  } catch {
    logger.debug('[ava-adaptive-heartbeat] HEARTBEAT.md not found, skipping');
    return;
  }

  if (!heartbeatMd.trim()) {
    logger.debug('[ava-adaptive-heartbeat] HEARTBEAT.md is empty, skipping');
    return;
  }

  // Gather board summary
  let features: Feature[];
  try {
    features = await featureLoader.getAll(projectPath);
  } catch (err) {
    logger.error('[ava-adaptive-heartbeat] Failed to load features', err);
    features = [];
  }

  const byStatus: Record<string, number> = {};
  const staleFeatures: Array<{
    id: string;
    title: string;
    status: string;
    daysSinceUpdate: number;
  }> = [];
  const reviewPRs: Array<{ id: string; title: string; prNumber?: number }> = [];
  const now = Date.now();
  const STALE_MS = 7 * 24 * 60 * 60 * 1000;

  for (const f of features) {
    const s = f.status || 'backlog';
    byStatus[s] = (byStatus[s] || 0) + 1;

    if (s === 'in_progress' || s === 'review') {
      const lastUpdate = f.updatedAt
        ? typeof f.updatedAt === 'number'
          ? f.updatedAt
          : new Date(f.updatedAt).getTime()
        : 0;
      if (lastUpdate > 0 && now - lastUpdate > STALE_MS) {
        staleFeatures.push({
          id: f.id,
          title: f.title || f.id,
          status: s,
          daysSinceUpdate: Math.floor((now - lastUpdate) / (24 * 60 * 60 * 1000)),
        });
      }
    }

    if (s === 'review' && f.prNumber) {
      reviewPRs.push({ id: f.id, title: f.title || f.id, prNumber: f.prNumber });
    }
  }

  const prompt = generateHeartbeatPrompt({
    total: features.length,
    byStatus,
    blockedCount: byStatus['blocked'] ?? 0,
    inProgressCount: byStatus['in_progress'] ?? 0,
    staleFeatures,
    failedPRs: reviewPRs,
    heartbeatMd,
  });

  // Resolve model — deps.settingsService provides workflow settings
  const workflowSettings = await getWorkflowSettings(projectPath, deps.settingsService);
  const modelAlias = workflowSettings.heartbeat?.model ?? 'haiku';
  const modelId = resolveModelString(modelAlias);

  let responseText: string;
  try {
    const result = await simpleQuery({
      prompt,
      model: modelId,
      cwd: projectPath,
      maxTurns: 1,
      allowedTools: [],
      traceContext: { agentRole: 'adaptive-heartbeat' },
    });
    responseText = result.text;
  } catch (err) {
    logger.error('[ava-adaptive-heartbeat] LLM call failed', err);
    return;
  }

  const parsed = parseHeartbeatResponse(responseText);

  if (parsed.status === 'ok') {
    logger.debug('[ava-adaptive-heartbeat] HEARTBEAT_OK — no issues detected');
    return;
  }

  // Route alerts through EscalationRouter
  if (!escalationRouter) {
    logger.warn(
      '[ava-adaptive-heartbeat] Alerts detected but no escalationRouter available — logging only'
    );
    logger.warn('[ava-adaptive-heartbeat] Alerts:', JSON.stringify(parsed.alerts));
    return;
  }

  const alerts = parsed.alerts ?? [];
  for (const alert of alerts) {
    const severityMap: Record<string, EscalationSeverity> = {
      critical: EscalationSeverity.critical,
      high: EscalationSeverity.high,
      medium: EscalationSeverity.medium,
      low: EscalationSeverity.low,
    };

    const signal: EscalationSignal = {
      source: EscalationSource.board_anomaly,
      severity: severityMap[alert.severity] ?? EscalationSeverity.medium,
      type: 'adaptive-heartbeat:alert',
      context: {
        title: alert.title,
        description: alert.description,
        projectPath,
      },
      deduplicationKey: `adaptive-heartbeat:${projectPath}:${alert.title}`,
      timestamp: new Date().toISOString(),
    };

    try {
      await escalationRouter.routeSignal(signal);
    } catch (err) {
      logger.error('[ava-adaptive-heartbeat] Failed to route signal', err);
    }
  }

  logger.info(`[ava-adaptive-heartbeat] Routed ${alerts.length} alert(s) for ${projectPath}`);
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/**
 * Register Ava's built-in recurring tasks in the SchedulerService.
 * All tasks are deterministic — no LLM calls.
 */
export async function registerAvaCronTasks(deps: AvaCronTaskDeps): Promise<void> {
  const { schedulerService } = deps;

  // 1. Staging ping every 30 minutes
  await schedulerService.registerTask(
    'ava-staging-ping',
    'Ava Staging Ping',
    '*/30 * * * *',
    async () => {
      logger.info('[AvaCronTasks] Running ava-staging-ping');
      try {
        await handleStagingPing(deps);
      } catch (err) {
        logger.error('[AvaCronTasks] ava-staging-ping failed', err);
      }
    },
    true
  );

  // ava-daily-board-health removed — dashboard shows this live
  // ava-pr-triage removed — Lead Engineer handles PR lifecycle
  // stale-pr-check removed — protoWorkstacean owns fleet-wide PR health via
  //   the pr.no_stale goal (workspace/goals.yaml) + alert.pr_stale action
  //   (workspace/actions.yaml) driven off the pr_pipeline world-state domain.

  logger.info('[AvaCronTasks] Registered 1 deterministic cron task (staging-ping)');

  // Load workflow settings once for the remaining opt-in tasks
  const workflowSettings = await getWorkflowSettings(deps.projectPath, deps.settingsService);

  // 4. Pattern mining — opt-in per project, enabled by default
  const patternMiningEnabled = workflowSettings.patternMining?.enabled ?? true;
  if (patternMiningEnabled) {
    const DAILY_MS = 24 * 60 * 60 * 1000;
    schedulerService.registerInterval(
      'ava-pattern-mining',
      'Ava Trajectory Pattern Mining',
      DAILY_MS,
      async () => {
        logger.info('[AvaCronTasks] Running ava-pattern-mining');
        try {
          const miner = new TrajectoryPatternMiner();
          await miner.mine(deps.projectPath);
        } catch (err) {
          logger.error('[AvaCronTasks] ava-pattern-mining failed', err);
        }
      },
      { enabled: true, category: 'maintenance' }
    );
    logger.info('[AvaCronTasks] Registered ava-pattern-mining (daily)');
  }

  // 5. Adaptive heartbeat — opt-in per project via workflowSettings.heartbeat.enabled
  const heartbeatConfig = workflowSettings.heartbeat;
  if (heartbeatConfig?.enabled) {
    const intervalMs = (heartbeatConfig.intervalMinutes ?? 30) * 60 * 1000;
    schedulerService.registerInterval(
      'ava-adaptive-heartbeat',
      'Ava Adaptive Heartbeat',
      intervalMs,
      async () => {
        logger.info('[AvaCronTasks] Running ava-adaptive-heartbeat');
        try {
          await handleAdaptiveHeartbeat(deps);
        } catch (err) {
          logger.error('[AvaCronTasks] ava-adaptive-heartbeat failed', err);
        }
      },
      { enabled: true, category: 'health' }
    );
    logger.info(
      `[AvaCronTasks] Registered ava-adaptive-heartbeat (every ${heartbeatConfig.intervalMinutes ?? 30}m, model: ${heartbeatConfig.model ?? 'haiku'})`
    );
  }
}
