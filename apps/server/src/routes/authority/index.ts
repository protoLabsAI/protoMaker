/**
 * Authority Routes - API endpoints for the Policy & Trust Authority System
 *
 * Provides endpoints for:
 * - Agent registration and management
 * - Action proposal submission and policy evaluation
 * - Approval resolution (CTO/human tools)
 * - Trust management
 * - Idea injection (CTO → PM pipeline)
 */

import { Router, Request, Response } from 'express';
import { createLogger } from '@automaker/utils';
import type { AuthorityService } from '../../services/authority-service.js';
import type { FeatureLoader } from '../../services/feature-loader.js';
import type { PMAuthorityAgent } from '../../services/authority-agents/pm-agent.js';
import type { ProjMAuthorityAgent } from '../../services/authority-agents/projm-agent.js';
import type { EMAuthorityAgent } from '../../services/authority-agents/em-agent.js';
import type { EventEmitter } from '../../lib/events.js';
import type { AuditService } from '../../services/audit-service.js';

const logger = createLogger('AuthorityRoutes');

interface AuthorityAgents {
  pm?: PMAuthorityAgent;
  projm?: ProjMAuthorityAgent;
  em?: EMAuthorityAgent;
}

export function createAuthorityRoutes(
  authorityService: AuthorityService,
  events: EventEmitter,
  featureLoader?: FeatureLoader,
  agents?: AuthorityAgents,
  auditService?: AuditService
): Router {
  const router = Router();

  /**
   * GET /api/authority/status
   * Health check for the authority system
   */
  router.get('/status', (_req: Request, res: Response) => {
    res.json({ enabled: true });
  });

  /**
   * POST /api/authority/register
   * Register a new agent with a given role
   */
  router.post('/register', async (req: Request, res: Response) => {
    try {
      const { role, projectPath } = req.body;

      if (!role || !projectPath) {
        res.status(400).json({ error: 'role and projectPath are required' });
        return;
      }

      const agent = await authorityService.registerAgent(role, projectPath);
      res.json({ agent });
    } catch (error) {
      logger.error('Failed to register agent:', error);
      res.status(500).json({ error: 'Failed to register agent' });
    }
  });

  /**
   * POST /api/authority/propose
   * Submit an action proposal for policy evaluation
   */
  router.post('/propose', async (req: Request, res: Response) => {
    try {
      const { proposal, projectPath } = req.body;

      if (!proposal || !projectPath) {
        res.status(400).json({ error: 'proposal and projectPath are required' });
        return;
      }

      if (!proposal.who || !proposal.what || !proposal.target || !proposal.risk) {
        res.status(400).json({
          error: 'proposal must include who, what, target, and risk fields',
        });
        return;
      }

      const decision = await authorityService.submitProposal(proposal, projectPath);
      res.json({ decision });
    } catch (error) {
      logger.error('Failed to submit proposal:', error);
      res.status(500).json({ error: 'Failed to submit proposal' });
    }
  });

  /**
   * POST /api/authority/resolve
   * Resolve a pending approval request (CTO tool)
   */
  router.post('/resolve', async (req: Request, res: Response) => {
    try {
      const { requestId, resolution, resolvedBy, projectPath } = req.body;

      if (!requestId || !resolution || !resolvedBy || !projectPath) {
        res.status(400).json({
          error: 'requestId, resolution, resolvedBy, and projectPath are required',
        });
        return;
      }

      const validResolutions = ['approve', 'reject', 'modify'];
      if (!validResolutions.includes(resolution)) {
        res.status(400).json({
          error: `resolution must be one of: ${validResolutions.join(', ')}`,
        });
        return;
      }

      const request = await authorityService.resolveApproval(
        requestId,
        resolution,
        resolvedBy,
        projectPath
      );

      if (!request) {
        res.status(404).json({ error: 'Approval request not found' });
        return;
      }

      res.json({ request });
    } catch (error) {
      logger.error('Failed to resolve approval:', error);
      res.status(500).json({ error: 'Failed to resolve approval' });
    }
  });

  /**
   * POST /api/authority/approvals
   * Get all pending approval requests for a project (CTO dashboard)
   */
  router.post('/approvals', async (req: Request, res: Response) => {
    try {
      const { projectPath } = req.body;

      if (!projectPath) {
        res.status(400).json({ error: 'projectPath is required' });
        return;
      }

      const approvals = await authorityService.getPendingApprovals(projectPath);
      res.json({ approvals });
    } catch (error) {
      logger.error('Failed to get pending approvals:', error);
      res.status(500).json({ error: 'Failed to get pending approvals' });
    }
  });

  /**
   * POST /api/authority/agents
   * List all registered agents for a project
   */
  router.post('/agents', async (req: Request, res: Response) => {
    try {
      const { projectPath } = req.body;

      if (!projectPath) {
        res.status(400).json({ error: 'projectPath is required' });
        return;
      }

      const agents = await authorityService.getAgents(projectPath);
      res.json({ agents });
    } catch (error) {
      logger.error('Failed to get agents:', error);
      res.status(500).json({ error: 'Failed to get agents' });
    }
  });

  /**
   * POST /api/authority/trust
   * Update an agent's trust level (CTO tool)
   */
  router.post('/trust', async (req: Request, res: Response) => {
    try {
      const { agentId, trustLevel, projectPath } = req.body;

      if (!agentId || trustLevel === undefined || !projectPath) {
        res.status(400).json({ error: 'agentId, trustLevel, and projectPath are required' });
        return;
      }

      const validTrustLevels = [0, 1, 2, 3];
      if (!validTrustLevels.includes(trustLevel)) {
        res.status(400).json({
          error: `trustLevel must be one of: ${validTrustLevels.join(', ')}`,
        });
        return;
      }

      const agent = await authorityService.updateTrustLevel(agentId, trustLevel, projectPath);

      if (!agent) {
        res.status(404).json({ error: 'Agent not found' });
        return;
      }

      res.json({ agent });
    } catch (error) {
      logger.error('Failed to update trust level:', error);
      res.status(500).json({ error: 'Failed to update trust level' });
    }
  });

  /**
   * POST /api/authority/inject-idea
   * CTO tool: Submit a new idea that enters the authority pipeline.
   * Creates a feature with workItemState='idea' and emits authority:idea-injected
   * for the PM agent to pick up.
   *
   * Body: { projectPath, title, description, priority?, complexity? }
   */
  router.post('/inject-idea', async (req: Request, res: Response) => {
    try {
      const { projectPath, title, description, priority, complexity } = req.body;

      if (!projectPath || !title || !description) {
        res.status(400).json({
          error: 'projectPath, title, and description are required',
        });
        return;
      }

      if (!featureLoader) {
        res.status(503).json({
          error: 'Feature loader not available - authority system not fully initialized',
        });
        return;
      }

      // Ensure all authority agents are initialized for this project
      if (agents?.pm) await agents.pm.initialize(projectPath);
      if (agents?.projm) await agents.projm.initialize(projectPath);
      if (agents?.em) await agents.em.initialize(projectPath);

      // Create a feature in 'backlog' status with workItemState='idea'
      const feature = await featureLoader.create(projectPath, {
        title,
        description,
        status: 'backlog',
        category: 'Authority Ideas',
        complexity: complexity || 'medium',
        priority: priority || 0,
        workItemState: 'idea',
      });

      // Emit event for PM agent to pick up
      events.emit('authority:idea-injected', {
        projectPath,
        featureId: feature.id,
        title,
        description,
        injectedBy: 'cto',
        injectedAt: new Date().toISOString(),
      });

      logger.info(`Idea injected: "${title}" → feature ${feature.id}`);

      res.json({
        feature,
        message: `Idea "${title}" injected. PM agent will pick it up for research.`,
      });
    } catch (error) {
      logger.error('Failed to inject idea:', error);
      res.status(500).json({ error: 'Failed to inject idea' });
    }
  });

  /**
   * POST /api/authority/dashboard
   * CTO dashboard: Overview of authority system state for a project.
   * Returns agents, pending approvals, and recent activity.
   */
  router.post('/dashboard', async (req: Request, res: Response) => {
    try {
      const { projectPath } = req.body;

      if (!projectPath) {
        res.status(400).json({ error: 'projectPath is required' });
        return;
      }

      const [agents, pendingApprovals] = await Promise.all([
        authorityService.getAgents(projectPath),
        authorityService.getPendingApprovals(projectPath),
      ]);

      // Get ideas waiting for PM pickup
      let ideasInPipeline: Array<{ id: string; title?: string; workItemState?: string }> = [];
      if (featureLoader) {
        const features = await featureLoader.getAll(projectPath);
        ideasInPipeline = features
          .filter(
            (f) =>
              f.workItemState === 'idea' ||
              f.workItemState === 'research' ||
              f.workItemState === 'planned'
          )
          .map((f) => ({
            id: f.id,
            title: f.title,
            workItemState: f.workItemState as string,
          }));
      }

      res.json({
        agents,
        pendingApprovals,
        ideasInPipeline,
        summary: {
          totalAgents: agents.length,
          pendingApprovalCount: pendingApprovals.length,
          ideasCount: ideasInPipeline.filter((i) => i.workItemState === 'idea').length,
          researchingCount: ideasInPipeline.filter((i) => i.workItemState === 'research').length,
          plannedCount: ideasInPipeline.filter((i) => i.workItemState === 'planned').length,
        },
      });
    } catch (error) {
      logger.error('Failed to get dashboard:', error);
      res.status(500).json({ error: 'Failed to get dashboard' });
    }
  });

  /**
   * POST /api/authority/audit
   * Query the audit trail for a project.
   * Body: { projectPath, eventType?, agentId?, limit?, since? }
   */
  router.post('/audit', async (req: Request, res: Response) => {
    try {
      const { projectPath, eventType, agentId, limit, since } = req.body;

      if (!projectPath) {
        res.status(400).json({ error: 'projectPath is required' });
        return;
      }

      if (!auditService) {
        res.status(503).json({ error: 'Audit service not available' });
        return;
      }

      const entries = await auditService.query(projectPath, {
        eventType,
        agentId,
        limit,
        since,
      });

      res.json({ entries, count: entries.length });
    } catch (error) {
      logger.error('Failed to query audit trail:', error);
      res.status(500).json({ error: 'Failed to query audit trail' });
    }
  });

  /**
   * POST /api/authority/trust-scores
   * Get trust scores for agents in a project.
   * Body: { projectPath, agentId? }
   */
  router.post('/trust-scores', async (req: Request, res: Response) => {
    try {
      const { projectPath, agentId } = req.body;

      if (!projectPath) {
        res.status(400).json({ error: 'projectPath is required' });
        return;
      }

      if (!auditService) {
        res.status(503).json({ error: 'Audit service not available' });
        return;
      }

      if (agentId) {
        const score = auditService.getTrustScore(projectPath, agentId);
        res.json({ agentId, score });
        return;
      }

      // Return scores for all agents in project
      const agents = await authorityService.getAgents(projectPath);
      const scores = agents.map((agent) => ({
        agentId: agent.id,
        role: agent.role,
        trust: agent.trust,
        score: auditService!.getTrustScore(projectPath, agent.id),
      }));

      res.json({ scores });
    } catch (error) {
      logger.error('Failed to get trust scores:', error);
      res.status(500).json({ error: 'Failed to get trust scores' });
    }
  });

  /**
   * POST /api/authority/decisions
   * Query decision history for a project.
   * Body: { projectPath, agentId?, decisionType?, tags?, since?, limit? }
   */
  router.post('/decisions', async (req: Request, res: Response) => {
    try {
      const { projectPath, agentId, decisionType, tags, since, limit } = req.body;

      if (!projectPath) {
        res.status(400).json({ error: 'projectPath is required' });
        return;
      }

      if (!auditService) {
        res.status(503).json({ error: 'Audit service not available' });
        return;
      }

      const decisions = await auditService.queryDecisions(projectPath, {
        agentId,
        decisionType,
        tags,
        since,
        limit,
      });

      res.json({ decisions, count: decisions.length });
    } catch (error) {
      logger.error('Failed to query decisions:', error);
      res.status(500).json({ error: 'Failed to query decisions' });
    }
  });

  /**
   * POST /api/authority/decision-chain
   * Get decision lineage (chain of related decisions).
   * Body: { projectPath, decisionId }
   */
  router.post('/decision-chain', async (req: Request, res: Response) => {
    try {
      const { projectPath, decisionId } = req.body;

      if (!projectPath || !decisionId) {
        res.status(400).json({ error: 'projectPath and decisionId are required' });
        return;
      }

      if (!auditService) {
        res.status(503).json({ error: 'Audit service not available' });
        return;
      }

      const chain = await auditService.getDecisionChain(projectPath, decisionId);

      res.json({ chain, count: chain.length });
    } catch (error) {
      logger.error('Failed to get decision chain:', error);
      res.status(500).json({ error: 'Failed to get decision chain' });
    }
  });

  return router;
}
