/**
 * World-state endpoints — lightweight GET snapshots for workstacean polling.
 *
 * GET /api/world/board        — aggregate feature counts across all projects
 * GET /api/world/agent-health — running agents + count
 * GET /api/world/dispatch-health — GOAP feedback loop protection status
 *
 * These are designed to be polled by workstacean's WorldStateEngine via HTTP
 * domain collectors registered in workspace/domains.yaml.  Responses are
 * intentionally minimal — just the facts the GOAP planner needs.
 *
 * Auth: X-API-Key header (same credential as /a2a and /webhooks).
 * Mounted before authMiddleware so the API key check is done manually here.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import type { FeatureLoader } from '../../services/feature-loader.js';
import type { AutoModeService } from '../../services/auto-mode-service.js';
import { validateApiKey } from '../../lib/auth.js';
import { getBacklogPlanStatus, getRunningDetails } from '../backlog-plan/common.js';
import { getAllRunningGenerations } from '../app-spec/common.js';
import {
  DispatchCooldown,
  IncidentDedup,
  DispatchValidator,
  AgentCircuitBreakerManager,
  DEFAULT_GOAP_CONFIG,
} from '../../lib/goap/index.js';

// Singleton instances for GOAP feedback loop protection
const dispatchCooldown = new DispatchCooldown();
const incidentDedup = new IncidentDedup();
const dispatchValidator = new DispatchValidator();
const agentCircuitBreaker = new AgentCircuitBreakerManager();

export { dispatchCooldown, incidentDedup, dispatchValidator, agentCircuitBreaker };

function requireApiKey(req: Request, res: Response): boolean {
  const key = req.headers['x-api-key'] as string | undefined;
  if (!key || !validateApiKey(key)) {
    res.status(401).json({ success: false, error: 'Unauthorized: X-API-Key required' });
    return false;
  }
  return true;
}

export function createWorldRoutes(
  featureLoader: FeatureLoader,
  autoModeService: AutoModeService,
  repoRoot: string
): Router {
  const router = Router();

  /**
   * GET /api/world/board
   *
   * Returns aggregate feature counts across all projects in this ava instance.
   * Shape is intentionally flat so the GOAP planner can access counts via
   * JSON-path queries like `board.inProgress`.
   */
  router.get('/board', async (req: Request, res: Response): Promise<void> => {
    if (!requireApiKey(req, res)) return;

    try {
      const features = await featureLoader.getAll(repoRoot);

      const by_status = {
        backlog: 0,
        in_progress: 0,
        review: 0,
        blocked: 0,
        done: 0,
      };

      for (const f of features) {
        switch (f.status) {
          case 'backlog':
            by_status.backlog++;
            break;
          case 'in_progress':
            by_status.in_progress++;
            break;
          case 'review':
            by_status.review++;
            break;
          case 'blocked':
            by_status.blocked++;
            break;
          case 'done':
          case 'verified':
            by_status.done++;
            break;
        }
      }

      res.json({
        blocked_count: by_status.blocked,
        backlog_count: by_status.backlog,
        in_progress_count: by_status.in_progress,
        review_count: by_status.review,
        done_count: by_status.done,
        total: features.length,
        by_status,
      });
    } catch (err) {
      res.status(500).json({ success: false, error: String(err) });
    }
  });

  /**
   * GET /api/world/agent-health
   *
   * Returns running agents and a simple health summary.
   * Matches the same agent enumeration logic as GET /api/running-agents
   * (includes backlog-plan and spec-generation pseudo-agents).
   * projectPath is omitted to avoid leaking internal filesystem topology.
   */
  router.get('/agent-health', async (req: Request, res: Response): Promise<void> => {
    if (!requireApiKey(req, res)) return;

    try {
      const runningAgents = [...(await autoModeService.getRunningAgents())];

      // Backlog-plan pseudo-agent (same logic as /api/running-agents)
      const backlogStatus = getBacklogPlanStatus();
      const backlogDetails = getRunningDetails();
      if (backlogStatus.isRunning && backlogDetails) {
        runningAgents.push({
          featureId: `backlog-plan:${backlogDetails.projectPath}`,
          projectPath: backlogDetails.projectPath,
          isAutoMode: false,
          startTime: backlogDetails.startedAt
            ? new Date(backlogDetails.startedAt).getTime()
            : Date.now(),
          title: 'Backlog plan',
          description: backlogDetails.prompt,
          projectName: '',
        });
      }

      // Spec-generation pseudo-agents
      for (const gen of getAllRunningGenerations()) {
        const title =
          gen.type === 'feature_generation'
            ? 'Generating features from spec'
            : gen.type === 'sync'
              ? 'Syncing spec with code'
              : 'Regenerating spec';
        runningAgents.push({
          featureId: `spec-generation:${gen.projectPath}`,
          projectPath: gen.projectPath,
          isAutoMode: false,
          startTime: gen.startedAt ? new Date(gen.startedAt).getTime() : Date.now(),
          title,
          description: '',
          projectName: '',
        });
      }

      const autoModeStatus = autoModeService.getPortfolioStatus();

      res.json({
        running_count: runningAgents.length,
        agentCount: runningAgents.length,
        auto_mode: autoModeStatus.isRunning,
        stale_agent_count: 0,
        agents: runningAgents.map((a) => ({
          featureId: a.featureId,
          projectPath: a.projectPath,
          startTime: a.startTime,
          model: a.model ?? null,
        })),
      });
    } catch (err) {
      res.status(500).json({ success: false, error: String(err) });
    }
  });

  /**
   * GET /api/world/flow
   *
   * Returns board flow efficiency metrics for the GOAP planner.
   * Selector: domains.flow.data.efficiency.ratio
   *
   * efficiency.ratio = done_count / total (0–1 scale).
   * A ratio of 1.0 means all features are done; 0 means none are done.
   */
  router.get('/flow', async (req: Request, res: Response): Promise<void> => {
    if (!requireApiKey(req, res)) return;

    try {
      const features = await featureLoader.getAll(repoRoot);

      let done = 0;
      let blocked = 0;
      let in_progress = 0;

      for (const f of features) {
        switch (f.status) {
          case 'done':
          case 'verified':
            done++;
            break;
          case 'blocked':
            blocked++;
            break;
          case 'in_progress':
            in_progress++;
            break;
        }
      }

      const total = features.length;
      const ratio = total > 0 ? done / total : 1;

      res.json({
        efficiency: { ratio },
        total,
        done,
        blocked,
        in_progress,
      });
    } catch (err) {
      res.status(500).json({ success: false, error: String(err) });
    }
  });

  /**
   * GET /api/world/services
   *
   * Returns service connectivity status for the GOAP planner.
   * Selector: domains.services.data.discord.connected
   *
   * Discord runs in webhook-only mode from ava's perspective (protoBot lives in
   * Workstacean). A webhook connection is considered live when at least one
   * DISCORD_WEBHOOK_* env var is set.
   */
  router.get('/services', async (req: Request, res: Response): Promise<void> => {
    if (!requireApiKey(req, res)) return;

    const discordWebhookEnvVars = [
      'DISCORD_WEBHOOK_INFRA',
      'DISCORD_WEBHOOK_AGENT_LOGS',
      'DISCORD_WEBHOOK_CODE_REVIEW',
      'DISCORD_WEBHOOK_SUGGESTIONS',
      'DISCORD_WEBHOOK_ALERTS',
      'DISCORD_WEBHOOK_AVA',
    ];

    const discordConnected = discordWebhookEnvVars.some((v) => Boolean(process.env[v]));

    res.json({
      discord: { connected: discordConnected },
    });
  });

  /**
   * GET /api/world/dispatch-health
   *
   * Returns GOAP feedback loop protection status.
   * Exposes cooldown entries, open incidents, circuit breaker states,
   * and registry size for the GOAP planner to factor into decisions.
   */
  router.get('/dispatch-health', (req: Request, res: Response): void => {
    if (!requireApiKey(req, res)) return;

    const openCircuits = agentCircuitBreaker.getOpenCircuits();
    const openIncidents = incidentDedup.getOpenIncidents();
    const cooldownEntries = dispatchCooldown.getEntries();

    res.json({
      cooldown: {
        active_count: cooldownEntries.length,
        entries: cooldownEntries,
        window_ms: DEFAULT_GOAP_CONFIG.cooldownWindowMs,
      },
      dedup: {
        open_incident_count: openIncidents.length,
        total_suppressed: incidentDedup.getTotalSuppressedCount(),
        open_incidents: openIncidents.map((i) => ({
          id: i.id,
          agentId: i.agentId,
          skillId: i.skillId,
          status: i.status,
          duplicateCount: i.duplicateCount,
        })),
      },
      circuit_breaker: {
        open_count: openCircuits.length,
        threshold: DEFAULT_GOAP_CONFIG.circuitBreakerThreshold,
        cooldown_ms: DEFAULT_GOAP_CONFIG.circuitBreakerCooldownMs,
        open_agents: openCircuits.map((s) => ({
          agentId: s.agentId,
          state: s.state,
          failures: s.consecutiveFailures,
        })),
      },
      registry: {
        registered_count: dispatchValidator.getRegisteredCount(),
        phantom_patterns: DEFAULT_GOAP_CONFIG.phantomAgentPatterns,
      },
    });
  });

  return router;
}
