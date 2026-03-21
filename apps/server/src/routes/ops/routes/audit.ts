/**
 * Ops audit routes - Tool execution audit log endpoints
 *
 * GET / - List recent tool execution audit entries with optional filtering
 *
 * Query parameters:
 *   agentId   - Filter by agent ID
 *   featureId - Filter by feature ID
 *   toolName  - Filter by tool name
 *   since     - ISO 8601 timestamp lower bound
 *   limit     - Max entries to return (default 100)
 */

import { Router } from 'express';
import { createLogger } from '@protolabsai/utils';

import type { AuditService } from '../../../services/audit-service.js';

const logger = createLogger('Routes:Audit');

export function createAuditRoutes(auditService: AuditService): Router {
  const router = Router();

  // GET / - List recent tool execution audit entries
  router.get('/', async (req, res) => {
    try {
      const { agentId, featureId, toolName, since, limit } = req.query as Record<string, string>;

      const entries = await auditService.queryToolExecutions({
        agentId: agentId || undefined,
        featureId: featureId || undefined,
        toolName: toolName || undefined,
        since: since || undefined,
        limit: limit ? parseInt(limit, 10) : 100,
      });

      res.json({ entries, count: entries.length });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Failed to query audit entries:', error);
      res.status(500).json({ error: message });
    }
  });

  return router;
}
