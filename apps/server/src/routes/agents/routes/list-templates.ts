/**
 * POST /api/agents/templates/list - List all registered agent templates
 */

import type { Request, Response } from 'express';
import type { RoleRegistryService } from '../../../services/role-registry-service.js';
import { getErrorMessage, logError } from '../common.js';

interface ListTemplatesRequest {
  role?: string;
}

export function createListTemplatesHandler(registry: RoleRegistryService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { role } = req.body as ListTemplatesRequest;

      const templates = registry.list(role);

      res.json({
        success: true,
        templates: templates.map((t) => ({
          name: t.name,
          displayName: t.displayName,
          description: t.description,
          role: t.role,
          tier: t.tier ?? 1,
          model: t.model,
          tags: t.tags,
        })),
        count: templates.length,
      });
    } catch (error) {
      logError(error, 'List templates failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
