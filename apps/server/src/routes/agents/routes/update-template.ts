/**
 * POST /api/agents/templates/update - Update an existing agent template
 *
 * Merges the provided fields into the existing template and re-registers.
 * Refuses to update tier 0 (protected) templates.
 */

import type { Request, Response } from 'express';
import type { AgentTemplate } from '@automaker/types';
import type { RoleRegistryService } from '../../../services/role-registry-service.js';
import { getErrorMessage, logError } from '../common.js';

interface UpdateTemplateRequest {
  name: string;
  updates: Partial<AgentTemplate>;
}

export function createUpdateTemplateHandler(registry: RoleRegistryService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { name, updates } = req.body as UpdateTemplateRequest;

      if (!name) {
        res.status(400).json({ success: false, error: 'name is required' });
        return;
      }

      if (!updates || Object.keys(updates).length === 0) {
        res.status(400).json({ success: false, error: 'updates object is required' });
        return;
      }

      const existing = registry.get(name);
      if (!existing) {
        res.status(404).json({ success: false, error: `Template "${name}" not found` });
        return;
      }

      if (existing.tier === 0) {
        res.status(403).json({
          success: false,
          error: `Cannot update protected template "${name}" (tier 0)`,
        });
        return;
      }

      // Merge updates into existing template (name cannot be changed)
      const merged = { ...existing, ...updates, name: existing.name } as AgentTemplate;

      const result = registry.register(merged);
      if (!result.success) {
        res.status(400).json({ success: false, error: result.error });
        return;
      }

      res.json({ success: true, template: registry.get(name) });
    } catch (error) {
      logError(error, 'Update template failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
