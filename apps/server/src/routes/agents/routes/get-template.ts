/**
 * POST /api/agents/templates/get - Get a specific agent template by name
 */

import type { Request, Response } from 'express';
import type { RoleRegistryService } from '../../../services/role-registry-service.js';
import { getErrorMessage, logError } from '../common.js';

interface GetTemplateRequest {
  name: string;
}

export function createGetTemplateHandler(registry: RoleRegistryService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { name } = req.body as GetTemplateRequest;

      if (!name) {
        res.status(400).json({ success: false, error: 'name is required' });
        return;
      }

      const template = registry.get(name);
      if (!template) {
        res.status(404).json({ success: false, error: `Template "${name}" not found` });
        return;
      }

      res.json({ success: true, template });
    } catch (error) {
      logError(error, 'Get template failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
