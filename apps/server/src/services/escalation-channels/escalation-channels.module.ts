import type { ServiceContainer } from '../../server/services.js';

import { UINotificationChannel } from './ui-notification-channel.js';
import { DiscordChannelEscalation } from './discord-channel-escalation.js';
import { GitHubIssueChannel } from './github-issue-channel.js';
/**
 * Registers escalation channels with the router.
 *
 * Note: DiscordDMChannel is registered in discord.module.ts because it requires
 * the Discord bot service to be initialized first.
 */
export async function register(container: ServiceContainer): Promise<void> {
  const { events, featureLoader, repoRoot, escalationRouter, discordService } = container;

  escalationRouter.setEventEmitter(events);
  escalationRouter.registerChannel(new UINotificationChannel(events));
  escalationRouter.registerChannel(new DiscordChannelEscalation(discordService));
  escalationRouter.registerChannel(
    new GitHubIssueChannel({ featureLoader, projectPath: repoRoot })
  );
}
