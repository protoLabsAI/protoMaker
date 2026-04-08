/**
 * Quinn PR Review Skill — Cross-Repo Breaking Change Detection
 *
 * This skill enhances Quinn's PR review with cross-repo dependency awareness.
 * When Quinn reviews a PR, this skill detects changes to exported symbols
 * (TypeScript interfaces, REST endpoints, CLI flags) and calls the
 * flag_cross_repo_dependency MCP tool registered in Studio.
 *
 * The flag_cross_repo_dependency tool is exposed by the Automaker MCP server
 * and records the dependency in .automaker/cross-repo-deps.json, emits a
 * dependency:interface_changed bus event, and optionally auto-creates follow-up
 * features in affected repos.
 *
 * Usage in Quinn agent prompts:
 *   import { buildCrossRepoReviewPrompt } from './pr-review.js';
 */

import { detectExportedSymbols, diffSymbols } from '@protolabsai/dependency-resolver';
import { analyzeContractChanges } from '@protolabsai/dependency-resolver';
import type { ImpactSeverity } from '@protolabsai/dependency-resolver';

export interface PrReviewContext {
  /** Absolute path to the project directory */
  projectPath: string;
  /** Repository name or identifier */
  sourceRepo: string;
  /** PR ID or number */
  prId: string;
  /** Files changed in the PR, with before/after content */
  changedFiles: Array<{
    path: string;
    before: string;
    after: string;
  }>;
  /** Known repos that may consume this repo's exports */
  affectedRepos: string[];
}

export interface CrossRepoReviewResult {
  /** Whether breaking changes were detected */
  hasBreakingChanges: boolean;
  /** Overall severity */
  severity: ImpactSeverity;
  /** All changed interface/type/endpoint names */
  changedInterfaces: string[];
  /** Whether flag_cross_repo_dependency should be called */
  shouldFlag: boolean;
  /** Summary message for the PR review comment */
  summary: string;
}

/**
 * Analyze a PR's changed files for cross-repo breaking changes.
 *
 * This is the core detection logic called by Quinn during PR review.
 * When breaking changes are detected, Quinn should call the
 * `flag_cross_repo_dependency` MCP tool with the returned data.
 *
 * @param context - PR review context with changed file contents
 * @returns Detection result with flag recommendation
 */
export function analyzePrForCrossRepoImpact(context: PrReviewContext): CrossRepoReviewResult {
  const allChangedInterfaces: string[] = [];
  let maxSeverityRank = 0;
  const severityRank = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4, UNKNOWN: 0 };
  const rankToSeverity = ['UNKNOWN', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

  for (const file of context.changedFiles) {
    // Only analyze TypeScript/JavaScript files
    if (
      !file.path.endsWith('.ts') &&
      !file.path.endsWith('.tsx') &&
      !file.path.endsWith('.js') &&
      !file.path.endsWith('.mjs')
    ) {
      continue;
    }

    const beforeSymbols = detectExportedSymbols(file.before);
    const afterSymbols = detectExportedSymbols(file.after);
    const diff = diffSymbols(beforeSymbols, afterSymbols);

    // Only care about changes, not additions
    if (diff.removed.length === 0 && diff.modified.length === 0) {
      continue;
    }

    const analysis = analyzeContractChanges(diff, beforeSymbols, afterSymbols);

    if (analysis.hasBreakingChanges) {
      allChangedInterfaces.push(...analysis.changedInterfaces);
      const rank = severityRank[analysis.overallSeverity] ?? 0;
      if (rank > maxSeverityRank) {
        maxSeverityRank = rank;
      }
    }
  }

  const overallSeverity: ImpactSeverity = rankToSeverity[maxSeverityRank] ?? 'UNKNOWN';
  const hasBreakingChanges = allChangedInterfaces.length > 0;
  const shouldFlag = hasBreakingChanges && context.affectedRepos.length > 0;

  let summary: string;
  if (!hasBreakingChanges) {
    summary = 'No cross-repo breaking changes detected in this PR.';
  } else {
    summary =
      `Cross-repo breaking changes detected (severity: ${overallSeverity}). ` +
      `Changed interfaces: ${allChangedInterfaces.slice(0, 5).join(', ')}` +
      (allChangedInterfaces.length > 5 ? ` and ${allChangedInterfaces.length - 5} more` : '') +
      `. Affected repos: ${context.affectedRepos.join(', ')}.`;
  }

  return {
    hasBreakingChanges,
    severity: overallSeverity,
    changedInterfaces: allChangedInterfaces,
    shouldFlag,
    summary,
  };
}

/**
 * Build the cross-repo awareness section of Quinn's PR review prompt.
 *
 * Instructs Quinn to:
 * 1. Detect exported TypeScript symbol changes (interface, type, class, function signature)
 * 2. Detect REST endpoint path/method/schema changes
 * 3. Detect CLI flag additions/removals
 * 4. Call flag_cross_repo_dependency when changes are detected
 *
 * The `flag_cross_repo_dependency` MCP tool is registered in Studio (Automaker MCP server).
 * Quinn must have MCP access to call it.
 *
 * @param affectedRepos - Known downstream repos to check
 * @returns Markdown string to include in the review prompt
 */
export function buildCrossRepoReviewPrompt(affectedRepos: string[]): string {
  const repoList = affectedRepos.length > 0 ? affectedRepos.join(', ') : 'unknown';

  return `
## Cross-Repo Breaking Change Detection

Review this PR for changes that may break downstream consumers. Check for:

1. **Exported TypeScript symbols** — interfaces, types, classes, or function signatures that
   changed, were removed, or had their parameters/return types modified.

2. **REST endpoint changes** — HTTP method, path, required parameters, or response schema
   changed or removed.

3. **CLI flag changes** — new required flags, removed flags, or renamed flags.

When you detect any of the above, you MUST call the \`flag_cross_repo_dependency\` MCP tool:

\`\`\`
flag_cross_repo_dependency({
  projectPath: "<current project path>",
  sourceRepo: "<this repo name>",
  mergedPrId: "<PR number>",
  changedInterfaces: ["<interface1>", "<endpoint>", ...],
  affectedRepos: [${affectedRepos.map((r) => `"${r}"`).join(', ')}],
  severity: "HIGH" | "MEDIUM" | "LOW" | "CRITICAL" | "UNKNOWN",
  autoCreateFollowUp: true
})
\`\`\`

Known downstream consumers: **${repoList}**

If you cannot determine whether a change is breaking (ambiguous code), set severity to "UNKNOWN"
and call flag_cross_repo_dependency with conservative assumptions (treat as potentially breaking).
This allows human review to make the final call.
`.trim();
}
