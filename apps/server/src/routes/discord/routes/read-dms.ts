import type { Request, Response } from 'express';
import type { DiscordBotService } from '../../../services/discord-bot-service.js';

export function createReadDMsHandler(discordBotService: DiscordBotService) {
  return async (req: Request, res: Response) => {
    const { username, limit } = req.body;

    if (!username || typeof username !== 'string') {
      res.status(400).json({ success: false, error: 'username is required' });
      return;
    }

    const messageLimit = typeof limit === 'number' && limit > 0 ? Math.min(limit, 100) : 10;

    try {
      const messages = await discordBotService.readDMs(username, messageLimit);
      res.json({ success: true, messages });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ success: false, error: message });
    }
  };
}
