/**
 * GET / endpoint - List all sessions
 */

import { z } from 'zod';
import type { Request, Response } from 'express';
import { AgentService } from '../../../services/agent-service.js';
import { getErrorMessage, logError } from '../common.js';

const sessionsQuerySchema = z.object({
  includeArchived: z
    .enum(['true', 'false'])
    .optional()
    .transform((val) => val === 'true'),
});

export function createIndexHandler(agentService: AgentService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const parsed = sessionsQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: parsed.error.issues,
        });
        return;
      }
      const includeArchived = parsed.data.includeArchived ?? false;
      const sessionsRaw = await agentService.listSessions(includeArchived);

      // Transform to match frontend SessionListItem interface
      const sessions = await Promise.all(
        sessionsRaw.map(async (s) => {
          const messages = await agentService.loadSession(s.id);
          const lastMessage = messages[messages.length - 1];
          const preview = lastMessage?.content?.slice(0, 100) || '';

          return {
            id: s.id,
            name: s.name,
            projectPath: s.projectPath || s.workingDirectory,
            workingDirectory: s.workingDirectory,
            createdAt: s.createdAt,
            updatedAt: s.updatedAt,
            isArchived: s.archived || false,
            tags: s.tags || [],
            messageCount: messages.length,
            preview,
          };
        })
      );

      res.json({ success: true, sessions });
    } catch (error) {
      logError(error, 'List sessions failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
