/**
 * PR Ownership Utilities
 *
 * Provides functions for stamping and parsing ownership watermarks in PR bodies,
 * enabling multi-instance coordination by preventing simultaneous PR nudging
 * from multiple Automaker instances (e.g., ava-staging, developer local, CI bot).
 *
 * The watermark is an HTML comment invisible in rendered GitHub markdown but
 * parseable by any Automaker instance that reads the raw PR body.
 *
 * Watermark format (inside HTML comment):
 *   automaker:owner instance=<instanceId> team=<teamId> created=<ISO8601>
 */

/** Parsed ownership data from a PR body watermark */
export interface PROwnership {
  /** Instance ID of the Automaker that created the PR, or null if not watermarked */
  instanceId: string | null;
  /** Team ID of the creating instance, or null if not present */
  teamId: string | null;
  /** ISO 8601 timestamp when the PR was created by Automaker, or null if not present */
  createdAt: string | null;
}

const WATERMARK_PREFIX = 'automaker:owner';
const WATERMARK_COMMENT_RE =
  /<!--\s*automaker:owner\s+instance=(\S+)\s+team=(\S*)\s+created=(\S+)\s*-->/;

/**
 * Parse the Automaker ownership watermark from a PR body.
 *
 * Looks for a hidden HTML comment of the form:
 *   <!-- automaker:owner instance=<id> team=<team> created=<iso> -->
 *
 * @param body - Raw PR body text
 * @returns Parsed PROwnership (fields null if watermark absent or malformed)
 */
export function parsePROwnershipWatermark(body: string): PROwnership {
  if (!body) {
    return { instanceId: null, teamId: null, createdAt: null };
  }

  const match = WATERMARK_COMMENT_RE.exec(body);
  if (!match) {
    return { instanceId: null, teamId: null, createdAt: null };
  }

  return {
    instanceId: match[1] ?? null,
    teamId: match[2] ?? null,
    createdAt: match[3] ?? null,
  };
}

/**
 * Build an Automaker ownership watermark string for embedding in a PR body.
 *
 * Generates a hidden HTML comment invisible in rendered GitHub markdown.
 *
 * @param instanceId - Automaker instance ID (e.g. "ava-staging" or a UUID)
 * @param teamId - Team/org identifier (e.g. "proto-labs-ai")
 * @returns HTML comment string to append to PR body
 */
export function buildPROwnershipWatermark(instanceId: string, teamId: string): string {
  const created = new Date().toISOString();
  return `<!-- ${WATERMARK_PREFIX} instance=${instanceId} team=${teamId} created=${created} -->`;
}

/**
 * Determine whether PR ownership is stale.
 *
 * Ownership is considered stale when BOTH the last commit age and the last
 * activity age exceed the configured TTL. Requiring both conditions prevents
 * false positives from PRs that are actively being reviewed but not yet updated.
 *
 * @param lastCommitAgeHours - Hours since the most recent commit to the PR branch
 * @param lastActivityAgeHours - Hours since any PR activity (comments, reviews, updates)
 * @param staleTtlHours - Stale threshold in hours (default: 24)
 * @returns true if the PR ownership should be considered stale
 */
export function isPRStale(
  lastCommitAgeHours: number,
  lastActivityAgeHours: number,
  staleTtlHours: number
): boolean {
  return lastCommitAgeHours > staleTtlHours && lastActivityAgeHours > staleTtlHours;
}
