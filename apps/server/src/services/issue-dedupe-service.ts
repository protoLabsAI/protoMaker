/**
 * IssueDedupeService — deduplicate automation-filed features against open issues.
 *
 * Before the triage/intake automation opens a new feature, check against OPEN
 * features using title similarity (Jaccard word-set overlap) and fingerprint
 * matching. If a matching open feature exists, return it so the caller can
 * skip filing or comment on it instead of creating a duplicate.
 *
 * Also enforces a cooldown: if a feature for the same root cause was recently
 * closed (done/interrupted), suppress re-filing for COOLDOWN_MS to prevent
 * closed-as-done features from being immediately recreated.
 */

import { createLogger } from '@protolabsai/utils';
import type { Feature } from '@protolabsai/types';
import type { FeatureLoader } from './feature-loader.js';

const logger = createLogger('IssueDedupeService');

/** Minimum Jaccard similarity for title-based match (0.0 – 1.0) */
const TITLE_SIMILARITY_THRESHOLD = 0.5;

/** Cooldown period after a feature reaches done/interrupted before the same
 *  root cause can be re-filed. Prevents immediate recreation of closed issues. */
const COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

/** How long to cache the open-features list (avoids repeated disk reads) */
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/** Statuses considered "open" for dedup purposes */
const OPEN_STATUSES = new Set([
  'backlog',
  'in_progress',
  'blocked',
  'review',
  'done_pending_merge',
  'done_pr_open',
]);

/** Statuses considered "closed" for cooldown purposes */
const CLOSED_STATUSES = new Set(['done', 'interrupted']);

/** Title prefixes/patterns that mark a feature as automation-filed (self-improvement, triage, etc.) */
const AUTOMATION_TITLE_PATTERNS = [
  /^\[Auto\]/i,
  /^\[Triage\]/i,
  /^\[TRIAGED\]/i,
  /^System\s+Improvement:/i,
  /^auto-remediate:/i,
];

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Result when a duplicate is found */
export interface DedupeMatch {
  /** The existing feature that matches */
  feature: Feature;
  /** How the match was determined */
  reason: 'title_similarity' | 'fingerprint' | 'source_id';
  /** Similarity score (0.0 – 1.0) for title matches */
  similarity?: number;
}

/** Result when no duplicate is found */
export interface DedupeNoMatch {
  /** Whether the feature was suppressed due to cooldown */
  cooldown?: boolean;
  /** The recently closed feature that triggered cooldown */
  closedFeature?: Feature;
}

export type DedupeResult =
  | { isDuplicate: true; match: DedupeMatch }
  | { isDuplicate: false; noMatch?: DedupeNoMatch };

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class IssueDedupeService {
  /** Cached open features per projectPath */
  private cache = new Map<string, { features: Feature[]; timestamp: number }>();

  /** Recently closed features per projectPath (for cooldown) */
  private closedCache = new Map<string, { features: Feature[]; timestamp: number }>();

  constructor(private featureLoader: FeatureLoader) {}

  /**
   * Check if filing a feature with the given title would be a duplicate.
   *
   * @param projectPath - Project to check against
   * @param title - Title of the feature about to be filed
   * @param fingerprint - Optional fingerprint (e.g. pattern signature) for exact matching
   * @param sourceId - Optional source ID (e.g. GitHub issue number) for exact matching
   * @returns DedupeResult indicating whether a match was found
   */
  async check(
    projectPath: string,
    title: string,
    fingerprint?: string,
    sourceId?: string
  ): Promise<DedupeResult> {
    const allFeatures = await this.fetchFeatures(projectPath);
    const openFeatures = allFeatures.filter((f) => f.status && OPEN_STATUSES.has(f.status));
    const closedFeatures = allFeatures.filter((f) => f.status && CLOSED_STATUSES.has(f.status));

    // 1. Fingerprint match (exact) — highest confidence
    if (fingerprint && openFeatures.length > 0) {
      const fpMatch = this.findFingerprintMatch(openFeatures, fingerprint);
      if (fpMatch) {
        logger.info(
          `Dedupe: fingerprint match for "${title}" → ${fpMatch.id} ("${fpMatch.title}")`
        );
        return { isDuplicate: true, match: { feature: fpMatch, reason: 'fingerprint' } };
      }
    }

    // 2. Source ID match (exact) — e.g. same GitHub issue number
    if (sourceId && openFeatures.length > 0) {
      const srcMatch = this.findSourceIdMatch(openFeatures, sourceId);
      if (srcMatch) {
        logger.info(
          `Dedupe: source_id match for "${title}" → ${srcMatch.id} ("${srcMatch.title}")`
        );
        return { isDuplicate: true, match: { feature: srcMatch, reason: 'source_id' } };
      }
    }

    // 3. Title similarity (Jaccard word-set overlap)
    if (openFeatures.length > 0) {
      const simMatch = this.findTitleSimilarityMatch(openFeatures, title);
      if (simMatch) {
        logger.info(
          `Dedupe: title similarity match for "${title}" → ${simMatch.feature.id} ` +
            `("${simMatch.feature.title}") score=${(simMatch.similarity ?? 0).toFixed(2)}`
        );
        return { isDuplicate: true, match: simMatch };
      }
    }

    // 4. Cooldown check — was a similar feature recently closed?
    if (closedFeatures.length > 0) {
      const cooldown = this.checkCooldown(closedFeatures, title);
      if (cooldown) {
        logger.info(
          `Dedupe: cooldown active for "${title}" → ${cooldown.closedFeature.id} ` +
            `("${cooldown.closedFeature.title}")`
        );
        return {
          isDuplicate: false,
          noMatch: { cooldown: true, closedFeature: cooldown.closedFeature },
        };
      }
    }

    return { isDuplicate: false };
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private async fetchFeatures(projectPath: string): Promise<Feature[]> {
    // Check cache
    const cached = this.cache.get(projectPath);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.features;
    }

    try {
      const features = await this.featureLoader.getAll(projectPath);
      this.cache.set(projectPath, { features, timestamp: Date.now() });
      return features;
    } catch (err) {
      logger.warn(`Failed to fetch features for dedup (project=${projectPath}):`, err);
      // Return cached if available, otherwise empty
      return cached?.features ?? [];
    }
  }

  /**
   * Find an open feature with a matching fingerprint.
   * Fingerprint is encoded in the title as `fp:{fingerprint}` or in the description.
   */
  private findFingerprintMatch(features: Feature[], fingerprint: string): Feature | null {
    const fpTag = `fp:${fingerprint}`;
    for (const feature of features) {
      // The fingerprint marker `fp:{fingerprint}` is embedded in the filed
      // feature's description (and may also appear in the title).
      if (feature.title?.includes(fpTag)) {
        return feature;
      }
      if (feature.description?.includes(fpTag)) {
        return feature;
      }
    }
    return null;
  }

  /**
   * Find an open feature with a matching source ID.
   * Source ID is stored as githubIssueNumber or in channelContext.
   */
  private findSourceIdMatch(features: Feature[], sourceId: string): Feature | null {
    const numId = Number(sourceId);
    for (const feature of features) {
      if (feature.githubIssueNumber === numId) {
        return feature;
      }
    }
    return null;
  }

  /**
   * Find an open feature with title similarity above the threshold.
   * Uses Jaccard word-set similarity. Only matches against automation-filed
   * features (those with automation title patterns) to avoid false positives with user
   * features that happen to share words.
   */
  private findTitleSimilarityMatch(features: Feature[], title: string): DedupeMatch | null {
    const incomingWords = titleToWordSet(title);
    let bestMatch: DedupeMatch | null = null;
    let bestScore = 0;

    for (const feature of features) {
      // Only match against automation-filed features to avoid false positives
      const isAutomationFiled = isAutomationFiledFeature(feature);

      if (!isAutomationFiled) {
        continue;
      }

      const existingWords = titleToWordSet(feature.title ?? '');
      const similarity = jaccardSimilarity(incomingWords, existingWords);

      if (similarity > bestScore && similarity >= TITLE_SIMILARITY_THRESHOLD) {
        bestScore = similarity;
        bestMatch = { feature, reason: 'title_similarity', similarity };
      }
    }

    return bestMatch;
  }

  /**
   * Check if a similar feature was recently closed (cooldown check).
   */
  private checkCooldown(
    closedFeatures: Feature[],
    title: string
  ): (DedupeNoMatch & { closedFeature: Feature }) | null {
    const now = Date.now();
    const incomingWords = titleToWordSet(title);

    for (const feature of closedFeatures) {
      // Check if this feature was closed within the cooldown window
      const closedAt = feature.updatedAt
        ? new Date(feature.updatedAt).getTime()
        : feature.startedAt
          ? new Date(feature.startedAt).getTime()
          : 0;

      if (closedAt && now - closedAt > COOLDOWN_MS) {
        continue; // Outside cooldown window
      }

      // Check title similarity
      const existingWords = titleToWordSet(feature.title ?? '');
      const similarity = jaccardSimilarity(incomingWords, existingWords);

      if (similarity >= TITLE_SIMILARITY_THRESHOLD) {
        return { cooldown: true, closedFeature: feature };
      }
    }

    return null;
  }

  /**
   * Invalidate the cache for a project (call after creating a new feature).
   */
  invalidateCache(projectPath: string): void {
    this.cache.delete(projectPath);
  }
}

// ---------------------------------------------------------------------------
// Pure utility functions
// ---------------------------------------------------------------------------

/**
 * Convert a title to a set of lowercase words for Jaccard similarity.
 * Strips common prefixes like "[Auto]", "System Improvement:", etc.
 */
function titleToWordSet(title: string): Set<string> {
  const STOP_WORDS = new Set([
    'the',
    'a',
    'an',
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
    'being',
    'has',
    'have',
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
    'these',
    'those',
    'it',
    'its',
    'recurring',
    'failures',
    'failure',
  ]);

  // Strip common prefixes
  let normalized = title
    .replace(/^\[Auto\]\s*/i, '')
    .replace(/^System\s+Improvement:\s*/i, '')
    .replace(/^auto-remediate:\s*/i, '')
    .replace(/^\[Triage\]\s*/i, '')
    .replace(/^\[TRIAGED\]\s*/i, '')
    .trim();

  return new Set(
    normalized
      .toLowerCase()
      .split(/[\s\-_:]+/)
      .filter((w) => w.length > 0 && !STOP_WORDS.has(w))
  );
}

/**
 * Calculate Jaccard similarity between two word sets.
 * Returns 0.0 – 1.0 (1.0 = identical).
 */
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;

  let intersection = 0;
  for (const word of a) {
    if (b.has(word)) intersection++;
  }

  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Check if a feature was filed by automation (self-improvement, triage, etc.).
 * Uses title patterns since the Feature type doesn't have a tags field.
 */
function isAutomationFiledFeature(feature: Feature): boolean {
  const title = feature.title ?? '';
  return AUTOMATION_TITLE_PATTERNS.some((pattern) => pattern.test(title));
}
