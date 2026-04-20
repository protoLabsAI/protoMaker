/**
 * PR Conflict Classifier
 *
 * Analyzes merge conflicts in a pull request and classifies them into
 * one of four verdicts: redundant, rebasable, decomposable, or genuine.
 *
 * Verdicts guide the remediation action taken before retry attempts,
 * preventing wasteful update_branch retries on conflicts that cannot
 * be resolved automatically.
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { createLogger } from '@protolabsai/utils';
import { resolveModelString } from '@protolabsai/model-resolver';
import Anthropic from '@anthropic-ai/sdk';

const execAsync = promisify(exec);
const logger = createLogger('PRConflictClassifier');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The four possible conflict verdicts. */
export type ConflictVerdict = 'redundant' | 'rebasable' | 'decomposable' | 'genuine';

/** Evidence gathered from git and GitHub about the conflicting PR. */
export interface ConflictEvidence {
  prTitle: string;
  prBody: string;
  prBranch: string;
  baseBranch: string;
  /** Files with merge conflict markers after dry-run merge attempt. */
  conflictingFiles: string[];
  /** Total number of files changed in the PR. */
  totalPRFiles: number;
  /** Recent commits on base branch since PR was created (oneline format). */
  recentBaseCommits: string[];
  /** Sample conflict diff content (truncated to avoid token limits). */
  conflictingSample: string;
}

/** Classification result returned by the classifier. */
export interface ConflictClassification {
  verdict: ConflictVerdict;
  /** Confidence score 0–1. */
  confidence: number;
  reasoning: string;
  evidence: ConflictEvidence;
  /** For 'redundant': SHAs or one-line descriptions of superseding commits. */
  supersedingCommits?: string[];
  /** For 'decomposable': which files should be extracted into a smaller PR. */
  decompositionFiles?: string[];
  /** For 'genuine': descriptions of the specific semantic conflicts. */
  conflictingHunks?: string[];
}

/** Input required to run the classifier. */
export interface PRConflictClassifierInput {
  projectPath: string;
  prNumber: number;
  anthropic: Anthropic;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function sanitizePrNumber(prNumber: unknown): number {
  const parsed = parseInt(String(prNumber), 10);
  if (isNaN(parsed) || parsed <= 0) {
    throw new Error(`Invalid PR number: ${String(prNumber)}`);
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

function buildClassifierPrompt(evidence: ConflictEvidence): string {
  const conflictingFileList =
    evidence.conflictingFiles.map((f) => `- ${f}`).join('\n') || '(none detected)';
  const commitList = evidence.recentBaseCommits.slice(0, 20).join('\n') || '(none)';

  return `You are a Git merge conflict classifier. Analyze this pull request's conflict situation and return a JSON verdict.

## Pull Request
Title: ${evidence.prTitle}
Description: ${evidence.prBody.slice(0, 800)}
Branch: ${evidence.prBranch}
Base: ${evidence.baseBranch}

## Conflict Summary
Total files changed in PR: ${evidence.totalPRFiles}
Files with merge conflicts (${evidence.conflictingFiles.length}):
${conflictingFileList}

## Recent commits on base branch since PR was created:
${commitList}

## Sample conflict markers (first conflicting file):
${evidence.conflictingSample.slice(0, 2500)}

## Verdict Definitions

**redundant**: The PR's stated intent has ALREADY been achieved by commits on the base branch. If merged, it would add no new value or would revert base changes. Look for base commits with descriptions that match this PR's title/goal.

**rebasable**: Conflicts are purely textual and non-semantic — whitespace, import order, doc/comment changes, lock file version bumps, or duplicate-but-identical parallel edits. The conflict resolution is unambiguous: one side's changes are correct and the other should be discarded or they are identical.

**decomposable**: The conflict affects only K files out of N total PR files where K < N. The remaining (N-K) non-conflicting files could be merged cleanly as a smaller PR, delivering partial value immediately.

**genuine**: Both the PR and base made semantically different decisions in the same code (different logic, different API contracts, different type shapes). No automatic resolution is safe — human judgment is required.

Respond with ONLY a JSON object (no markdown fencing):
{
  "verdict": "redundant|rebasable|decomposable|genuine",
  "confidence": 0.0,
  "reasoning": "One paragraph explaining the verdict",
  "supersedingCommits": ["sha or description"],
  "decompositionFiles": ["path/to/file"],
  "conflictingHunks": ["description of semantic conflict"]
}

Include only the arrays relevant to your verdict. Omit the others.`;
}

// ---------------------------------------------------------------------------
// Classifier class
// ---------------------------------------------------------------------------

export class PRConflictClassifier {
  private readonly input: PRConflictClassifierInput;

  constructor(input: PRConflictClassifierInput) {
    this.input = input;
  }

  /**
   * Classify the conflict type for this PR.
   * Falls back to 'genuine' on any error (conservative default).
   */
  async classify(): Promise<ConflictClassification> {
    const prNumber = sanitizePrNumber(this.input.prNumber);
    const { projectPath, anthropic } = this.input;

    logger.info(`[PRConflictClassifier] Classifying PR #${prNumber}`, { projectPath });

    try {
      const evidence = await this.gatherEvidence(prNumber, projectPath);
      const classification = await this.llmClassify(evidence, anthropic);
      logger.info('[PRConflictClassifier] Classification complete', {
        prNumber,
        verdict: classification.verdict,
        confidence: classification.confidence,
      });
      return classification;
    } catch (error) {
      logger.error('[PRConflictClassifier] Classification failed, defaulting to genuine', error);
      return this.fallbackClassification(error instanceof Error ? error.message : String(error));
    }
  }

  // -------------------------------------------------------------------------
  // Evidence gathering
  // -------------------------------------------------------------------------

  private async gatherEvidence(prNumber: number, projectPath: string): Promise<ConflictEvidence> {
    const [prMeta, totalPRFiles] = await Promise.all([
      this.fetchPRMetadata(prNumber, projectPath),
      this.fetchPRFileCount(prNumber, projectPath),
    ]);

    const { prTitle, prBody, prBranch, baseBranch, prCreatedAt } = prMeta;

    const [conflictInfo, recentBaseCommits] = await Promise.all([
      this.detectConflicts(prNumber, prBranch, baseBranch, projectPath),
      this.fetchRecentBaseCommits(baseBranch, prCreatedAt, projectPath),
    ]);

    return {
      prTitle,
      prBody,
      prBranch,
      baseBranch,
      conflictingFiles: conflictInfo.conflictingFiles,
      totalPRFiles,
      recentBaseCommits,
      conflictingSample: conflictInfo.conflictingSample,
    };
  }

  private async fetchPRMetadata(
    prNumber: number,
    projectPath: string
  ): Promise<{
    prTitle: string;
    prBody: string;
    prBranch: string;
    baseBranch: string;
    prCreatedAt: string;
  }> {
    try {
      const { stdout } = await execAsync(
        `gh pr view ${prNumber} --json title,body,headRefName,baseRefName,createdAt`,
        { cwd: projectPath, timeout: 15000 }
      );
      const data = JSON.parse(stdout.trim()) as {
        title: string;
        body: string;
        headRefName: string;
        baseRefName: string;
        createdAt: string;
      };
      return {
        prTitle: data.title ?? '',
        prBody: data.body ?? '',
        prBranch: data.headRefName ?? '',
        baseBranch: data.baseRefName ?? '',
        prCreatedAt: data.createdAt ?? '',
      };
    } catch (err) {
      logger.warn('[PRConflictClassifier] Failed to fetch PR metadata', err);
      return { prTitle: '', prBody: '', prBranch: '', baseBranch: '', prCreatedAt: '' };
    }
  }

  private async fetchPRFileCount(prNumber: number, projectPath: string): Promise<number> {
    try {
      const { stdout } = await execAsync(
        `gh pr view ${prNumber} --json files --jq '.files | length'`,
        { cwd: projectPath, timeout: 15000 }
      );
      return parseInt(stdout.trim(), 10) || 0;
    } catch {
      return 0;
    }
  }

  private async detectConflicts(
    prNumber: number,
    prBranch: string,
    baseBranch: string,
    projectPath: string
  ): Promise<{ conflictingFiles: string[]; conflictingSample: string }> {
    if (!prBranch || !baseBranch) {
      return { conflictingFiles: [], conflictingSample: '' };
    }

    try {
      await execAsync(`git fetch origin ${baseBranch}`, { cwd: projectPath, timeout: 30000 });
    } catch (err) {
      logger.warn('[PRConflictClassifier] Failed to fetch base branch', err);
    }

    // Check if we are currently on the PR branch in this worktree
    let currentBranch = '';
    try {
      const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', {
        cwd: projectPath,
        timeout: 5000,
      });
      currentBranch = stdout.trim();
    } catch {
      // ignore
    }

    if (currentBranch === prBranch) {
      return this.detectConflictsOnBranch(baseBranch, projectPath);
    }

    // Not on the PR branch — use the feature worktree if it exists
    const worktreePath = `${projectPath}/.worktrees/${prBranch}`;
    try {
      const { stdout: wt } = await execAsync('git rev-parse --abbrev-ref HEAD', {
        cwd: worktreePath,
        timeout: 5000,
      });
      if (wt.trim() === prBranch) {
        return this.detectConflictsOnBranch(baseBranch, worktreePath);
      }
    } catch {
      // Worktree doesn't exist or is on a different branch
    }

    // Fall back: list PR files as potential conflict candidates
    try {
      const { stdout } = await execAsync(
        `gh pr view ${prNumber} --json files --jq '[.files[].path] | join("\\n")'`,
        { cwd: projectPath, timeout: 15000 }
      );
      const files = stdout.trim().split('\n').filter(Boolean);
      return {
        conflictingFiles: files,
        conflictingSample: '(conflict markers not available — worktree not on PR branch)',
      };
    } catch {
      return { conflictingFiles: [], conflictingSample: '' };
    }
  }

  /** Attempt a dry-run merge to identify conflicting files. Aborts cleanly. */
  private async detectConflictsOnBranch(
    baseBranch: string,
    cwd: string
  ): Promise<{ conflictingFiles: string[]; conflictingSample: string }> {
    let conflictingFiles: string[] = [];
    let conflictingSample = '';

    try {
      await execAsync(`git merge --no-commit --no-ff origin/${baseBranch}`, {
        cwd,
        timeout: 30000,
      });
      // Merge succeeded cleanly — abort to leave working tree unchanged
      await execAsync('git merge --abort', { cwd, timeout: 10000 });
    } catch {
      // Merge had conflicts — collect conflicting file list and sample
      try {
        const { stdout: conflictList } = await execAsync('git diff --name-only --diff-filter=U', {
          cwd,
          timeout: 10000,
        });
        conflictingFiles = conflictList.trim().split('\n').filter(Boolean);

        if (conflictingFiles.length > 0 && conflictingFiles[0]) {
          try {
            const { stdout: sampleDiff } = await execAsync(`git diff -- "${conflictingFiles[0]}"`, {
              cwd,
              timeout: 10000,
            });
            conflictingSample = sampleDiff.slice(0, 3000);
          } catch {
            // ignore — sample is optional
          }
        }
      } catch (listErr) {
        logger.warn('[PRConflictClassifier] Failed to list conflicting files', listErr);
      } finally {
        // Always abort the in-progress merge
        try {
          await execAsync('git merge --abort', { cwd, timeout: 10000 });
        } catch {
          try {
            await execAsync('git reset --merge', { cwd, timeout: 10000 });
          } catch {
            logger.warn('[PRConflictClassifier] Failed to abort merge — worktree may be dirty');
          }
        }
      }
    }

    return { conflictingFiles, conflictingSample };
  }

  private async fetchRecentBaseCommits(
    baseBranch: string,
    since: string,
    projectPath: string
  ): Promise<string[]> {
    if (!baseBranch) return [];
    try {
      const sinceArg = since ? `--since="${since}"` : '--since="1 week ago"';
      const { stdout } = await execAsync(
        `git log origin/${baseBranch} --oneline --no-merges ${sinceArg}`,
        { cwd: projectPath, timeout: 15000 }
      );
      return stdout.trim().split('\n').filter(Boolean);
    } catch (err) {
      logger.warn('[PRConflictClassifier] Failed to fetch recent base commits', err);
      return [];
    }
  }

  // -------------------------------------------------------------------------
  // LLM classification
  // -------------------------------------------------------------------------

  private async llmClassify(
    evidence: ConflictEvidence,
    anthropic: Anthropic
  ): Promise<ConflictClassification> {
    const prompt = buildClassifierPrompt(evidence);
    const model = resolveModelString('haiku');

    const response = await anthropic.messages.create({
      model,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Expected text response from classifier LLM');
    }

    // Strip markdown code fences if present
    const raw = content.text
      .trim()
      .replace(/^```(?:json)?\n?/, '')
      .replace(/\n?```$/, '');
    const result = JSON.parse(raw) as {
      verdict: ConflictVerdict;
      confidence: number;
      reasoning: string;
      supersedingCommits?: string[];
      decompositionFiles?: string[];
      conflictingHunks?: string[];
    };

    return {
      verdict: result.verdict,
      confidence: result.confidence ?? 0.5,
      reasoning: result.reasoning ?? '',
      evidence,
      supersedingCommits: result.supersedingCommits,
      decompositionFiles: result.decompositionFiles,
      conflictingHunks: result.conflictingHunks,
    };
  }

  // -------------------------------------------------------------------------
  // Fallback
  // -------------------------------------------------------------------------

  private fallbackClassification(errorMessage: string): ConflictClassification {
    return {
      verdict: 'genuine',
      confidence: 0,
      reasoning: `Classifier failed: ${errorMessage}. Defaulting to genuine to trigger HITL escalation.`,
      evidence: {
        prTitle: '',
        prBody: '',
        prBranch: '',
        baseBranch: '',
        conflictingFiles: [],
        totalPRFiles: 0,
        recentBaseCommits: [],
        conflictingSample: '',
      },
      conflictingHunks: [
        'Classification error — treating as genuine conflict requiring human review',
      ],
    };
  }
}

/**
 * Factory function for creating a PRConflictClassifier.
 */
export function createPRConflictClassifier(input: PRConflictClassifierInput): PRConflictClassifier {
  return new PRConflictClassifier(input);
}
