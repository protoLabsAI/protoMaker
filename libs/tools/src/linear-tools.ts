/**
 * Linear tools — DynamicStructuredTool wrappers for Linear issue operations.
 *
 * Factory: createLinearTools(linearClient) returns LangGraph-compatible SharedTool
 * instances for create_issue, update_issue, and search_issues.
 */

import { z } from 'zod';
import { defineSharedTool } from './define-tool.js';
import type { SharedTool } from './types.js';

// ---------------------------------------------------------------------------
// Minimal structural interface — avoids importing concrete Linear SDK types
// ---------------------------------------------------------------------------

export interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  description?: string;
  state?: { name: string };
  priority?: number;
  assignee?: { name: string; email?: string } | null;
  url?: string;
}

export interface LinearDeps {
  linearClient: {
    createIssue: (input: {
      teamId: string;
      title: string;
      description?: string;
      priority?: number;
      stateId?: string;
      assigneeId?: string;
    }) => Promise<LinearIssue>;
    updateIssue: (
      issueId: string,
      updates: {
        title?: string;
        description?: string;
        priority?: number;
        stateId?: string;
        assigneeId?: string;
      }
    ) => Promise<LinearIssue>;
    searchIssues: (
      query: string,
      options?: { teamId?: string; limit?: number }
    ) => Promise<LinearIssue[]>;
  };
  /** Default team ID to use when not provided in the tool call */
  defaultTeamId?: string;
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const CreateIssueInputSchema = z.object({
  title: z.string().describe('Issue title'),
  description: z.string().optional().describe('Issue description (markdown supported)'),
  teamId: z.string().optional().describe('Linear team ID (uses default if omitted)'),
  priority: z
    .number()
    .int()
    .min(0)
    .max(4)
    .optional()
    .describe('Priority: 0=none, 1=urgent, 2=high, 3=medium, 4=low'),
  stateId: z.string().optional().describe('Workflow state ID to assign on creation'),
  assigneeId: z.string().optional().describe('User ID to assign the issue to'),
});

const UpdateIssueInputSchema = z.object({
  issueId: z.string().describe('Linear issue ID'),
  title: z.string().optional().describe('New title'),
  description: z.string().optional().describe('New description'),
  priority: z.number().int().min(0).max(4).optional().describe('New priority'),
  stateId: z.string().optional().describe('New workflow state ID'),
  assigneeId: z.string().optional().describe('New assignee user ID'),
});

const SearchIssuesInputSchema = z.object({
  query: z.string().describe('Search query string'),
  teamId: z.string().optional().describe('Restrict search to this team ID'),
  limit: z.number().int().min(1).max(50).default(10).describe('Maximum results to return'),
});

const IssueOutputSchema = z.object({
  issue: z.object({
    id: z.string(),
    identifier: z.string(),
    title: z.string(),
    url: z.string().optional(),
  }),
});

const IssueListOutputSchema = z.object({
  issues: z.array(
    z.object({
      id: z.string(),
      identifier: z.string(),
      title: z.string(),
      url: z.string().optional(),
    })
  ),
  count: z.number(),
});

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates Linear issue management tools bound to the provided linearClient.
 *
 * @param deps - Linear dependencies (linearClient, optional defaultTeamId)
 * @returns Array of SharedTool instances for use with ToolRegistry or toLangGraphTools()
 */
export function createLinearTools(deps: LinearDeps): SharedTool[] {
  const createIssueTool = defineSharedTool({
    name: 'create_linear_issue',
    description:
      'Create a new issue in Linear. Returns the created issue with its identifier (e.g. PRO-123) and URL.',
    inputSchema: CreateIssueInputSchema,
    outputSchema: IssueOutputSchema,
    metadata: { category: 'linear', tags: ['linear', 'issue', 'create'] },
    execute: async (rawInput) => {
      const input = rawInput as z.infer<typeof CreateIssueInputSchema>;
      try {
        const teamId = input.teamId ?? deps.defaultTeamId;
        if (!teamId) {
          return { success: false, error: 'teamId is required (or set a defaultTeamId in deps)' };
        }
        const issue = await deps.linearClient.createIssue({
          teamId,
          title: input.title,
          description: input.description,
          priority: input.priority,
          stateId: input.stateId,
          assigneeId: input.assigneeId,
        });
        return {
          success: true,
          data: {
            issue: {
              id: issue.id,
              identifier: issue.identifier,
              title: issue.title,
              url: issue.url,
            },
          },
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to create Linear issue',
        };
      }
    },
  });

  const updateIssueTool = defineSharedTool({
    name: 'update_linear_issue',
    description:
      'Update an existing Linear issue. Can change title, description, priority, state, or assignee.',
    inputSchema: UpdateIssueInputSchema,
    outputSchema: IssueOutputSchema,
    metadata: { category: 'linear', tags: ['linear', 'issue', 'update'] },
    execute: async (rawInput) => {
      const input = rawInput as z.infer<typeof UpdateIssueInputSchema>;
      try {
        const { issueId, ...updates } = input;
        const issue = await deps.linearClient.updateIssue(issueId, updates);
        return {
          success: true,
          data: {
            issue: {
              id: issue.id,
              identifier: issue.identifier,
              title: issue.title,
              url: issue.url,
            },
          },
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to update Linear issue',
        };
      }
    },
  });

  const searchIssuesTool = defineSharedTool({
    name: 'search_linear_issues',
    description:
      'Search Linear issues by text query. Returns matching issues with their identifiers and URLs.',
    inputSchema: SearchIssuesInputSchema,
    outputSchema: IssueListOutputSchema,
    metadata: { category: 'linear', tags: ['linear', 'issue', 'search'] },
    execute: async (rawInput) => {
      const input = rawInput as z.infer<typeof SearchIssuesInputSchema>;
      try {
        const issues = await deps.linearClient.searchIssues(input.query, {
          teamId: input.teamId,
          limit: input.limit,
        });
        return {
          success: true,
          data: {
            issues: issues.map((i) => ({
              id: i.id,
              identifier: i.identifier,
              title: i.title,
              url: i.url,
            })),
            count: issues.length,
          },
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to search Linear issues',
        };
      }
    },
  });

  return [createIssueTool, updateIssueTool, searchIssuesTool];
}
