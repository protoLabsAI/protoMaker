import type { ServiceContainer } from '../../server/services.js';

import { UINotificationChannel } from './ui-notification-channel.js';
import { DiscordChannelEscalation } from './discord-channel-escalation.js';
import { GitHubIssueChannel } from './github-issue-channel.js';
import { LinearIssueChannel } from './linear-issue-channel.js';
/**
 * Registers escalation channels with the router.
 *
 * Note: DiscordDMChannel is registered in discord.module.ts because it requires
 * the Discord bot service to be initialized first.
 */
export async function register(container: ServiceContainer): Promise<void> {
  const { events, settingsService, featureLoader, repoRoot, escalationRouter, discordService } =
    container;

  escalationRouter.setEventEmitter(events);
  escalationRouter.registerChannel(new UINotificationChannel(events));
  escalationRouter.registerChannel(new DiscordChannelEscalation(discordService));
  escalationRouter.registerChannel(
    new GitHubIssueChannel({ featureLoader, projectPath: repoRoot })
  );

  // Read Linear team ID from project settings for escalation issue routing
  let teamConfig: { defaultTeamId: string } | undefined;
  try {
    const projectSettings = await settingsService.getProjectSettings(repoRoot);
    const teamId = projectSettings.integrations?.linear?.teamId;
    if (teamId) {
      teamConfig = { defaultTeamId: teamId };
    }
  } catch {
    // Settings unavailable — channel will use its fallback
  }
  escalationRouter.registerChannel(
    new LinearIssueChannel(
      settingsService,
      repoRoot,
      teamConfig,
      undefined,
      events,
      escalationRouter
    )
  );
}
