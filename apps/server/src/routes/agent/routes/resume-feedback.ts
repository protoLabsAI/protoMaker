/**
 * POST /resume-feedback endpoint - Resume agent with PR feedback
 */

import type { Request, Response } from 'express';
import { AgentService } from '../../../services/agent-service.js';
import { createLogger } from '@automaker/utils';
import { getErrorMessage, logError } from '../common.js';

const logger = createLogger('Agent');

export function createResumeFeedbackHandler(agentService: AgentService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId, feedback } = req.body as {
        sessionId: string;
        feedback: string;
      };

      if (!sessionId) {
        res.status(400).json({ success: false, error: 'sessionId is required' });
        return;
      }

      if (!feedback) {
        res.status(400).json({ success: false, error: 'feedback is required' });
        return;
      }

      logger.info('Resuming agent with PR feedback', { sessionId });

      // Send the feedback as a message to the agent
      await agentService.sendMessage({
        sessionId,
        message: feedback,
      });

      res.json({ success: true });
    } catch (error) {
      logError(error, 'Resume with feedback failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
