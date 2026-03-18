/**
 * Trajectory Query Service
 *
 * Finds relevant past execution trajectories for a given feature using
 * multi-signal similarity matching:
 *   1. Domain exact match (+2 points)
 *   2. Complexity exact match (+1 point)
 *   3. filesToModify Jaccard similarity (configurable threshold, default 0.3)
 *   4. Title/description keyword overlap (+1 point per matching keyword)
 *
 * Returns up to `topK` (default: 3) most relevant trajectories with
 * structured success/failure learnings.
 */

import path from 'node:path';
import { createLogger } from '@protolabsai/utils';
import type { VerifiedTrajectory, TrajectoryDomain } from '@protolabsai/types';

const logger = createLogger('TrajectoryQueryService');

/** Stop words excluded from keyword overlap scoring */
const STOP_WORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'but',
  'in',
  'on',
  'at',
  'to',
  'for',
  'of',
  'with',
  'by',
  'from',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'shall',
  'can',
  'this',
  'that',
  'it',
  'its',
  'add',
  'new',
  'get',
  'set',
  'use',
  'make',
  'create',
  'update',
  'fix',
]);

/** Input query parameters for trajectory similarity search */
export interface TrajectoryQueryInput {
  /** Absolute path to the project root */
  projectPath: string;
  /** Domain classification of the querying feature */
  domain?: TrajectoryDomain;
  /** Complexity tier of the querying feature */
  complexity?: 'small' | 'medium' | 'large' | 'architectural';
  /** Files the querying feature plans to modify (for Jaccard similarity) */
  filesToModify?: string[];
  /** Feature title tokens (for keyword overlap) */
  title?: string;
  /** Feature description tokens (for keyword overlap) */
  description?: string;
  /** Minimum Jaccard similarity threshold for filesToModify scoring (default: 0.3) */
  jaccardThreshold?: number;
}

/** A single trajectory result returned by the query */
export interface TrajectoryQueryResult {
  /** Feature ID the trajectory belongs to */
  featureId: string;
  /** Human-readable title of the historical feature */
  featureTitle: string;
  /** Complexity tier */
  complexity: 'small' | 'medium' | 'large' | 'architectural';
  /** Model used during this execution */
  model: string;
  /** Total number of recorded attempts */
  attemptCount: number;
  /** Summary of what succeeded (from the best verified attempt) */
  executionSummary: string;
  /** Reason for escalation or failure, if any */
  escalationReason?: string;
  /** Computed similarity score used for ranking */
  similarityScore: number;
}

/** Minimal feature metadata loaded from feature.json for similarity matching */
interface FeatureMeta {
  title: string;
  description?: string;
  filesToModify?: string[];
  domain?: TrajectoryDomain;
  complexity?: 'small' | 'medium' | 'large' | 'architectural';
}

/**
 * Computes Jaccard similarity between two sets represented as string arrays.
 * Returns a value in [0, 1].
 */
function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

/**
 * Tokenizes a string into lowercase, non-stop-word tokens of length >= 3.
 */
function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[\s\-_/.,:;!?()[\]{}'"<>]+/)
      .filter((t) => t.length >= 3 && !STOP_WORDS.has(t))
  );
}

/**
 * Counts the number of overlapping tokens between two token sets.
 */
function keywordOverlap(queryTokens: Set<string>, candidateTokens: Set<string>): number {
  let count = 0;
  for (const token of queryTokens) {
    if (candidateTokens.has(token)) count++;
  }
  return count;
}

/**
 * Service for querying past trajectory data by similarity.
 */
export class TrajectoryQueryService {
  /**
   * Find the top K most similar trajectories to the given query.
   * Returns an empty array if no trajectories exist or on error.
   */
  async findSimilar(input: TrajectoryQueryInput, topK = 3): Promise<TrajectoryQueryResult[]> {
    const { projectPath, jaccardThreshold = 0.3 } = input;

    const trajectoryRoot = path.join(projectPath, '.automaker', 'trajectory');
    const featuresRoot = path.join(projectPath, '.automaker', 'features');

    let featureIds: string[];
    try {
      const fs = await import('node:fs/promises');
      const entries = await fs.readdir(trajectoryRoot, { withFileTypes: true }).catch(() => []);
      featureIds = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    } catch {
      logger.debug('[TrajectoryQuery] No trajectory directory found, returning empty results');
      return [];
    }

    if (featureIds.length === 0) return [];

    // Build query token set once (from title + description)
    const queryText = [input.title ?? '', input.description ?? ''].join(' ');
    const queryTokens = tokenize(queryText);

    const results: TrajectoryQueryResult[] = [];

    const fs = await import('node:fs/promises');

    for (const featureId of featureIds) {
      try {
        // Load all attempt files for this feature
        const featureTrajectoryDir = path.join(trajectoryRoot, featureId);
        const attemptFiles = await fs
          .readdir(featureTrajectoryDir)
          .then((entries) =>
            entries.filter((f) => f.startsWith('attempt-') && f.endsWith('.json')).sort()
          )
          .catch(() => [] as string[]);

        if (attemptFiles.length === 0) continue;

        const trajectories: VerifiedTrajectory[] = [];
        for (const file of attemptFiles) {
          try {
            const raw = await fs.readFile(path.join(featureTrajectoryDir, file), 'utf-8');
            trajectories.push(JSON.parse(raw) as VerifiedTrajectory);
          } catch {
            // skip malformed trajectory files
          }
        }

        if (trajectories.length === 0) continue;

        // Load feature metadata for title, filesToModify, domain, complexity
        let meta: FeatureMeta = { title: featureId };
        try {
          const featureJsonPath = path.join(featuresRoot, featureId, 'feature.json');
          const raw = await fs.readFile(featureJsonPath, 'utf-8');
          const parsed = JSON.parse(raw) as Partial<FeatureMeta> & { id?: string };
          meta = {
            title: (parsed.title as string | undefined) ?? featureId,
            description: parsed.description,
            filesToModify: parsed.filesToModify,
            domain: parsed.domain as TrajectoryDomain | undefined,
            complexity: parsed.complexity,
          };
        } catch {
          // feature.json unavailable — use trajectory data for domain/complexity
        }

        // Use trajectory-level domain/complexity as fallback
        const latestTrajectory = trajectories[trajectories.length - 1];
        const candidateDomain = meta.domain ?? latestTrajectory.domain;
        const candidateComplexity = meta.complexity ?? latestTrajectory.complexity;

        // --- Scoring ---
        let score = 0;

        // 1. Domain exact match
        if (input.domain && candidateDomain === input.domain) {
          score += 2;
        }

        // 2. Complexity exact match
        if (input.complexity && candidateComplexity === input.complexity) {
          score += 1;
        }

        // 3. filesToModify Jaccard similarity
        const queryFiles = input.filesToModify ?? [];
        const candidateFiles = meta.filesToModify ?? [];
        if (queryFiles.length > 0 && candidateFiles.length > 0) {
          const jaccard = jaccardSimilarity(queryFiles, candidateFiles);
          if (jaccard >= jaccardThreshold) {
            score += 2 * jaccard;
          }
        }

        // 4. Title/description keyword overlap
        if (queryTokens.size > 0) {
          const candidateText = [meta.title, meta.description ?? ''].join(' ');
          const candidateTokens = tokenize(candidateText);
          score += keywordOverlap(queryTokens, candidateTokens);
        }

        // Skip trajectories with zero similarity when at least one signal was provided
        const hasQuery =
          input.domain !== undefined ||
          input.complexity !== undefined ||
          (input.filesToModify?.length ?? 0) > 0 ||
          queryTokens.size > 0;

        if (hasQuery && score === 0) continue;

        // Select representative trajectory: prefer verified, fall back to latest
        const verified = trajectories.find((t) => t.verified);
        const representative = verified ?? latestTrajectory;

        // Collect escalation reason from any failed attempt
        const escalationReason = trajectories
          .slice()
          .reverse()
          .find((t) => t.escalationReason)?.escalationReason;

        results.push({
          featureId,
          featureTitle: meta.title,
          complexity: candidateComplexity,
          model: representative.model,
          attemptCount: trajectories.length,
          executionSummary: representative.executionSummary,
          escalationReason,
          similarityScore: score,
        });
      } catch (err) {
        logger.warn(`[TrajectoryQuery] Failed to process feature ${featureId}:`, err);
      }
    }

    // Sort by score descending, return top K
    results.sort((a, b) => b.similarityScore - a.similarityScore);
    return results.slice(0, topK);
  }
}
