/**
 * Ava Cron Tasks — deterministic recurring heartbeats registered in the SchedulerService.
 *
 * Three built-in tasks:
 * 1. ava-staging-ping      (every 30 min)   — capacity heartbeat (board counts, uptime, auto-mode)
 * 2. ava-daily-board-health (09:00 daily)    — board summary, blocked/stale features
 * 3. ava-pr-triage          (every 4 hours)  — open PRs, stale PRs
 *
 * All tasks are deterministic — no LLM calls. Data is queried from services
 * and formatted as Discord embeds. If Discord is unavailable, output goes to
 * server logs instead.
 */

import { execSync } from 'child_process';
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
const COLOR_YELLOW = 0xf1c40f;
const COLOR_RED = 0xe74c3c;

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
 * Daily Board Health — board summary with blocked and stale feature callouts.
 * Stale = in_progress or review with no update in the last 24 hours.
 */
async function handleDailyBoardHealth(deps: AvaCronTaskDeps): Promise<void> {
  const { featureLoader, discordBotService, projectPath } = deps;
  const infraChannelId = await discordBotService.getChannelId('infra');

  let features: Feature[];
  try {
    features = await featureLoader.getAll(projectPath);
  } catch (err) {
    logger.error('[ava-daily-board-health] Failed to load features', err);
    features = [];
  }

  const counts: Record<string, number> = {};
  const blocked: Array<{ title: string; reason: string }> = [];
  const stale: Array<{ title: string; status: string; hours: number }> = [];

  const now = Date.now();
  const STALE_MS = 24 * 60 * 60 * 1000; // 24 hours

  for (const f of features) {
    const s = f.status || 'backlog';
    counts[s] = (counts[s] || 0) + 1;

    if (s === 'blocked') {
      blocked.push({
        title: f.title || f.id,
        reason: f.statusChangeReason || 'No reason provided',
      });
    }

    if (s === 'in_progress' || s === 'review') {
      const lastUpdate = f.updatedAt
        ? typeof f.updatedAt === 'number'
          ? f.updatedAt
          : new Date(f.updatedAt).getTime()
        : f.startedAt
          ? new Date(f.startedAt).getTime()
          : 0;

      if (lastUpdate > 0 && now - lastUpdate > STALE_MS) {
        const hours = Math.floor((now - lastUpdate) / (60 * 60 * 1000));
        stale.push({ title: f.title || f.id, status: s, hours });
      }
    }
  }

  const summaryLine = Object.entries(counts)
    .map(([status, count]) => `${status}: ${count}`)
    .join(', ');

  const blockedText =
    blocked.length > 0
      ? blocked
          .slice(0, 10)
          .map((b) => `- **${b.title}**: ${b.reason}`)
          .join('\n')
      : 'None';

  const staleText =
    stale.length > 0
      ? stale
          .slice(0, 10)
          .map((s) => `- **${s.title}** (${s.status}, ${s.hours}h ago)`)
          .join('\n')
      : 'None';

  const color =
    blocked.length > 0 || stale.length > 5
      ? COLOR_RED
      : stale.length > 0
        ? COLOR_YELLOW
        : COLOR_GREEN;

  await sendEmbed(discordBotService, infraChannelId, {
    title: 'Daily Board Health',
    description: `**Total features:** ${features.length}\n${summaryLine}`,
    color,
    fields: [
      {
        name: `Blocked (${blocked.length})`,
        value: blockedText.slice(0, 1024),
        inline: false,
      },
      {
        name: `Stale (${stale.length})`,
        value: staleText.slice(0, 1024),
        inline: false,
      },
    ],
    footer: { text: 'ava-daily-board-health' },
    timestamp: new Date().toISOString(),
  });
}

/**
 * PR Triage — list open PRs, flag stale ones (no update in 7+ days).
 * Uses `gh pr list` for real GitHub data.
 */
async function handlePrTriage(deps: AvaCronTaskDeps): Promise<void> {
  const { discordBotService, projectPath } = deps;
  const infraChannelId = await discordBotService.getChannelId('infra');

  interface GhPr {
    number: number;
    title: string;
    state: string;
    updatedAt: string;
    headRefName: string;
  }

  let prs: GhPr[] = [];
  try {
    const raw = execSync('gh pr list --json number,title,state,updatedAt,headRefName --limit 20', {
      cwd: projectPath,
      timeout: 15_000,
      encoding: 'utf-8',
    });
    prs = JSON.parse(raw) as GhPr[];
  } catch (err) {
    logger.error('[ava-pr-triage] Failed to list PRs via gh CLI', err);
    await sendEmbed(discordBotService, infraChannelId, {
      title: 'PR Triage',
      description: 'Failed to query GitHub PRs. Is the `gh` CLI authenticated?',
      color: COLOR_RED,
      footer: { text: 'ava-pr-triage' },
      timestamp: new Date().toISOString(),
    });
    return;
  }

  const now = Date.now();
  const STALE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

  const stalePrs = prs.filter((pr) => {
    const updated = new Date(pr.updatedAt).getTime();
    return now - updated > STALE_MS;
  });

  const prListText =
    prs.length > 0
      ? prs
          .slice(0, 10)
          .map((pr) => `- #${pr.number} ${pr.title} (\`${pr.headRefName}\`)`)
          .join('\n')
      : 'No open PRs';

  const staleText =
    stalePrs.length > 0
      ? stalePrs
          .map((pr) => {
            const days = Math.floor(
              (now - new Date(pr.updatedAt).getTime()) / (24 * 60 * 60 * 1000)
            );
            return `- #${pr.number} ${pr.title} (${days}d stale)`;
          })
          .join('\n')
      : 'None';

  const color = stalePrs.length > 0 ? COLOR_YELLOW : COLOR_GREEN;

  await sendEmbed(discordBotService, infraChannelId, {
    title: 'PR Triage',
    description: `**Open PRs:** ${prs.length}`,
    color,
    fields: [
      {
        name: 'Open PRs',
        value: prListText.slice(0, 1024),
        inline: false,
      },
      {
        name: `Stale PRs (${stalePrs.length})`,
        value: staleText.slice(0, 1024),
        inline: false,
      },
    ],
    footer: { text: 'ava-pr-triage' },
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

  // 2. Daily board health check at 09:00
  await schedulerService.registerTask(
    'ava-daily-board-health',
    'Ava Daily Board Health',
    '0 9 * * *',
    async () => {
      logger.info('[AvaCronTasks] Running ava-daily-board-health');
      try {
        await handleDailyBoardHealth(deps);
      } catch (err) {
        logger.error('[AvaCronTasks] ava-daily-board-health failed', err);
      }
    },
    true
  );

  // 3. PR triage every 4 hours
  await schedulerService.registerTask(
    'ava-pr-triage',
    'Ava PR Triage',
    '0 */4 * * *',
    async () => {
      logger.info('[AvaCronTasks] Running ava-pr-triage');
      try {
        await handlePrTriage(deps);
      } catch (err) {
        logger.error('[AvaCronTasks] ava-pr-triage failed', err);
      }
    },
    true
  );

  logger.info('[AvaCronTasks] Registered 3 deterministic cron tasks (no LLM)');

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
