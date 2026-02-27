import type { ServiceContainer } from '../../server/services.js';

import { UINotificationChannel } from './ui-notification-channel.js';
import { DiscordChannelEscalation } from './discord-channel-escalation.js';
import { GitHubIssueChannel } from './github-issue-channel.js';
import { LinearIssueChannel } from './linear-issue-channel.js';
import { BeadsChannel } from './beads-channel.js';

/**
 * Registers escalation channels with the router.
 *
 * Note: DiscordDMChannel is registered in discord.module.ts because it requires
 * the Discord bot service to be initialized first.
 */
export function register(container: ServiceContainer): void {
  const {
    events,
    settingsService,
    featureLoader,
    repoRoot,
    escalationRouter,
    discordService,
    beadsService,
  } = container;

  escalationRouter.setEventEmitter(events);
  escalationRouter.registerChannel(new UINotificationChannel(events));
  escalationRouter.registerChannel(new DiscordChannelEscalation(discordService));
  escalationRouter.registerChannel(
    new GitHubIssueChannel({ featureLoader, projectPath: repoRoot })
  );
  escalationRouter.registerChannel(
    new LinearIssueChannel(
      settingsService,
      repoRoot,
      undefined,
      undefined,
      events,
      escalationRouter
    )
  );
  escalationRouter.registerChannel(new BeadsChannel(beadsService, repoRoot));
}
