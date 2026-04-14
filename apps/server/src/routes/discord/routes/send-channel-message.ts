import type { Request, Response } from 'express';
import type { ProjectRegistryService } from '../../../services/project-registry-service.js';
import {
  sendToProjectChannel,
  sendEmbedToProjectChannel,
  type WebhookEmbed,
  type ProjectChannelType,
} from '../../../services/discord-webhook.service.js';

const VALID_CHANNEL_TYPES = new Set<ProjectChannelType>(['dev', 'release']);

export function createSendChannelMessageHandler(projectRegistry: ProjectRegistryService) {
  return async (req: Request, res: Response) => {
    const { projectSlug, channelType, content, embed } = req.body;

    if (!projectSlug || typeof projectSlug !== 'string') {
      res.status(400).json({ success: false, error: 'projectSlug is required' });
      return;
    }

    if (!channelType || !VALID_CHANNEL_TYPES.has(channelType as ProjectChannelType)) {
      res.status(400).json({
        success: false,
        error: `channelType must be one of: ${[...VALID_CHANNEL_TYPES].join(', ')}`,
      });
      return;
    }

    if (!content && !embed) {
      res.status(400).json({ success: false, error: 'Either content or embed is required' });
      return;
    }

    const project = projectRegistry.getProject(projectSlug);
    if (!project) {
      res.status(404).json({
        success: false,
        error: `Project "${projectSlug}" not found in registry`,
      });
      return;
    }

    try {
      let success: boolean;
      if (embed && typeof embed === 'object' && (embed as WebhookEmbed).title) {
        success = await sendEmbedToProjectChannel(
          project,
          channelType as ProjectChannelType,
          embed as WebhookEmbed
        );
      } else if (content && typeof content === 'string') {
        success = await sendToProjectChannel(project, channelType as ProjectChannelType, content);
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
