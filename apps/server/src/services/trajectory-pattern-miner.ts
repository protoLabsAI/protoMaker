/**
 * Trajectory Pattern Miner
 *
 * Mines execution trajectories to identify patterns across 4 dimensions:
 * 1. Domains with high failure rates (>50% retry)
 * 2. Models that succeed more for specific complexities
 * 3. Common escalation reasons
 * 4. Features needing more turns than allocated
 *
 * Patterns above confidence threshold (0.5) and minimum sample size (3)
 * are written to .automaker/context/learned-patterns.md, which is
 * auto-loaded into agent prompts via loadContextFiles().
 *
 * Confidence decays 50% for patterns not reinforced in 90 days.
 * Patterns below 0.2 confidence are pruned.
 */

import path from 'node:path';
import { writeFile, mkdir, readdir, readFile } from 'node:fs/promises';

import { createLogger } from '@protolabsai/utils';
import type { VerifiedTrajectory } from '@protolabsai/types';

const logger = createLogger('TrajectoryPatternMiner');

export const CONFIDENCE_THRESHOLD = 0.5;
export const MIN_SAMPLE_SIZE = 3;
export const PRUNE_THRESHOLD = 0.2;
export const DECAY_DAYS = 90;
export const DECAY_FACTOR = 0.5;
/** Duration in ms above which a run is considered over-budget */
export const LONG_RUN_MS = 60 * 60 * 1000; // 60 minutes

export type PatternType =
  | 'high-failure-domain'
  | 'model-complexity-success'
  | 'escalation-reason'
  | 'turn-budget';

export interface MiningPattern {
  type: PatternType;
  description: string;
  confidence: number;
  sampleSize: number;
  /** ISO timestamp of most recent trajectory supporting this pattern */
  lastSeenAt: string;
  details: Record<string, unknown>;
}

export class TrajectoryPatternMiner {
  /**
   * Mine all trajectories from the project, apply decay, prune low-confidence
   * patterns, and write publishable patterns to the context file.
   *
   * Returns all surviving patterns (after pruning).
   */
  async mine(projectPath: string): Promise<MiningPattern[]> {
    const allTrajectories = await this.loadAllTrajectories(projectPath);

    if (allTrajectories.length === 0) {
      logger.info('[PatternMiner] No trajectories found, skipping mining');
      await this.writePatternsToContextFile(projectPath, []);
      return [];
    }

    logger.info(`[PatternMiner] Mining ${allTrajectories.length} trajectories`);

    const rawPatterns: MiningPattern[] = [
      ...this.mineHighFailureDomains(allTrajectories),
      ...this.mineModelComplexitySuccess(allTrajectories),
      ...this.mineEscalationReasons(allTrajectories),
      ...this.mineTurnBudgetIssues(allTrajectories),
    ];

    // Apply 90-day confidence decay
    const decayedPatterns = rawPatterns.map((p) => this.applyDecay(p));

    // Prune patterns below minimum threshold
    const survivingPatterns = decayedPatterns.filter((p) => p.confidence >= PRUNE_THRESHOLD);

    // Publish only high-confidence patterns with sufficient sample size
    const publishable = survivingPatterns.filter(
      (p) => p.confidence > CONFIDENCE_THRESHOLD && p.sampleSize >= MIN_SAMPLE_SIZE
    );

    await this.writePatternsToContextFile(projectPath, publishable);

    logger.info(
      `[PatternMiner] Found ${rawPatterns.length} raw patterns, ${survivingPatterns.length} surviving after pruning, ${publishable.length} published`
    );

    return survivingPatterns;
  }

  /**
   * Load all trajectory attempt files from .automaker/trajectory/{featureId}/attempt-*.json
   */
  async loadAllTrajectories(projectPath: string): Promise<VerifiedTrajectory[]> {
    const trajectoryRoot = path.join(projectPath, '.automaker', 'trajectory');

    let featureDirs: string[] = [];
    try {
      featureDirs = await readdir(trajectoryRoot);
    } catch {
      return [];
    }

    const all: VerifiedTrajectory[] = [];
    for (const featureId of featureDirs) {
      const featureDir = path.join(trajectoryRoot, featureId);
      try {
        const files = await readdir(featureDir);
        const attemptFiles = files
          .filter((f) => f.startsWith('attempt-') && f.endsWith('.json'))
          .sort();

        for (const file of attemptFiles) {
          try {
            const raw = await readFile(path.join(featureDir, file), 'utf-8');
            all.push(JSON.parse(raw) as VerifiedTrajectory);
          } catch {
            // Skip malformed files
          }
        }
      } catch {
        // Skip unreadable directories
      }
    }

    return all;
  }

  /**
   * Pattern 1: Domains with high failure rates (>50% have retryCount > 0).
   */
  mineHighFailureDomains(trajectories: VerifiedTrajectory[]): MiningPattern[] {
    const stats = new Map<string, { total: number; withRetries: number; lastSeen: string }>();

    for (const t of trajectories) {
      const key = t.domain;
      const existing = stats.get(key) ?? { total: 0, withRetries: 0, lastSeen: t.timestamp };
      existing.total++;
      if (t.retryCount > 0) existing.withRetries++;
      if (t.timestamp > existing.lastSeen) existing.lastSeen = t.timestamp;
      stats.set(key, existing);
    }

    const patterns: MiningPattern[] = [];
    for (const [domain, s] of stats) {
      const failureRate = s.withRetries / s.total;
      if (failureRate > 0.5) {
        patterns.push({
          type: 'high-failure-domain',
          description: `Domain "${domain}" has a high retry rate (${Math.round(failureRate * 100)}% of features needed retries)`,
          confidence: this.computeConfidence(s.total, failureRate),
          sampleSize: s.total,
          lastSeenAt: s.lastSeen,
          details: { domain, failureRate, total: s.total, withRetries: s.withRetries },
        });
      }
    }
    return patterns;
  }

  /**
   * Pattern 2: Models that succeed (first attempt, verified) for specific complexities.
   * Only reports combinations with successRate >= 0.8.
   */
  mineModelComplexitySuccess(trajectories: VerifiedTrajectory[]): MiningPattern[] {
    const stats = new Map<string, { total: number; succeeded: number; lastSeen: string }>();

    for (const t of trajectories) {
      const key = `${t.model}::${t.complexity}`;
      const existing = stats.get(key) ?? { total: 0, succeeded: 0, lastSeen: t.timestamp };
      existing.total++;
      if (t.verified && t.retryCount === 0) existing.succeeded++;
      if (t.timestamp > existing.lastSeen) existing.lastSeen = t.timestamp;
      stats.set(key, existing);
    }

    const patterns: MiningPattern[] = [];
    for (const [key, s] of stats) {
      const [model, complexity] = key.split('::');
      const successRate = s.succeeded / s.total;
      if (successRate >= 0.8) {
        patterns.push({
          type: 'model-complexity-success',
          description: `Model "${model}" has high first-attempt success rate (${Math.round(successRate * 100)}%) for "${complexity}" complexity features`,
          confidence: this.computeConfidence(s.total, successRate),
          sampleSize: s.total,
          lastSeenAt: s.lastSeen,
          details: { model, complexity, successRate, total: s.total, succeeded: s.succeeded },
        });
      }
    }
    return patterns;
  }

  /**
   * Pattern 3: Common escalation reasons (normalized to first 100 chars).
   */
  mineEscalationReasons(trajectories: VerifiedTrajectory[]): MiningPattern[] {
    const reasonStats = new Map<string, { count: number; lastSeen: string }>();

    for (const t of trajectories) {
      if (!t.escalationReason) continue;
      const normalized = t.escalationReason.slice(0, 100).toLowerCase().trim();
      if (!normalized) continue;
      const existing = reasonStats.get(normalized) ?? { count: 0, lastSeen: t.timestamp };
      existing.count++;
      if (t.timestamp > existing.lastSeen) existing.lastSeen = t.timestamp;
      reasonStats.set(normalized, existing);
    }

    const totalEscalated = trajectories.filter((t) => t.escalationReason).length;
    const patterns: MiningPattern[] = [];

    for (const [reason, s] of reasonStats) {
      if (s.count < MIN_SAMPLE_SIZE) continue;
      const frequency = s.count / Math.max(totalEscalated, 1);
      patterns.push({
        type: 'escalation-reason',
        description: `Common escalation pattern: "${reason}" (occurred ${s.count} times)`,
        confidence: this.computeConfidence(s.count, frequency),
        sampleSize: s.count,
        lastSeenAt: s.lastSeen,
        details: { reason, count: s.count, frequency },
      });
    }
    return patterns;
  }

  /**
   * Pattern 4: Features needing more turns than allocated (domain-level analysis).
   * Flags domains where >50% of executions exceeded 60 minutes.
   */
  mineTurnBudgetIssues(trajectories: VerifiedTrajectory[]): MiningPattern[] {
    const stats = new Map<string, { total: number; longRun: number; lastSeen: string }>();

    for (const t of trajectories) {
      const key = t.domain;
      const existing = stats.get(key) ?? { total: 0, longRun: 0, lastSeen: t.timestamp };
      existing.total++;
      if (t.durationMs > LONG_RUN_MS) existing.longRun++;
      if (t.timestamp > existing.lastSeen) existing.lastSeen = t.timestamp;
      stats.set(key, existing);
    }

    const patterns: MiningPattern[] = [];
    for (const [domain, s] of stats) {
      const longRunRate = s.longRun / s.total;
      if (longRunRate > 0.5) {
        patterns.push({
          type: 'turn-budget',
          description: `Domain "${domain}" frequently exceeds time budget (${Math.round(longRunRate * 100)}% run >60 min)`,
          confidence: this.computeConfidence(s.total, longRunRate),
          sampleSize: s.total,
          lastSeenAt: s.lastSeen,
          details: { domain, longRunRate, total: s.total, longRun: s.longRun },
        });
      }
    }
    return patterns;
  }

  /**
   * Compute confidence score (0-1) based on sample size and signal strength.
   * Confidence scales linearly with sample size up to 20 observations.
   */
  computeConfidence(sampleSize: number, signalStrength: number): number {
    const sampleFactor = Math.min(1, sampleSize / 20);
    return sampleFactor * signalStrength;
  }

  /**
   * Apply 90-day confidence decay to a pattern.
   * If the most recent supporting trajectory is >90 days old, halve confidence.
   */
  applyDecay(pattern: MiningPattern): MiningPattern {
    const lastSeen = new Date(pattern.lastSeenAt).getTime();
    const ageDays = (Date.now() - lastSeen) / (1000 * 60 * 60 * 24);

    if (ageDays > DECAY_DAYS) {
      return { ...pattern, confidence: pattern.confidence * DECAY_FACTOR };
    }
    return pattern;
  }

  /**
   * Write publishable patterns to .automaker/context/learned-patterns.md
   * File is always regenerated on each run.
   */
  async writePatternsToContextFile(
    projectPath: string,
    patterns: MiningPattern[]
  ): Promise<void> {
    const contextDir = path.join(projectPath, '.automaker', 'context');
    const outputPath = path.join(contextDir, 'learned-patterns.md');

    await mkdir(contextDir, { recursive: true });

    const now = new Date().toISOString();

    if (patterns.length === 0) {
      const content = [
        '# Learned Patterns',
        '',
        `_Last updated: ${now}_`,
        '',
        'No patterns with sufficient confidence yet.',
        '',
      ].join('\n');
      await writeFile(outputPath, content, 'utf-8');
      return;
    }

    const lines: string[] = [
      '# Learned Patterns',
      '',
      `_Last updated: ${now} | ${patterns.length} active pattern(s)_`,
      '',
      '> These patterns were automatically mined from execution trajectories.',
      '> High-confidence patterns inform agent decision-making.',
      '',
    ];

    const byType = new Map<string, MiningPattern[]>();
    for (const p of patterns) {
      const group = byType.get(p.type) ?? [];
      group.push(p);
      byType.set(p.type, group);
    }

    const typeLabels: Record<string, string> = {
      'high-failure-domain': 'High-Failure Domains',
      'model-complexity-success': 'Model-Complexity Success',
      'escalation-reason': 'Common Escalation Reasons',
      'turn-budget': 'Turn Budget Issues',
    };

    for (const [type, group] of byType) {
      lines.push(`## ${typeLabels[type] ?? type}`);
      lines.push('');
      for (const p of group.sort((a, b) => b.confidence - a.confidence)) {
        const confidencePct = Math.round(p.confidence * 100);
        lines.push(
          `- **${p.description}** _(confidence: ${confidencePct}%, n=${p.sampleSize})_`
        );
      }
      lines.push('');
    }

    await writeFile(outputPath, lines.join('\n'), 'utf-8');
    logger.info(`[PatternMiner] Wrote ${patterns.length} pattern(s) to ${outputPath}`);
  }
}
