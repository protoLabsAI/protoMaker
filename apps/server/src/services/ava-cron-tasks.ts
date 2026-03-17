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
import { createLogger } from '@protolabsai/utils';
import type { Feature } from '@protolabsai/types';
import type { SchedulerService } from './scheduler-service.js';
import type { FeatureLoader } from './feature-loader.js';
import type { AutoModeService } from './auto-mode-service.js';
import type { DiscordBotService } from './discord-bot-service.js';
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
}
