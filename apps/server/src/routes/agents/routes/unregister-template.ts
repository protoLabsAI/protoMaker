/**
 * POST /api/agents/templates/unregister - Remove an agent template
 *
 * Refuses to unregister tier 0 (protected) templates.
 */

import type { Request, Response } from 'express';
import type { RoleRegistryService } from '../../../services/role-registry-service.js';
import { getErrorMessage, logError } from '../common.js';

interface UnregisterTemplateRequest {
  name: string;
}

export function createUnregisterTemplateHandler(registry: RoleRegistryService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { name } = req.body as UnregisterTemplateRequest;

      if (!name) {
        res.status(400).json({ success: false, error: 'name is required' });
        return;
      }

      const result = registry.unregister(name);
      if (!result.success) {
        // Distinguish between not-found and tier-protection
        const existing = registry.get(name);
        const status = existing ? 403 : 404;
        res.status(status).json({ success: false, error: result.error });
        return;
      }

      res.json({ success: true });
    } catch (error) {
      logError(error, 'Unregister template failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
