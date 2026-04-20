/**
 * Title matching primitives shared between the backlog reconciler (post-hoc
 * sweep against merged PRs) and FeatureLoader.create (at-create dedup against
 * recently filed features).
 *
 * - normalizeTitle: lower-case, strip conventional-commit prefix and [tag]
 *   prefix, split on non-alphanumeric, drop stopwords and short tokens.
 * - jaccardSimilarity: standard intersection-over-union on token sets.
 * - extractIssueRefs: find `#NNNN` references introduced by a resolution verb
 *   (closes, fixes, introduced in, shipped in, resolved by, …). Plain
 *   "related: #NNNN" mentions are intentionally ignored.
 */

const STOPWORDS = new Set([
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
  'was',
  'are',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'should',
  'could',
  'may',
  'might',
  'must',
  'can',
  'that',
  'this',
  'these',
  'those',
  'when',
  'where',
  'how',
  'why',
  'what',
  'which',
  'who',
  'if',
  'then',
  'else',
]);

export function normalizeTitle(raw: string): Set<string> {
  let s = raw.toLowerCase();
  s = s.replace(/^(fix|feat|chore|docs|refactor|test|perf|style|ci|build|revert)\b[^:]*:\s*/, '');
  s = s.replace(/^\[[^\]]+\]\s*/, '');
  s = s.replace(/[^a-z0-9]+/g, ' ');
  const tokens = s
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t) && !/^\d+$/.test(t));
  return new Set(tokens);
}

export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersect = 0;
  for (const token of a) if (b.has(token)) intersect++;
  const union = a.size + b.size - intersect;
  return intersect / union;
}

/**
 * Extract `#NNNN` refs that appear after a resolution verb (closes, fixes,
 * resolves, shipped in, introduced in, …). Plain mentions (`related: #N`,
 * `see #N for context`) are intentionally skipped because they describe
 * context rather than resolution.
 *
 * Filters out numbers below 100 to avoid matching against workstream indices
 * or checklist items.
 */
export function extractIssueRefs(text: string): number[] {
  if (!text) return [];
  const refs = new Set<number>();
  const patterns = [
    /\b(closes?|closed|fix(?:es|ed)?|resolv(?:es|ed)|address(?:es|ed)|ship(?:ped)?(?:\s+in)?|landed\s+in|introduced\s+in|covered\s+by)\b(?:\s+(?:by|in))?\s+(?:PR\s+)?#(\d{3,})/gi,
  ];
  for (const re of patterns) {
    for (const m of text.matchAll(re)) {
      const n = parseInt(m[2], 10);
      if (!Number.isNaN(n) && n >= 100) refs.add(n);
    }
  }
  return Array.from(refs);
}
