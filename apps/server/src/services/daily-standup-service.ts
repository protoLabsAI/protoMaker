/**
 * DailyStandupService — board-wide daily standup automation.
 *
 * Runs on a daily cron at 9am. Checks if ceremonies.dailyStandup.enabled is true. If so:
 *   1. Gathers all feature status changes across all projects since lastRunAt
 *   2. Runs standup-flow with board-wide context (completed, started, blocked, PRs, agents)
 *   3. Saves output as a global standup artifact in data/standups/{date}.json
 *   4. Posts summary to Discord #dev channel
 *   5. Updates ceremonies.dailyStandup.lastRunAt
 */

import path from 'path';
import fs from 'fs/promises';

import { createLogger } from '@protolabsai/utils';
import { ChatAnthropic } from '@langchain/anthropic';
import { createStandupFlow } from '@protolabsai/flows';
import type { StandupProjectService, StandupProject } from '@protolabsai/flows';
import type { GlobalSettings } from '@protolabsai/types';

import type { SettingsService } from './settings-service.js';
import type { FeatureLoader } from './feature-loader.js';
import type { DiscordBotService } from './discord-bot-service.js';
import type { SchedulerService } from './scheduler-service.js';

const logger = createLogger('DailyStandupService');

/** Cron task ID registered in SchedulerService */
const STANDUP_TASK_ID = 'daily-standup:check';

/** Fallback Discord #dev channel ID from environment variable */
const ENV_DEV_CHANNEL_ID = process.env.DISCORD_CHANNEL_DEV || '';

// ---------------------------------------------------------------------------
// Board-wide context types
// ---------------------------------------------------------------------------

interface FeatureSummary {
  title: string;
  projectPath: string;
}

interface BlockedFeatureSummary extends FeatureSummary {
  reason?: string;
}

interface BoardContext {
  since: Date;
  completed: FeatureSummary[];
  started: FeatureSummary[];
  blocked: BlockedFeatureSummary[];
  running: FeatureSummary[];
  prsMerged: number;
}

// ---------------------------------------------------------------------------
// DailyStandupService
// ---------------------------------------------------------------------------

export class DailyStandupService {
  private settingsService: SettingsService | null = null;
  private featureLoader: FeatureLoader | null = null;
  private discordBotService: DiscordBotService | null = null;
  private schedulerService: SchedulerService | null = null;
  private dataDir: string | null = null;

  initialize(
    settingsService: SettingsService,
    featureLoader: FeatureLoader,
    discordBotService: DiscordBotService,
    schedulerService: SchedulerService,
    dataDir: string
  ): void {
    this.settingsService = settingsService;
    this.featureLoader = featureLoader;
    this.discordBotService = discordBotService;
    this.schedulerService = schedulerService;
    this.dataDir = dataDir;
  }

  /**
   * Register the daily 9am cron task in SchedulerService.
   * Must be called after schedulerService is started.
   */
  async registerCronTask(): Promise<void> {
    if (!this.schedulerService) {
      logger.warn('DailyStandupService: schedulerService not set, cannot register cron');
      return;
    }

    await this.schedulerService.registerTask(
      STANDUP_TASK_ID,
      'Daily Standup Check',
      '0 9 * * *',
      () => {
        void this.runIfDue().catch((err) =>
          logger.error('DailyStandupService: unhandled error in runIfDue:', err)
        );
      },
      true
    );

    logger.info('DailyStandupService: registered cron task (daily at 9am)');
  }

  /**
   * Run the daily standup. Called once per day by the scheduler at 9am.
   */
  async runIfDue(): Promise<void> {
    if (!this.settingsService || !this.featureLoader || !this.discordBotService || !this.dataDir) {
      logger.warn('DailyStandupService: not fully initialized, skipping');
      return;
    }

    let globalSettings;
    try {
      globalSettings = await this.settingsService.getGlobalSettings();
    } catch (err) {
      logger.error('DailyStandupService: failed to load global settings:', err);
      return;
    }

    const dailyStandup = globalSettings.ceremonies?.dailyStandup;

    if (!dailyStandup?.enabled) {
      logger.debug('DailyStandupService: disabled, skipping');
      return;
    }

    logger.info('DailyStandupService: running daily standup');
    try {
      await this.runStandup(globalSettings, dailyStandup.lastRunAt);
    } catch (err) {
      logger.error('DailyStandupService: standup run failed:', err);
    }
  }

  // ---------------------------------------------------------------------------
  // Private: standup execution
  // ---------------------------------------------------------------------------

  private async runStandup(
    globalSettings: GlobalSettings,
    lastRunAt: string | undefined
  ): Promise<void> {
    const projects: Array<{ path: string; name?: string }> = globalSettings.projects ?? [];
    const since = lastRunAt ? new Date(lastRunAt) : new Date(Date.now() - 24 * 60 * 60 * 1000);

    // 1. Gather board-wide context from all projects
    const boardContext = await this.gatherBoardContext(projects, since);

    // 2. Resolve Discord #dev channel
    const devChannelId = await this.resolveDevChannelId(globalSettings, projects);
    if (!devChannelId) {
      logger.warn('DailyStandupService: no Discord dev channel configured');
    }

    // 3. Build synthetic StandupProjectService with board data
    const boardProjectService = this.createBoardProjectService(boardContext);

    // 4. Create Discord adapter
    const discordAdapter = this.createDiscordAdapter(devChannelId ?? '');

    // 5. Create LLM model
    const model = new ChatAnthropic({
      model: 'claude-haiku-4-5',
      temperature: 0.7,
    });

    // 6. Run standup-flow with board-wide context
    let generatedContent = '';
    let discordPosted = false;
    const flowProjectPath = projects[0]?.path ?? '.';

    try {
      const flow = createStandupFlow({
        projectService: boardProjectService,
        model,
        discordBot: discordAdapter,
        projectPath: flowProjectPath,
        projectSlug: 'automaker-board',
        milestoneSlug: 'daily-standup',
        discordChannelId: devChannelId ?? '',
      });

      const result = await flow.invoke({
        projectPath: flowProjectPath,
        projectSlug: 'automaker-board',
        milestoneSlug: 'daily-standup',
      });

      generatedContent = (result as { generatedContent?: string }).generatedContent ?? '';
      discordPosted = (result as { discordPosted?: boolean }).discordPosted ?? false;
    } catch (err) {
      logger.error('DailyStandupService: standup-flow invocation failed, using fallback:', err);
      // Build fallback content and post directly
      generatedContent = this.buildFallbackContent(boardContext);
      if (devChannelId && this.discordBotService) {
        discordPosted = await this.discordBotService.sendToChannel(devChannelId, generatedContent);
      }
    }

    // If flow ran but Discord wasn't posted (e.g. channel empty), try direct post
    if (!discordPosted && devChannelId && generatedContent && this.discordBotService) {
      discordPosted = await this.discordBotService.sendToChannel(devChannelId, generatedContent);
    }

    // 7. Save artifact
    await this.saveArtifact(boardContext, generatedContent, discordPosted, devChannelId);

    // 8. Update lastRunAt in global settings
    await this.settingsService!.updateGlobalSettings({
      ceremonies: {
        dailyStandup: {
          enabled: true,
          lastRunAt: new Date().toISOString(),
        },
      },
    });

    logger.info(
      `DailyStandupService: standup complete (discordPosted=${discordPosted}, content length=${generatedContent.length})`
    );
  }

  // ---------------------------------------------------------------------------
  // Private: board context gathering
  // ---------------------------------------------------------------------------

  private async gatherBoardContext(
    projects: Array<{ path: string; name?: string }>,
    since: Date
  ): Promise<BoardContext> {
    const completed: FeatureSummary[] = [];
    const started: FeatureSummary[] = [];
    const blocked: BlockedFeatureSummary[] = [];
    const running: FeatureSummary[] = [];
    let prsMerged = 0;

    for (const project of projects) {
      try {
        const features = await this.featureLoader!.getAll(project.path);
        for (const feature of features) {
          const summary: FeatureSummary = {
            title: feature.title ?? feature.id,
            projectPath: project.path,
          };

          // Completed since lastRunAt
          if (
            feature.status === 'done' &&
            feature.completedAt &&
            new Date(feature.completedAt) > since
          ) {
            completed.push(summary);
          }

          // PRs merged since lastRunAt
          if (feature.prMergedAt && new Date(feature.prMergedAt) > since) {
            prsMerged++;
          }

          // Currently in progress
          if (feature.status === 'in_progress') {
            running.push(summary);

            // Started since lastRunAt (in_progress and startedAt within window)
            if (feature.startedAt && new Date(feature.startedAt) > since) {
              started.push(summary);
            }
          }

          // Currently blocked — check if became blocked since lastRunAt
          if (feature.status === 'blocked') {
            const transitions = feature.statusHistory ?? [];
            // Find most recent transition to 'blocked'
            let lastBlockedAt: string | undefined;
            for (let i = transitions.length - 1; i >= 0; i--) {
              if (transitions[i].to === 'blocked') {
                lastBlockedAt = transitions[i].timestamp;
                break;
              }
            }
            const isNewlyBlocked = lastBlockedAt && new Date(lastBlockedAt) > since;
            if (isNewlyBlocked) {
              blocked.push({
                ...summary,
                reason: feature.statusChangeReason ?? undefined,
              });
            }
          }
        }
      } catch (err) {
        logger.warn(`DailyStandupService: failed to load features for ${project.path}:`, err);
      }
    }

    return { since, completed, started, blocked, running, prsMerged };
  }

  // ---------------------------------------------------------------------------
  // Private: synthetic StandupProjectService
  // ---------------------------------------------------------------------------

  /**
   * Create a StandupProjectService that returns a synthetic "Automaker Board" project
   * with board-wide context injected as milestone phases.
   */
  private createBoardProjectService(ctx: BoardContext): StandupProjectService {
    const phases: Array<{ title: string; complexity?: string }> = [];

    if (ctx.completed.length > 0) {
      const titles = ctx.completed
        .slice(0, 5)
        .map((f) => f.title)
        .join(', ');
      const extra = ctx.completed.length > 5 ? ` (+${ctx.completed.length - 5} more)` : '';
      phases.push({ title: `✅ Completed (${ctx.completed.length}): ${titles}${extra}` });
    }

    if (ctx.started.length > 0) {
      const titles = ctx.started
        .slice(0, 5)
        .map((f) => f.title)
        .join(', ');
      const extra = ctx.started.length > 5 ? ` (+${ctx.started.length - 5} more)` : '';
      phases.push({ title: `🚀 Started (${ctx.started.length}): ${titles}${extra}` });
    }

    if (ctx.running.length > 0) {
      const titles = ctx.running
        .slice(0, 5)
        .map((f) => f.title)
        .join(', ');
      const extra = ctx.running.length > 5 ? ` (+${ctx.running.length - 5} more)` : '';
      phases.push({ title: `🤖 Running Agents (${ctx.running.length}): ${titles}${extra}` });
    }

    if (ctx.blocked.length > 0) {
      const items = ctx.blocked
        .slice(0, 3)
        .map((f) => `${f.title}${f.reason ? `: ${f.reason.slice(0, 50)}` : ''}`)
        .join(', ');
      const extra = ctx.blocked.length > 3 ? ` (+${ctx.blocked.length - 3} more)` : '';
      phases.push({ title: `🚧 Blocked (${ctx.blocked.length}): ${items}${extra}` });
    }

    if (ctx.prsMerged > 0) {
      phases.push({ title: `🔀 PRs Merged: ${ctx.prsMerged}` });
    }

    if (phases.length === 0) {
      phases.push({ title: 'No significant activity since last standup' });
    }

    const boardProject: StandupProject = {
      title: 'Automaker Board',
      milestones: [
        {
          slug: 'daily-standup',
          number: 0,
          title: 'Daily Standup',
          description: `Board-wide status update since ${ctx.since.toISOString().slice(0, 10)}`,
          status: 'active',
          phases,
        },
      ],
    };

    return {
      getProject: async (_projectPath: string, _projectSlug: string): Promise<StandupProject> => {
        return boardProject;
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Private: Discord adapter
  // ---------------------------------------------------------------------------

  private createDiscordAdapter(channelId: string) {
    const botService = this.discordBotService;
    return {
      sendMessage: async (_channelId: string, content: string): Promise<{ id: string }> => {
        if (!botService || !channelId) return { id: '' };
        await botService.sendToChannel(channelId, content);
        return { id: '' };
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Private: fallback content
  // ---------------------------------------------------------------------------

  private buildFallbackContent(ctx: BoardContext): string {
    const lines: string[] = [
      `**🤖 Daily Standup — ${new Date().toISOString().slice(0, 10)}**`,
      `*Board-wide update since ${ctx.since.toISOString().slice(0, 10)}*`,
      '',
    ];

    if (ctx.completed.length > 0) {
      lines.push(`**✅ Completed (${ctx.completed.length}):**`);
      ctx.completed.slice(0, 5).forEach((f) => lines.push(`  • ${f.title}`));
      if (ctx.completed.length > 5) lines.push(`  *(+${ctx.completed.length - 5} more)*`);
      lines.push('');
    }

    if (ctx.started.length > 0) {
      lines.push(`**🚀 Started (${ctx.started.length}):**`);
      ctx.started.slice(0, 5).forEach((f) => lines.push(`  • ${f.title}`));
      if (ctx.started.length > 5) lines.push(`  *(+${ctx.started.length - 5} more)*`);
      lines.push('');
    }

    if (ctx.running.length > 0) {
      lines.push(`**🤖 Running Agents (${ctx.running.length}):**`);
      ctx.running.slice(0, 5).forEach((f) => lines.push(`  • ${f.title}`));
      if (ctx.running.length > 5) lines.push(`  *(+${ctx.running.length - 5} more)*`);
      lines.push('');
    }

    if (ctx.blocked.length > 0) {
      lines.push(`**🚧 Blocked (${ctx.blocked.length}):**`);
      ctx.blocked
        .slice(0, 3)
        .forEach((f) =>
          lines.push(`  • ${f.title}${f.reason ? ` — ${f.reason.slice(0, 80)}` : ''}`)
        );
      if (ctx.blocked.length > 3) lines.push(`  *(+${ctx.blocked.length - 3} more)*`);
      lines.push('');
    }

    if (ctx.prsMerged > 0) {
      lines.push(`**🔀 PRs Merged:** ${ctx.prsMerged}`);
      lines.push('');
    }

    if (
      ctx.completed.length === 0 &&
      ctx.started.length === 0 &&
      ctx.blocked.length === 0 &&
      ctx.prsMerged === 0
    ) {
      lines.push('*No significant activity since last standup.*');
    }

    return lines.join('\n').slice(0, 2000);
  }

  // ---------------------------------------------------------------------------
  // Private: artifact persistence
  // ---------------------------------------------------------------------------

  private async saveArtifact(
    ctx: BoardContext,
    content: string,
    discordPosted: boolean,
    devChannelId: string | undefined
  ): Promise<void> {
    if (!this.dataDir) return;

    const date = new Date().toISOString().slice(0, 10);
    const artifactPath = path.join(this.dataDir, 'standups', `${date}.json`);

    try {
      await fs.mkdir(path.dirname(artifactPath), { recursive: true });
      const artifact = {
        date,
        generatedAt: new Date().toISOString(),
        discordPosted,
        devChannelId: devChannelId ?? null,
        context: {
          since: ctx.since.toISOString(),
          completed: ctx.completed,
          started: ctx.started,
          blocked: ctx.blocked,
          running: ctx.running.length,
          prsMerged: ctx.prsMerged,
        },
        content,
      };
      await fs.writeFile(artifactPath, JSON.stringify(artifact, null, 2), 'utf-8');
      logger.info(`DailyStandupService: saved standup artifact to ${artifactPath}`);
    } catch (err) {
      logger.error('DailyStandupService: failed to save artifact:', err);
    }
  }

  // ---------------------------------------------------------------------------
  // Private: Discord channel resolution
  // ---------------------------------------------------------------------------

  private async resolveDevChannelId(
    globalSettings: GlobalSettings,
    projects: Array<{ path: string }>
  ): Promise<string | undefined> {
    // Try global discord integration channels
    const globalDiscord = (globalSettings as unknown as Record<string, unknown>)[
      'discordIntegration'
    ] as { channels?: { dev?: string } } | undefined;
    if (globalDiscord?.channels?.dev) return globalDiscord.channels.dev;

    // Try first project's discord integration channels.dev
    if (projects.length > 0 && this.settingsService) {
      try {
        const projectSettings = await this.settingsService.getProjectSettings(projects[0].path);
        const discordChannels = projectSettings.integrations?.discord?.channels;
        if (discordChannels?.dev) return discordChannels.dev;
      } catch {
        // ignore
      }
    }

    // Fall back to environment variable
    if (ENV_DEV_CHANNEL_ID) return ENV_DEV_CHANNEL_ID;

    return undefined;
  }
}
