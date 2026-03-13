/**
 * Agent Manifest API Routes
 *
 * Exposes discovered agents (built-in + project-defined) for a given project:
 * - POST /api/agents/list  — all agents merged with project manifest overrides
 * - POST /api/agents/get   — single agent by name with resolved capabilities
 * - POST /api/agents/match — best-matching agent for a given feature ID
 */

import { Router } from 'express';
import { createLogger } from '@protolabsai/utils';
import { BUILT_IN_AGENT_ROLES, ROLE_CAPABILITIES } from '@protolabsai/types';
import type { ProjectAgent } from '@protolabsai/types';
import { getAgentManifestService } from '../services/agent-manifest-service.js';
import type { FeatureLoader } from '../services/feature-loader.js';

const logger = createLogger('AgentRoutes');

export function createAgentRoutes(featureLoader: FeatureLoader): Router {
  const router = Router();

  /**
   * POST /api/agents/list
   *
   * Returns all agents for a project: the 8 built-in roles (as synthetic ProjectAgent
   * objects) merged with any project-manifest overrides. Project agents override built-in
   * entries when their `name` matches a built-in role name.
   *
   * Body:
   * - projectPath: string (required)
   */
  router.post('/list', async (req, res) => {
    try {
      const { projectPath } = req.body as { projectPath: string };

      if (!projectPath) {
        res.status(400).json({ error: 'projectPath is required' });
        return;
      }

      // Build synthetic entries for each built-in role
      const builtIns: ProjectAgent[] = BUILT_IN_AGENT_ROLES.map((role) => ({
        name: role,
        extends: role,
        description: ROLE_CAPABILITIES[role]?.description ?? '',
        _builtIn: true,
      }));

      const service = getAgentManifestService();
      const manifest = await service.getAgentsForProject(projectPath);
      const projectAgents = manifest?.agents ?? [];

      // Merge: project agents with the same name as a built-in replace the built-in entry
      const projectAgentNames = new Set(projectAgents.map((a) => a.name));
      const merged: ProjectAgent[] = [
        ...builtIns.filter((b) => !projectAgentNames.has(b.name)),
        ...projectAgents,
      ];

      res.json({
        success: true,
        projectPath,
        count: merged.length,
        agents: merged,
      });
    } catch (error) {
      logger.error('Failed to list agents:', error);
      res.status(500).json({
        error: 'Failed to list agents',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * POST /api/agents/get
   *
   * Returns a single agent by name along with its fully resolved capabilities.
   * Built-in roles are always available as a fallback even without a project manifest.
   *
   * Body:
   * - projectPath: string (required)
   * - agentName:   string (required)
   */
  router.post('/get', async (req, res) => {
    try {
      const { projectPath, agentName } = req.body as {
        projectPath: string;
        agentName: string;
      };

      if (!projectPath) {
        res.status(400).json({ error: 'projectPath is required' });
        return;
      }

      if (!agentName) {
        res.status(400).json({ error: 'agentName is required' });
        return;
      }

      const service = getAgentManifestService();

      // Try project manifest first
      let agent = await service.getAgent(projectPath, agentName);

      // Fall back to built-in role as a synthetic agent
      if (!agent && ROLE_CAPABILITIES[agentName]) {
        agent = {
          name: agentName,
          extends: agentName,
          description: ROLE_CAPABILITIES[agentName].description ?? '',
        };
      }

      if (!agent) {
        res.status(404).json({ error: `Agent "${agentName}" not found` });
        return;
      }

      let capabilities = await service.getResolvedCapabilities(projectPath, agent.name);

      // getResolvedCapabilities returns null when the agent isn't in the project manifest
      // (i.e. it's a synthetic built-in). Fall back to direct ROLE_CAPABILITIES lookup so
      // built-in roles always return their capabilities.
      if (capabilities === null && ROLE_CAPABILITIES[agent.name]) {
        capabilities = ROLE_CAPABILITIES[agent.name];
      }

      res.json({
        success: true,
        projectPath,
        agent,
        capabilities,
      });
    } catch (error) {
      logger.error('Failed to get agent:', error);
      res.status(500).json({
        error: 'Failed to get agent',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * POST /api/agents/match
   *
   * Loads the feature identified by featureId and runs all project agent match rules
   * against it, returning the highest-scoring agent. Returns null when no project
   * agents match.
   *
   * Body:
   * - projectPath: string (required)
   * - featureId:   string (required)
   */
  router.post('/match', async (req, res) => {
    try {
      const { projectPath, featureId } = req.body as {
        projectPath: string;
        featureId: string;
      };

      if (!projectPath) {
        res.status(400).json({ error: 'projectPath is required' });
        return;
      }

      if (!featureId) {
        res.status(400).json({ error: 'featureId is required' });
        return;
      }

      const feature = await featureLoader.get(projectPath, featureId);
      if (!feature) {
        res.status(404).json({ error: `Feature "${featureId}" not found` });
        return;
      }

      const service = getAgentManifestService();
      const matched = await service.matchFeature(projectPath, {
        category: feature.category,
        title: feature.title ?? '',
        description: feature.description,
        filesToModify: feature.filesToModify,
      });

      res.json({
        success: true,
        projectPath,
        featureId,
        agent: matched?.agent ?? null,
        confidence: matched?.confidence ?? null,
      });
    } catch (error) {
      logger.error('Failed to match agent for feature:', error);
      res.status(500).json({
        error: 'Failed to match agent for feature',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return router;
}
