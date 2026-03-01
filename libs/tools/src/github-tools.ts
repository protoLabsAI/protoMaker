/**
 * GitHub tools — DynamicStructuredTool wrappers for GitHub PR operations.
 *
 * Factory: createGitHubTools(githubClient) returns LangGraph-compatible SharedTool
 * instances for list_prs, merge_pr, and check_pr_status.
 */

import { z } from 'zod';
import { defineSharedTool } from './define-tool.js';
import type { SharedTool } from './types.js';

// ---------------------------------------------------------------------------
// Minimal structural interface — avoids importing @octokit/rest directly
// ---------------------------------------------------------------------------

export interface PullRequest {
  number: number;
  title: string;
  state: string;
  html_url: string;
  head: { ref: string };
  base: { ref: string };
  mergeable?: boolean | null;
  draft?: boolean;
  user?: { login: string } | null;
}

export interface GitHubDeps {
  githubClient: {
    listPRs: (options?: {
      state?: 'open' | 'closed' | 'all';
      base?: string;
      head?: string;
      limit?: number;
    }) => Promise<PullRequest[]>;
    mergePR: (
      prNumber: number,
      options?: { method?: 'squash' | 'merge' | 'rebase' }
    ) => Promise<{
      merged: boolean;
      sha?: string;
      message?: string;
    }>;
    checkPRStatus: (prNumber: number) => Promise<{
      number: number;
      title: string;
      state: string;
      mergeable: boolean | null;
      checksState: 'success' | 'failure' | 'pending' | 'unknown';
      url: string;
    }>;
  };
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const ListPRsInputSchema = z.object({
  state: z
    .enum(['open', 'closed', 'all'])
    .default('open')
    .describe('PR state filter (default: open)'),
  base: z.string().optional().describe('Filter by base branch name'),
  head: z.string().optional().describe('Filter by head branch name'),
  limit: z.number().int().min(1).max(100).default(20).describe('Maximum number of PRs to return'),
});

const MergePRInputSchema = z.object({
  prNumber: z.number().int().positive().describe('Pull request number'),
  method: z
    .enum(['squash', 'merge', 'rebase'])
    .default('squash')
    .describe('Merge method (default: squash)'),
});

const CheckPRStatusInputSchema = z.object({
  prNumber: z.number().int().positive().describe('Pull request number'),
});

const PRSummarySchema = z.object({
  number: z.number(),
  title: z.string(),
  state: z.string(),
  url: z.string(),
  headBranch: z.string(),
  baseBranch: z.string(),
});

const ListPRsOutputSchema = z.object({
  pullRequests: z.array(PRSummarySchema),
  count: z.number(),
});

const MergePROutputSchema = z.object({
  merged: z.boolean(),
  prNumber: z.number(),
  sha: z.string().optional(),
  message: z.string().optional(),
});

const CheckPRStatusOutputSchema = z.object({
  number: z.number(),
  title: z.string(),
  state: z.string(),
  mergeable: z.boolean().nullable(),
  checksState: z.enum(['success', 'failure', 'pending', 'unknown']),
  url: z.string(),
});

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates GitHub PR management tools bound to the provided githubClient.
 *
 * @param deps - GitHub dependencies (githubClient with listPRs, mergePR, checkPRStatus)
 * @returns Array of SharedTool instances for use with ToolRegistry or toLangGraphTools()
 */
export function createGitHubTools(deps: GitHubDeps): SharedTool[] {
  const listPRsTool = defineSharedTool({
    name: 'github_list_prs',
    description:
      'List pull requests in the repository. Filters by state (open/closed/all), ' +
      'base branch, or head branch. Returns PR numbers, titles, and branch info.',
    inputSchema: ListPRsInputSchema,
    outputSchema: ListPRsOutputSchema,
    metadata: { category: 'github', tags: ['github', 'pr', 'list'] },
    execute: async (rawInput) => {
      const input = rawInput as z.infer<typeof ListPRsInputSchema>;
      try {
        const prs = await deps.githubClient.listPRs({
          state: input.state,
          base: input.base,
          head: input.head,
          limit: input.limit,
        });
        return {
          success: true,
          data: {
            pullRequests: prs.map((pr) => ({
              number: pr.number,
              title: pr.title,
              state: pr.state,
              url: pr.html_url,
              headBranch: pr.head.ref,
              baseBranch: pr.base.ref,
            })),
            count: prs.length,
          },
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to list pull requests',
        };
      }
    },
  });

  const mergePRTool = defineSharedTool({
    name: 'github_merge_pr',
    description:
      'Merge a pull request. Specify the PR number and merge method ' +
      '(squash=default, merge=merge commit, rebase=rebase merge).',
    inputSchema: MergePRInputSchema,
    outputSchema: MergePROutputSchema,
    metadata: { category: 'github', tags: ['github', 'pr', 'merge'] },
    execute: async (rawInput) => {
      const input = rawInput as z.infer<typeof MergePRInputSchema>;
      try {
        const result = await deps.githubClient.mergePR(input.prNumber, { method: input.method });
        return {
          success: true,
          data: {
            merged: result.merged,
            prNumber: input.prNumber,
            sha: result.sha,
            message: result.message,
          },
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to merge pull request',
        };
      }
    },
  });

  const checkPRStatusTool = defineSharedTool({
    name: 'github_check_pr_status',
    description:
      'Check the current status of a pull request: state (open/closed/merged), ' +
      'mergeability, and CI checks state (success/failure/pending/unknown).',
    inputSchema: CheckPRStatusInputSchema,
    outputSchema: CheckPRStatusOutputSchema,
    metadata: { category: 'github', tags: ['github', 'pr', 'status'] },
    execute: async (rawInput) => {
      const input = rawInput as z.infer<typeof CheckPRStatusInputSchema>;
      try {
        const status = await deps.githubClient.checkPRStatus(input.prNumber);
        return { success: true, data: status };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to check PR status',
        };
      }
    },
  });

  return [listPRsTool, mergePRTool, checkPRStatusTool];
}
