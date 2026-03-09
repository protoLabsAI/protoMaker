import type { Request, Response } from 'express';
import type { DiscordBotService } from '../../../services/discord-bot-service.js';

export function createSendChannelMessageHandler(discordBotService: DiscordBotService) {
  return async (req: Request, res: Response) => {
    const { channelId, content, embed } = req.body;

    if (!channelId || typeof channelId !== 'string') {
      res.status(400).json({ success: false, error: 'channelId is required' });
      return;
    }

    if (!content && !embed) {
      res.status(400).json({ success: false, error: 'Either content or embed is required' });
      return;
    }

    try {
      let success: boolean;
      if (embed && typeof embed === 'object' && embed.title) {
        success = await discordBotService.sendEmbed(channelId, embed);
      } else if (content && typeof content === 'string') {
        success = await discordBotService.sendToChannel(channelId, content);
      } else {
        res.status(400).json({ success: false, error: 'Invalid content or embed' });
        return;
      }
      res.json({ success });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ success: false, error: message });
    }
  };
}
