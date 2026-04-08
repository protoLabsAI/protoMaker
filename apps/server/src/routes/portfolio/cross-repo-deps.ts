/**
 * Cross-Repo Dependencies Route
 * GET /api/portfolio/cross-repo-deps
 *
 * Returns a graph of cross-repository dependencies across all active projects.
 * Nodes represent apps/repos; edges represent ExternalDependency entries.
 * Includes critical path analysis and circular dependency detection.
 */

import { Router, type Request, type Response } from 'express';
import { createLogger } from '@protolabsai/utils';
import type { SettingsService } from '../../services/settings-service.js';
import type { FeatureLoader } from '../../services/feature-loader.js';
import type { ExternalDependency } from '@protolabsai/types';

const logger = createLogger('PortfolioCrossRepoDeps');

interface CrossRepoNode {
  appPath: string;
  featureCount: number;
  crossRepoBlockedCount: number;
}

interface CrossRepoEdge {
  fromAppPath: string;
  fromFeatureId: string;
  toAppPath: string;
  toFeatureId: string;
  dependencyType: ExternalDependency['dependencyType'];
  status: ExternalDependency['status'];
  description: string;
}

interface CrossRepoDepsGraph {
  generatedAt: string;
  nodes: CrossRepoNode[];
  edges: CrossRepoEdge[];
  /** IDs of features blocked by unsatisfied cross-repo deps */
  blockedFeatureIds: string[];
  /** Count of features with at least one unsatisfied external dependency */
  totalCrossRepoBlocked: number;
  /** Top blocker: the foreign app/feature blocking the most features */
  topBlocker: {
    appPath: string;
    featureId: string;
    description: string;
    blockedFeatureCount: number;
  } | null;
  /** Detected circular cross-repo dependency chains */
  circularRisks: Array<{ chain: string[] }>;
}

interface CrossRepoDepsOptions {
  settingsService: SettingsService;
  featureLoader: FeatureLoader;
}

export function createCrossRepoDepsRoutes({
  settingsService,
  featureLoader,
}: CrossRepoDepsOptions): Router {
  const router = Router();

  router.get('/', async (req: Request, res: Response) => {
    try {
      let projectPaths: string[];

      if (req.query.projectPaths !== undefined) {
        const raw = req.query.projectPaths;
        if (Array.isArray(raw)) {
          projectPaths = raw.map(String).filter(Boolean);
        } else {
          projectPaths = String(raw)
            .split(',')
            .map((p) => p.trim())
            .filter(Boolean);
        }
      } else {
        const settings = await settingsService.getGlobalSettings();
        projectPaths = (settings.projects ?? []).map((p) => p.path).filter(Boolean);
      }

      const nodes: CrossRepoNode[] = [];
      const edges: CrossRepoEdge[] = [];
      const blockedFeatureIds: string[] = [];

      // Accumulate cross-repo blocker counts per (appPath, featureId) pair
      const blockerCounts = new Map<
        string,
        { appPath: string; featureId: string; description: string; count: number }
      >();

      for (const projectPath of projectPaths) {
        try {
          const allFeatures = await featureLoader.getAll(projectPath);
          let crossRepoBlocked = 0;

          for (const feature of allFeatures) {
            if (!feature.externalDependencies || feature.externalDependencies.length === 0)
              continue;

            const hasUnsatisfied = feature.externalDependencies.some(
              (d) => d.status !== 'satisfied'
            );
            if (hasUnsatisfied) {
              crossRepoBlocked++;
              blockedFeatureIds.push(feature.id);
            }

            for (const dep of feature.externalDependencies) {
              edges.push({
                fromAppPath: projectPath,
                fromFeatureId: feature.id,
                toAppPath: dep.appPath,
                toFeatureId: dep.featureId,
                dependencyType: dep.dependencyType,
                status: dep.status,
                description: dep.description,
              });

              if (dep.status !== 'satisfied') {
                const key = `${dep.appPath}::${dep.featureId}`;
                const existing = blockerCounts.get(key);
                if (existing) {
                  existing.count++;
                } else {
                  blockerCounts.set(key, {
                    appPath: dep.appPath,
                    featureId: dep.featureId,
                    description: dep.description,
                    count: 1,
                  });
                }
              }
            }
          }

          nodes.push({
            appPath: projectPath,
            featureCount: allFeatures.length,
            crossRepoBlockedCount: crossRepoBlocked,
          });
        } catch (err) {
          logger.warn(`Could not load features for ${projectPath}:`, err);
          nodes.push({ appPath: projectPath, featureCount: 0, crossRepoBlockedCount: 0 });
        }
      }

      // Find top blocker
      let topBlocker: CrossRepoDepsGraph['topBlocker'] = null;
      let maxCount = 0;
      for (const entry of blockerCounts.values()) {
        if (entry.count > maxCount) {
          maxCount = entry.count;
          topBlocker = {
            appPath: entry.appPath,
            featureId: entry.featureId,
            description: entry.description,
            blockedFeatureCount: entry.count,
          };
        }
      }

      // Simple circular risk detection: find A→B→A chains in edges
      const circularRisks: Array<{ chain: string[] }> = [];
      const edgePairs = new Set(
        edges.map((e) => `${e.fromAppPath}::${e.fromFeatureId}→${e.toAppPath}::${e.toFeatureId}`)
      );
      for (const edge of edges) {
        const reverseKey = `${edge.toAppPath}::${edge.toFeatureId}→${edge.fromAppPath}::${edge.fromFeatureId}`;
        if (edgePairs.has(reverseKey)) {
          const chain = [
            `${edge.fromAppPath}:${edge.fromFeatureId}`,
            `${edge.toAppPath}:${edge.toFeatureId}`,
            `${edge.fromAppPath}:${edge.fromFeatureId}`,
          ];
          // Dedup: only add if not already recorded
          const chainKey = [chain[0], chain[1]].sort().join('↔');
          if (!circularRisks.some((r) => [r.chain[0], r.chain[1]].sort().join('↔') === chainKey)) {
            circularRisks.push({ chain });
          }
        }
      }

      const graph: CrossRepoDepsGraph = {
        generatedAt: new Date().toISOString(),
        nodes,
        edges,
        blockedFeatureIds,
        totalCrossRepoBlocked: blockedFeatureIds.length,
        topBlocker,
        circularRisks,
      };

      res.json(graph);
    } catch (err) {
      logger.error('Cross-repo deps graph failed:', err);
      res.status(500).json({ error: 'Failed to generate cross-repo dependency graph' });
    }
  });

  return router;
}
