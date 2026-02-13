/**
 * POST /api/features/assign-agent
 *
 * Assigns an agent role to a feature, optionally overriding an AI suggestion.
 * Validates the role against known agent roles from the registry.
 */

import type { Request, Response } from 'express';
import type { FeatureLoader } from '../../../services/feature-loader.js';
import type { RoleRegistryService } from '../../../services/role-registry-service.js';
import type { EventEmitter } from '../../../lib/events.js';

export function createAssignAgentHandler(
  featureLoader: FeatureLoader,
  roleRegistry?: RoleRegistryService,
  events?: EventEmitter
) {
  return async (req: Request, res: Response) => {
    const { projectPath, featureId, role, clear } = req.body;

    if (!projectPath || !featureId) {
      res.status(400).json({
        success: false,
        error: 'projectPath and featureId are required',
      });
      return;
    }

    // Allow clearing the assignment
    if (clear) {
      try {
        await featureLoader.update(projectPath, featureId, {
          assignedRole: undefined,
          routingSuggestion: undefined,
        });
        res.json({ success: true, message: 'Agent assignment cleared' });
        return;
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to clear assignment',
        });
        return;
      }
    }

    if (!role) {
      res.status(400).json({
        success: false,
        error: 'role is required (or set clear: true to remove assignment)',
      });
      return;
    }

    // Validate role against known roles
    if (roleRegistry) {
      const knownRoles = roleRegistry.getKnownRoles();
      if (!knownRoles.includes(role)) {
        res.status(400).json({
          success: false,
          error: `Invalid role "${role}". Valid roles: ${knownRoles.join(', ')}`,
        });
        return;
      }
    }

    try {
      await featureLoader.update(projectPath, featureId, {
        assignedRole: role,
      });

      events?.emit('feature:agent-assigned', {
        featureId,
        role,
        assignedAt: new Date().toISOString(),
        isOverride: true,
      });

      res.json({
        success: true,
        message: `Agent role "${role}" assigned to feature`,
        role,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to assign agent',
      });
    }
  };
}
