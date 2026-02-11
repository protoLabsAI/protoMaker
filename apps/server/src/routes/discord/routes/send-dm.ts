import type { Request, Response } from 'express';
import type { DiscordBotService } from '../../../services/discord-bot-service.js';

export function createSendDMHandler(discordBotService: DiscordBotService) {
  return async (req: Request, res: Response) => {
    const { username, content } = req.body;

    if (!username || typeof username !== 'string') {
      res.status(400).json({ success: false, error: 'username is required' });
      return;
    }

    if (!content || typeof content !== 'string') {
      res.status(400).json({ success: false, error: 'content is required' });
      return;
    }

    try {
      const success = await discordBotService.sendDM(username, content);
      res.json({ success });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ success: false, error: message });
    }
  };
}
