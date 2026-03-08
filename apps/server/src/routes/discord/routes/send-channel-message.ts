import type { Request, Response } from 'express';
import type { DiscordBotService } from '../../../services/discord-bot-service.js';

export function createSendChannelMessageHandler(discordBotService: DiscordBotService) {
  return async (req: Request, res: Response) => {
    const { channelId, content } = req.body;

    if (!channelId || typeof channelId !== 'string') {
      res.status(400).json({ success: false, error: 'channelId is required' });
      return;
    }

    if (!content || typeof content !== 'string') {
      res.status(400).json({ success: false, error: 'content is required' });
      return;
    }

    try {
      const success = await discordBotService.sendToChannel(channelId, content);
      res.json({ success });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ success: false, error: message });
    }
  };
}
