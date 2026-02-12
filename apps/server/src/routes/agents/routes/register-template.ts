/**
 * POST /api/agents/templates/register - Register a new agent template
 */

import type { Request, Response } from 'express';
import type { AgentTemplate } from '@automaker/types';
import type { RoleRegistryService } from '../../../services/role-registry-service.js';
import { getErrorMessage, logError } from '../common.js';

interface RegisterTemplateRequest {
  template: AgentTemplate;
}

export function createRegisterTemplateHandler(registry: RoleRegistryService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { template } = req.body as RegisterTemplateRequest;

      if (!template) {
        res.status(400).json({ success: false, error: 'template is required' });
        return;
      }

      const result = registry.register(template);
      if (!result.success) {
        res.status(400).json({ success: false, error: result.error });
        return;
      }

      res.json({ success: true, name: template.name });
    } catch (error) {
      logError(error, 'Register template failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
