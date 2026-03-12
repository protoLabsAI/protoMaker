/**
 * Sitrep Route — Single endpoint that returns a full operational status report.
 * Gathers board state, running agents, auto-mode status, open PRs, escalations,
 * and server health in parallel. Replaces 5+ sequential MCP calls with one.
 */

import { Router, type Request, type Response } from 'express';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createLogger } from '@protolabsai/utils';
import type { Feature } from '@protolabsai/types';
import type { FeatureLoader } from '../../services/feature-loader.js';
import type { AutoModeService } from '../../services/auto-mode-service.js';
import { getEscalationRouter } from '../../services/escalation-router.js';
import { open } from 'node:fs/promises';
import { getServerLogPath } from '../../lib/server-log.js';

const logger = createLogger('SitrepRoute');
const execFileAsync = promisify(execFile);

interface SitrepOptions {
  featureLoader: FeatureLoader;
  autoModeService: AutoModeService;
  repoRoot: string;
}

export function createSitrepRoutes({
  featureLoader,
  autoModeService,
  repoRoot,
}: SitrepOptions): Router {
  const router = Router();

  router.post('/', async (req: Request, res: Response) => {
    const { projectPath, projectSlug } = req.body;
    if (!projectPath) {
      res.status(400).json({ error: 'projectPath is required' });
      return;
    }

    try {
      // Gather everything in parallel for speed
      const [
        allFeatures,
        autoStatus,
        runningAgents,
        prData,
        recentCommits,
        stagingDelta,
        health,
        recentLogErrors,
      ] = await Promise.all([
        featureLoader.getAll(projectPath).catch(() => [] as Feature[]),
        getAutoModeStatus(autoModeService, projectPath),
        getRunningAgents(autoModeService),
        getOpenPRs(repoRoot),
        getRecentCommits(repoRoot),
        getStagingDelta(repoRoot),
        getServerHealth(),
        getRecentLogErrors(10),
      ]);

      // Filter by projectSlug when provided
      const features = projectSlug
        ? allFeatures.filter((f) => f.projectSlug === projectSlug)
        : allFeatures;

      // Compute board summary from features
      const board = {
        total: features.length,
        backlog: 0,
        inProgress: 0,
        review: 0,
        blocked: 0,
        done: 0,
      };
      for (const f of features) {
        const status = f.status as string;
        if (status === 'backlog') board.backlog++;
        else if (status === 'in_progress') board.inProgress++;
        else if (status === 'review') board.review++;
        else if (status === 'blocked') board.blocked++;
        else if (status === 'done' || status === 'verified') board.done++;
      }

      // Blocked features with reasons
      const blockedFeatures = features
        .filter((f) => f.status === 'blocked')
        .map((f) => ({
          id: f.id,
          title: f.title,
          reason: f.statusChangeReason || 'Unknown',
          failureCount: f.failureCount ?? 0,
        }));

      // Features in review with PR info
      const reviewFeatures = features
        .filter((f) => f.status === 'review')
        .map((f) => ({
          id: f.id,
          title: f.title,
          prNumber: f.prNumber,
          prUrl: f.prUrl,
        }));

      // Escalations: features with high failure counts or non-retryable classification
      const escalations = features
        .filter(
          (f) =>
            (f.failureCount ?? 0) >= 3 ||
            (f.failureClassification && !f.failureClassification.retryable)
        )
        .map((f) => ({
          id: f.id,
          title: f.title,
          status: f.status,
          failureCount: f.failureCount ?? 0,
          reason: f.statusChangeReason || 'Unknown',
          classification: f.failureClassification?.category,
        }));

      // Pull recent entries from the escalation router audit log
      const recentEscalations = getRecentEscalations(10);

      res.json({
        timestamp: new Date().toISOString(),
        board,
        autoMode: autoStatus,
        agents: runningAgents,
        blockedFeatures,
        reviewFeatures,
        escalations,
        recentEscalations,
        recentLogErrors,
        openPRs: prData,
        stagingDelta,
        recentCommits,
        health,
      });
    } catch (err) {
      logger.error('Sitrep failed:', err);
      res.status(500).json({ error: 'Failed to generate sitrep' });
    }
  });

  return router;
}

function getAutoModeStatus(autoModeService: AutoModeService, projectPath: string) {
  try {
    const projectStatus = autoModeService.getStatusForProject(projectPath);
    const globalStatus = autoModeService.getStatus();
    return {
      running: globalStatus.isRunning,
      loopRunning: projectStatus.isAutoLoopRunning,
      runningCount: projectStatus.runningCount,
      maxConcurrency: projectStatus.maxConcurrency,
      humanBlockedCount: projectStatus.humanBlockedCount,
    };
  } catch {
    return {
      running: false,
      loopRunning: false,
      runningCount: 0,
      maxConcurrency: 1,
      humanBlockedCount: 0,
    };
  }
}

async function getRunningAgents(autoModeService: AutoModeService) {
  try {
    const agents = await autoModeService.getRunningAgents();
    return agents.map((a) => ({
      featureId: a.featureId,
      title: a.title,
      model: a.model,
      startTime: a.startTime,
      branchName: a.branchName,
      costUsd: a.costUsd,
    }));
  } catch {
    return [];
  }
}

async function getOpenPRs(repoRoot: string) {
  try {
    const { stdout } = await execFileAsync(
      'gh',
      [
        'pr',
        'list',
        '--json',
        'number,title,headRefName,baseRefName,mergeable,state,updatedAt,statusCheckRollup',
        '--limit',
        '20',
      ],
      { cwd: repoRoot, timeout: 10000 }
    );
    const prs = JSON.parse(stdout);
    return prs.map((pr: Record<string, unknown>) => {
      const checks = pr.statusCheckRollup as Array<Record<string, string>> | undefined;
      const allPassing = checks?.every((c) => c.conclusion === 'SUCCESS') ?? false;
      const anyFailing =
        checks?.some((c) => c.conclusion === 'FAILURE' || c.conclusion === 'ERROR') ?? false;
      return {
        number: pr.number,
        title: pr.title,
        head: pr.headRefName,
        base: pr.baseRefName,
        mergeable: pr.mergeable,
        ciStatus: anyFailing ? 'failing' : allPassing ? 'passing' : 'pending',
      };
    });
  } catch {
    return [];
  }
}

async function getRecentCommits(repoRoot: string) {
  try {
    const { stdout } = await execFileAsync('git', ['log', '--oneline', '-10', '--format=%h %s'], {
      cwd: repoRoot,
      timeout: 5000,
    });
    return stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [hash, ...rest] = line.split(' ');
        return { hash, message: rest.join(' ') };
      });
  } catch {
    return [];
  }
}

async function getStagingDelta(repoRoot: string) {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['log', '--oneline', 'origin/staging..origin/dev', '--format=%h %s'],
      { cwd: repoRoot, timeout: 5000 }
    );
    const commits = stdout.trim().split('\n').filter(Boolean);
    return { commitsAhead: commits.length, commits: commits.slice(0, 5) };
  } catch {
    return { commitsAhead: 0, commits: [] };
  }
}

function getRecentEscalations(limit: number) {
  try {
    const router = getEscalationRouter();
    const entries = router.getLog(limit);
    return entries.map((entry) => {
      const ctx = entry.signal.context ?? {};
      const failureAnalysis = ctx.failureAnalysis as Record<string, unknown> | undefined;
      return {
        type: entry.signal.type,
        severity: entry.signal.severity,
        source: entry.signal.source,
        timestamp: entry.timestamp,
        deduplicated: entry.deduplicated,
        routedTo: entry.routedTo,
        context: {
          featureId: ctx.featureId as string | undefined,
          featureTitle: ctx.featureTitle as string | undefined,
          reason: (ctx.reason as string) || (ctx.message as string) || undefined,
          projectPath: ctx.projectPath as string | undefined,
          classification: failureAnalysis?.category as string | undefined,
        },
      };
    });
  } catch {
    return [];
  }
}

async function getRecentLogErrors(limit: number): Promise<string[]> {
  let fh: Awaited<ReturnType<typeof open>> | null = null;
  try {
    const logPath = getServerLogPath();
    fh = await open(logPath, 'r');
    const { size } = await fh.stat();
    const readSize = Math.min(size, 65536);
    const buffer = Buffer.alloc(readSize);
    await fh.read(buffer, 0, readSize, size - readSize);
    await fh.close();
    fh = null;
    const lines = buffer.toString('utf-8').split('\n');
    const errorLines = lines.filter((line) => line.includes('[ERROR]') || line.includes('[FATAL]'));
    return errorLines.slice(-limit);
  } catch {
    if (fh) await fh.close().catch(() => {});
    return [];
  }
}

function getServerHealth() {
  const mem = process.memoryUsage();
  return {
    uptimeSeconds: Math.floor(process.uptime()),
    heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
    heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
    rssMB: Math.round(mem.rss / 1024 / 1024),
  };
}
