import type { ServiceContainer } from '../../server/services.js';

import { UINotificationChannel } from './ui-notification-channel.js';
import { DiscordChannelEscalation } from './discord-channel-escalation.js';

export async function register(container: ServiceContainer): Promise<void> {
  const { events, escalationRouter } = container;

  escalationRouter.setEventEmitter(events);
  escalationRouter.registerChannel(new UINotificationChannel(events));
  escalationRouter.registerChannel(new DiscordChannelEscalation());
}
