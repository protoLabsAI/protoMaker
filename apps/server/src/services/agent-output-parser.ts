/**
 * Agent Output Parser
 *
 * Parses structured signals from agent-generated markdown output (agent-output.md).
 * Agents produce a summary block with semantic sections:
 * - `### Needs Human Input` — human action required before the feature can proceed
 * - `### Risks/Blockers Encountered` — hard blockers (e.g. missing credentials)
 * - `### PR Status` — references to PRs (merged, open, etc.)
 *
 * This parser extracts those signals so the execution pipeline can route to
 * terminal states (`needs_human`, `done` with `doneReason`) instead of retrying.
 */

/**
 * Signal extracted from agent output indicating the desired terminal state.
 */
export type CompletionSignal = 'ready_to_pr' | 'already_done' | 'needs_human' | 'failed';

/**
 * Parsed PR reference from agent output.
 */
export interface PRReference {
  /** PR number */
  prNumber: number;
  /** Optional repo name (e.g. "protoWorkstacean"). Undefined = same repo. */
  repo?: string;
  /** Whether the PR is described as merged */
  merged?: boolean;
}

/**
 * Full parsed result from agent output.
 */
export interface AgentOutputParseResult {
  /** Signal indicating the agent's completion state */
  signal: CompletionSignal;
  /** Extracted "Needs Human Input" text, or null if absent */
  needsHumanAction: string | null;
  /** List of PR references found in the output */
  prReferences: PRReference[];
}

/**
 * Extract the text under a `### Needs Human Input` section header.
 * Returns null if the section is not present or empty.
 */
export function extractNeedsHuman(output: string): string | null {
  // Match "### Needs Human Input" followed by content until the next header or EOF
  const match = output.match(/###\s+Needs Human Input\s*\n([\s\S]*?)(?=###\s+|$)/i);
  if (!match) return null;
  const text = match[1].trim();
  return text.length > 0 ? text : null;
}

/**
 * Extract PR references from agent output.
 *
 * Looks for patterns like:
 * - "merged in #123" / "merged in protoWorkstacean PR #167"
 * - "PR #3390" / "PRs #3390-3392"
 * - "### PR Status ... PR #NNN: MERGED"
 * - "already done in #42"
 */
export function extractPRReferences(output: string): PRReference[] {
  const refs: PRReference[] = [];
  const seen = new Set<string>();

  function addRef(prNumber: number, repo?: string, merged?: boolean) {
    const repoKey = repo ?? 'same';
    const key = `${repoKey}#${prNumber}`;
    // If this PR was already seen, merge the `merged` flag
    const existing = refs.find((r) => `${r.repo ?? 'same'}#${r.prNumber}` === key);
    if (existing) {
      existing.merged = existing.merged || merged;
    } else if (!seen.has(key)) {
      seen.add(key);
      refs.push({ prNumber, repo: repo ?? undefined, merged });
    }
  }

  // Pattern 1: "merged in #NNN" or "merged in <repo> PR #NNN" or "merged in <repo> #NNN"
  // e.g. "merged in protoWorkstacean PR #167", "merged in #123"
  // Use [^#\n]+? to stay on the same line and not cross into other PR numbers
  for (const m of output.matchAll(
    /(?:merged|merge)[^#\n]+?(?:in|on)\s+(?:([\w-]+)\s+)?(?:PR\s+)?#(\d+)/gi
  )) {
    // Skip if repo capture is a common non-repo word
    const repo = m[1];
    if (repo && /^(PR|PRs|the|a|an)$/i.test(repo)) {
      addRef(parseInt(m[2], 10), undefined, true);
    } else {
      addRef(parseInt(m[2], 10), repo ?? undefined, true);
    }
  }

  // Pattern 2: "PR #NNN" or "PRs #NNN-NNN" or "PRs #NNN, #NNN"
  // e.g. "PRs #3390-3392", "PR #123"
  for (const m of output.matchAll(/PR[s]?\s+(?:#(\d+)(?:\s*[-,]\s*)?)+/gi)) {
    const full = m[0];
    const numbers = full.match(/#(\d+)/g);
    if (numbers) {
      for (const n of numbers) {
        const prNum = parseInt(n.replace('#', ''), 10);
        addRef(prNum);
      }
    }
  }

  // Pattern 3: "already done in #NNN" or "completed in <repo> PR #NNN"
  for (const m of output.matchAll(
    /(?:already\s+done|completed).+?(?:in|on)?\s+(?:([\w-]+)\s+)?(?:PR\s+)?#(\d+)/gi
  )) {
    addRef(parseInt(m[2], 10), m[1] ?? undefined, true);
  }

  // Pattern 4: "### PR Status" section — look for "PR #NNN: MERGED" or "MERGED ... #NNN"
  const prStatusMatch = output.match(/###\s+PR Status\s*\n([\s\S]*?)(?=###\s+|$)/i);
  if (prStatusMatch) {
    const section = prStatusMatch[1];
    // Match "PR #NNN: MERGED" or "#NNN: MERGED"
    for (const m of section.matchAll(/#(\d+)\s*:\s*Merged/gi)) {
      addRef(parseInt(m[1], 10), undefined, true);
    }
    // Match "MERGED ... #NNN" (MERGED before the number)
    for (const m of section.matchAll(/Merged\s+.*?#(\d+)/gi)) {
      addRef(parseInt(m[1], 10), undefined, true);
    }
  }

  return refs;
}

/**
 * Determine the completion signal from agent output.
 *
 * Priority:
 * 1. If `### Needs Human Input` present and non-empty → `needs_human`
 * 2. If merged PR references found (same repo or external) → `already_done`
 * 3. If `### Risks/Blockers Encountered` contains "HARD BLOCKER" → `failed`
 * 4. Otherwise → `ready_to_pr` (default: agent did work, proceed with PR)
 */
export function extractCompletionSignal(output: string): CompletionSignal {
  // Check for needs_human signal first
  const needsHuman = extractNeedsHuman(output);
  if (needsHuman) {
    return 'needs_human';
  }

  // Check for "already done" / "merged" signals
  const prRefs = extractPRReferences(output);
  const hasMergedRefs = prRefs.some((r) => r.merged);
  if (hasMergedRefs) {
    return 'already_done';
  }

  // Check for hard blockers
  const blockerMatch = output.match(
    /###\s+Risks\/Blockers Encountered\s*\n([\s\S]*?)(?=###\s+|$)/i
  );
  if (blockerMatch) {
    const section = blockerMatch[1];
    if (/HARD BLOCKER/i.test(section)) {
      return 'failed';
    }
  }

  return 'ready_to_pr';
}

/**
 * Parse the full agent output and return a structured result.
 * This is the main entry point for the execution pipeline.
 */
export function parseAgentOutput(output: string): AgentOutputParseResult {
  const signal = extractCompletionSignal(output);
  const needsHumanAction = extractNeedsHuman(output);
  const prReferences = extractPRReferences(output);

  return {
    signal,
    needsHumanAction,
    prReferences,
  };
}

/**
 * Build a human-readable `doneReason` from parsed PR references.
 * Returns null if there are no merged references.
 */
export function buildDoneReason(prReferences: PRReference[]): string | null {
  const merged = prReferences.filter((r) => r.merged);
  if (merged.length === 0) return null;

  // If there's an external repo reference
  const external = merged.filter((r) => r.repo);
  if (external.length > 0) {
    return `completed in ${external[0].repo} #${external[0].prNumber}`;
  }

  // Same-repo merged PR
  const numbers = merged.map((r) => `#${r.prNumber}`).join(', ');
  return `reconciled from PR ${numbers}`;
}
