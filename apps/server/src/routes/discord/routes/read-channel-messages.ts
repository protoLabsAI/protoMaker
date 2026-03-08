import type { Request, Response } from 'express';
import type { DiscordBotService } from '../../../services/discord-bot-service.js';

export function createReadChannelMessagesHandler(discordBotService: DiscordBotService) {
  return async (req: Request, res: Response) => {
    const { channelId, limit } = req.body;

    if (!channelId || typeof channelId !== 'string') {
      res.status(400).json({ success: false, error: 'channelId is required' });
      return;
    }

    try {
      const messages = await discordBotService.readMessages(channelId, limit || 10);
      res.json({ success: true, messages });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ success: false, error: message });
    }
  };
}
