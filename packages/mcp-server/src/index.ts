#!/usr/bin/env node
/**
 * Automaker MCP Server
 *
 * Exposes Automaker's board and feature management via MCP protocol.
 * Allows Claude Code and other MCP clients to interact with Automaker programmatically.
 *
 * Usage:
 *   npx @automaker/mcp-server
 *
 * Environment variables:
 *   AUTOMAKER_API_URL - API base URL (default: http://localhost:3008)
 *   AUTOMAKER_API_KEY - API key for authentication
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';

// Configuration
const API_URL = process.env.AUTOMAKER_API_URL || 'http://localhost:3008';

if (!process.env.AUTOMAKER_API_KEY) {
  console.error(
    '[MCP] AUTOMAKER_API_KEY is not set. Set it in your environment or use a secret manager (see docs/infra/secrets.md).'
  );
  process.exit(1);
}

const API_KEY: string = process.env.AUTOMAKER_API_KEY;

// Retry configuration
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 1000, // 1 second base delay
  maxDelayMs: 10000, // 10 seconds max delay
};

/**
 * Determines if an error is retryable (transient)
 * - 5xx server errors are retryable
 * - Network errors (fetch failures) are retryable
 * - 4xx client errors are NOT retryable
 */
function isRetryableError(error: unknown, statusCode?: number): boolean {
  // Network errors (no response received) are retryable
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return true;
  }
  // 5xx server errors are retryable
  if (statusCode && statusCode >= 500 && statusCode < 600) {
    return true;
  }
  // 4xx client errors are NOT retryable
  return false;
}

/**
 * Calculates exponential backoff delay with jitter
 * Formula: min(baseDelay * 2^attempt + jitter, maxDelay)
 */
function calculateBackoffDelay(attempt: number): number {
  const exponentialDelay = RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt);
  // Add jitter (0-25% of delay) to prevent thundering herd
  const jitter = Math.random() * 0.25 * exponentialDelay;
  return Math.min(exponentialDelay + jitter, RETRY_CONFIG.maxDelayMs);
}

/**
 * Sleep for a specified number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Helper for API calls with retry logic
async function apiCall(
  endpoint: string,
  body: Record<string, unknown>,
  method: 'GET' | 'POST' = 'POST'
): Promise<unknown> {
  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
    },
  };

  // Only include body for POST requests
  if (method === 'POST') {
    options.body = JSON.stringify(body);
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    try {
      const response = await fetch(`${API_URL}/api${endpoint}`, options);

      if (!response.ok) {
        const text = await response.text();
        const statusCode = response.status;

        // Don't retry 4xx client errors
        if (statusCode >= 400 && statusCode < 500) {
          throw new Error(`API error ${statusCode}: ${text}`);
        }

        // For 5xx errors, check if we should retry
        if (isRetryableError(null, statusCode) && attempt < RETRY_CONFIG.maxRetries) {
          const delay = calculateBackoffDelay(attempt);
          console.error(
            `[MCP] Retry attempt ${attempt + 1}/${RETRY_CONFIG.maxRetries} for ${endpoint} after ${Math.round(delay)}ms (status: ${statusCode})`
          );
          await sleep(delay);
          continue;
        }

        throw new Error(`API error ${statusCode}: ${text}`);
      }

      return response.json();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if this is a retryable error (network failure)
      if (isRetryableError(error) && attempt < RETRY_CONFIG.maxRetries) {
        const delay = calculateBackoffDelay(attempt);
        console.error(
          `[MCP] Retry attempt ${attempt + 1}/${RETRY_CONFIG.maxRetries} for ${endpoint} after ${Math.round(delay)}ms (error: ${lastError.message})`
        );
        await sleep(delay);
        continue;
      }

      // Not retryable or max retries exceeded
      throw lastError;
    }
  }

  // Should not reach here, but throw last error if we do
  throw lastError || new Error('Unknown error during API call');
}

// Define all tools
const tools: Tool[] = [
  // ========== Feature Management ==========
  {
    name: 'list_features',
    description:
      'List all features in a project. Returns features organized by status (backlog, in-progress, review, done).',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        status: {
          type: 'string',
          enum: ['backlog', 'in-progress', 'review', 'done'],
          description: 'Filter by status (optional)',
        },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'get_feature',
    description:
      'Get detailed information about a specific feature including its description, status, and agent output.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        featureId: {
          type: 'string',
          description: 'The feature ID (UUID)',
        },
        includeHistory: {
          type: 'boolean',
          description:
            'Include full executionHistory, descriptionHistory, statusHistory, and planSpec (default: false to save context)',
        },
      },
      required: ['projectPath', 'featureId'],
    },
  },
  {
    name: 'create_feature',
    description:
      'Create a new feature on the Kanban board. Features start in the backlog by default.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        title: {
          type: 'string',
          description: 'Short title for the feature',
        },
        description: {
          type: 'string',
          description:
            'Detailed description with requirements and acceptance criteria. Be specific about file locations, components, and expected behavior.',
        },
        status: {
          type: 'string',
          enum: ['backlog', 'in-progress'],
          default: 'backlog',
          description: "Initial status. Use 'in-progress' to immediately start an agent.",
        },
        branchName: {
          type: 'string',
          description:
            'Optional git branch name for this feature. If not provided, auto-generated from title.',
        },
        dependencies: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of feature IDs that this feature depends on.',
        },
        isEpic: {
          type: 'boolean',
          description:
            'Set to true to mark this feature as an epic (container for child features).',
        },
        epicId: {
          type: 'string',
          description: 'ID of parent epic if this feature belongs to an epic.',
        },
        complexity: {
          type: 'string',
          enum: ['small', 'medium', 'large', 'architectural'],
          description:
            'Feature complexity level for model selection. small=haiku, medium/large=sonnet, architectural=opus. Features that fail 2+ times auto-escalate to opus.',
        },
        assignee: {
          type: 'string',
          description:
            "Who this feature is assigned to. If set to a human name (e.g., 'josh'), auto-mode will skip this feature. If set to 'agent' or undefined, auto-mode can pick it up.",
        },
        dueDate: {
          type: 'string',
          description:
            'Due date for this feature in ISO 8601 format (YYYY-MM-DD). Example: "2026-02-10".',
        },
        priority: {
          type: 'number',
          enum: [0, 1, 2, 3, 4],
          description:
            'Priority level: 0 = No priority, 1 = Urgent, 2 = High, 3 = Normal, 4 = Low. Auto-mode picks higher priority first.',
        },
      },
      required: ['projectPath', 'title', 'description'],
    },
  },
  {
    name: 'update_feature',
    description:
      "Update a feature's properties. Can be used to change status, title, description, or move between columns.",
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        featureId: {
          type: 'string',
          description: 'The feature ID (UUID)',
        },
        title: {
          type: 'string',
          description: 'New title (optional)',
        },
        description: {
          type: 'string',
          description: 'New description (optional)',
        },
        status: {
          type: 'string',
          enum: ['backlog', 'in-progress', 'review', 'done'],
          description: "New status (optional). Moving to 'in-progress' starts an agent.",
        },
        complexity: {
          type: 'string',
          enum: ['small', 'medium', 'large', 'architectural'],
          description:
            'Feature complexity level for model selection. small=haiku, medium/large=sonnet, architectural=opus.',
        },
        assignee: {
          type: ['string', 'null'],
          description:
            "Who this feature is assigned to. If set to a human name (e.g., 'josh'), auto-mode will skip this feature. If set to 'agent' or undefined, auto-mode can pick it up. Pass null to unassign.",
        },
        dueDate: {
          type: ['string', 'null'],
          description:
            'Due date for this feature in ISO 8601 format (YYYY-MM-DD). Pass null to clear.',
        },
        priority: {
          type: ['number', 'null'],
          enum: [0, 1, 2, 3, 4, null],
          description:
            'Priority level: 0 = No priority, 1 = Urgent, 2 = High, 3 = Normal, 4 = Low. Pass null to clear.',
        },
      },
      required: ['projectPath', 'featureId'],
    },
  },
  {
    name: 'delete_feature',
    description: 'Delete a feature from the board.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        featureId: {
          type: 'string',
          description: 'The feature ID (UUID)',
        },
      },
      required: ['projectPath', 'featureId'],
    },
  },
  {
    name: 'move_feature',
    description:
      'Move a feature to a different column on the board. This is a convenience wrapper around update_feature.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        featureId: {
          type: 'string',
          description: 'The feature ID (UUID)',
        },
        status: {
          type: 'string',
          enum: ['backlog', 'in-progress', 'review', 'done'],
          description: "Target status/column. Moving to 'in-progress' starts an agent.",
        },
      },
      required: ['projectPath', 'featureId', 'status'],
    },
  },
  {
    name: 'update_feature_git_settings',
    description:
      'Update git workflow settings for a specific feature. Override global git workflow settings (auto-commit, auto-push, auto-PR, auto-merge) on a per-feature basis.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        featureId: {
          type: 'string',
          description: 'The feature ID (UUID)',
        },
        autoCommit: {
          type: 'boolean',
          description: 'Auto-commit changes when feature completes (optional)',
        },
        autoPush: {
          type: 'boolean',
          description: 'Auto-push to remote after commit (optional)',
        },
        autoCreatePR: {
          type: 'boolean',
          description: 'Auto-create pull request after push (optional)',
        },
        autoMergePR: {
          type: 'boolean',
          description: 'Auto-merge pull request after creation (optional)',
        },
        prMergeStrategy: {
          type: 'string',
          enum: ['merge', 'squash', 'rebase'],
          description: 'PR merge strategy: merge, squash, or rebase (optional)',
        },
        waitForCI: {
          type: 'boolean',
          description: 'Wait for CI checks to pass before merging (optional)',
        },
        prBaseBranch: {
          type: 'string',
          description: 'Base branch for PR creation (optional, default: main)',
        },
      },
      required: ['projectPath', 'featureId'],
    },
  },

  // ========== Agent Control ==========
  {
    name: 'start_agent',
    description:
      'Start an AI agent to work on a feature. The agent will create a git worktree and begin implementation.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        featureId: {
          type: 'string',
          description: 'The feature ID to work on',
        },
        useWorktrees: {
          type: 'boolean',
          description:
            'Whether to use isolated git worktrees for the agent (default: true). When true, agent works in a separate worktree based on the feature branch.',
          default: true,
        },
      },
      required: ['projectPath', 'featureId'],
    },
  },
  {
    name: 'stop_agent',
    description: 'Stop a running agent.',
    inputSchema: {
      type: 'object',
      properties: {
        featureId: {
          type: 'string',
          description: 'The feature ID of the running agent',
        },
      },
      required: ['featureId'],
    },
  },
  {
    name: 'list_running_agents',
    description: 'List all currently running agents across all projects.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_agent_output',
    description:
      "Get the output/log from an agent's execution on a feature. Useful for reviewing what the agent did.",
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        featureId: {
          type: 'string',
          description: 'The feature ID',
        },
        maxLines: {
          type: 'number',
          description:
            'Maximum lines to return (default: 200). Use -1 for unlimited. Returns the last N lines.',
        },
      },
      required: ['projectPath', 'featureId'],
    },
  },
  {
    name: 'send_message_to_agent',
    description:
      'Send a message to a running agent. Use this to provide clarification or additional instructions.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        featureId: {
          type: 'string',
          description: 'The feature ID of the running agent',
        },
        message: {
          type: 'string',
          description: 'Message to send to the agent',
        },
      },
      required: ['projectPath', 'featureId', 'message'],
    },
  },

  // ========== Queue Management ==========
  {
    name: 'queue_feature',
    description:
      'Add a feature to the agent queue for processing. Features in queue are automatically picked up.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        featureId: {
          type: 'string',
          description: 'The feature ID to queue',
        },
      },
      required: ['projectPath', 'featureId'],
    },
  },
  {
    name: 'list_queue',
    description: 'List all features currently in the agent queue.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'clear_queue',
    description: 'Clear all features from the agent queue.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  // ========== Context Files ==========
  {
    name: 'list_context_files',
    description:
      "List all context files in a project's .automaker/context/ directory. These files are injected into agent prompts.",
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'get_context_file',
    description: 'Read the contents of a context file.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        filename: {
          type: 'string',
          description: "Name of the context file (e.g., 'coding-rules.md')",
        },
      },
      required: ['projectPath', 'filename'],
    },
  },
  {
    name: 'create_context_file',
    description:
      'Create a new context file that will be injected into all agent prompts for this project.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        filename: {
          type: 'string',
          description: "Name for the context file (should end in .md, e.g., 'coding-rules.md')",
        },
        content: {
          type: 'string',
          description: 'Markdown content for the context file. This will be shown to agents.',
        },
      },
      required: ['projectPath', 'filename', 'content'],
    },
  },
  {
    name: 'delete_context_file',
    description: 'Delete a context file.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        filename: {
          type: 'string',
          description: 'Name of the context file to delete',
        },
      },
      required: ['projectPath', 'filename'],
    },
  },

  // ========== Skills ==========
  {
    name: 'list_skills',
    description:
      'List all learned skills in a project. Skills are reusable patterns stored in .automaker/skills/',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'get_skill',
    description: 'Get the full content and metadata of a specific skill.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        skillName: {
          type: 'string',
          description: 'Name of the skill (without .md extension)',
        },
      },
      required: ['projectPath', 'skillName'],
    },
  },
  {
    name: 'create_skill',
    description:
      'Create a new skill from a learned pattern. Skills help agents reuse successful approaches.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        name: {
          type: 'string',
          description: 'Unique name for the skill (kebab-case, e.g., "git-commit-workflow")',
        },
        description: {
          type: 'string',
          description: 'Brief description of what the skill does',
        },
        content: {
          type: 'string',
          description: 'The skill content/instructions in markdown',
        },
        emoji: {
          type: 'string',
          description: 'Optional emoji for visual identification',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags for categorization and discovery',
        },
      },
      required: ['projectPath', 'name', 'description', 'content'],
    },
  },
  {
    name: 'delete_skill',
    description: 'Delete a skill that is no longer needed.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        skillName: {
          type: 'string',
          description: 'Name of the skill to delete',
        },
      },
      required: ['projectPath', 'skillName'],
    },
  },

  // ========== Project Spec ==========
  {
    name: 'get_project_spec',
    description:
      'Get the project specification from .automaker/spec.md. This provides architectural context to agents.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'update_project_spec',
    description:
      'Update the project specification. This is shown to agents for architectural context.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        content: {
          type: 'string',
          description: 'New content for spec.md',
        },
      },
      required: ['projectPath', 'content'],
    },
  },

  // ========== Orchestration ==========
  {
    name: 'set_feature_dependencies',
    description:
      'Set dependencies for a feature. The feature will not start until all dependencies are marked Done.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        featureId: {
          type: 'string',
          description: 'The feature ID to set dependencies for',
        },
        dependencies: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of feature IDs that this feature depends on',
        },
      },
      required: ['projectPath', 'featureId', 'dependencies'],
    },
  },
  {
    name: 'get_dependency_graph',
    description:
      'Get the dependency graph for all features in a project. Shows which features block others.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'start_auto_mode',
    description:
      'Start auto-mode for a project. Agents will automatically pick up and process backlog features respecting dependencies.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        maxConcurrency: {
          type: 'number',
          description: 'Maximum number of features to process concurrently (default: 1)',
          default: 1,
        },
        branchName: {
          type: 'string',
          description: 'Optional branch/worktree name to run auto-mode on',
        },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'stop_auto_mode',
    description: 'Stop auto-mode for a project.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        branchName: {
          type: 'string',
          description: 'Optional branch/worktree name',
        },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'get_auto_mode_status',
    description: 'Check if auto-mode is running for a project and get its status.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'get_execution_order',
    description:
      'Get the resolved execution order for features based on dependencies. Useful for planning.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        status: {
          type: 'string',
          enum: ['backlog', 'all'],
          default: 'backlog',
          description: 'Which features to include in the execution order',
        },
      },
      required: ['projectPath'],
    },
  },

  // ========== Project Orchestration ==========
  {
    name: 'list_projects',
    description:
      'List all project plans in a project. Returns project slugs that can be used with get_project.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'get_project',
    description:
      'Get detailed information about a project plan including milestones, phases, and PRD.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        projectSlug: {
          type: 'string',
          description: 'The project slug (from list_projects)',
        },
      },
      required: ['projectPath', 'projectSlug'],
    },
  },
  {
    name: 'create_project',
    description:
      'Create a new project plan with milestones and phases. This scaffolds the project structure in .automaker/projects/.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        title: {
          type: 'string',
          description: 'Project title',
        },
        goal: {
          type: 'string',
          description: 'Project goal/objective',
        },
        prd: {
          type: 'object',
          description: 'SPARC PRD with situation, problem, approach, results, constraints',
          properties: {
            situation: { type: 'string' },
            problem: { type: 'string' },
            approach: { type: 'string' },
            results: { type: 'string' },
            constraints: { type: 'array', items: { type: 'string' } },
          },
        },
        milestones: {
          type: 'array',
          description: 'Array of milestones, each with title, description, and phases',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              description: { type: 'string' },
              phases: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    title: { type: 'string' },
                    description: { type: 'string' },
                    filesToModify: { type: 'array', items: { type: 'string' } },
                    acceptanceCriteria: { type: 'array', items: { type: 'string' } },
                    complexity: { type: 'string', enum: ['small', 'medium', 'large'] },
                  },
                },
              },
            },
          },
        },
      },
      required: ['projectPath', 'title', 'goal', 'milestones'],
    },
  },
  {
    name: 'update_project',
    description: 'Update a project plan. Can update title, goal, status, or PRD.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        projectSlug: {
          type: 'string',
          description: 'The project slug to update',
        },
        title: {
          type: 'string',
          description: 'New title (optional)',
        },
        goal: {
          type: 'string',
          description: 'New goal (optional)',
        },
        status: {
          type: 'string',
          enum: [
            'researching',
            'drafting',
            'reviewing',
            'approved',
            'scaffolded',
            'active',
            'completed',
          ],
          description: 'New status (optional)',
        },
      },
      required: ['projectPath', 'projectSlug'],
    },
  },
  {
    name: 'delete_project',
    description: 'Delete a project plan and all its files.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        projectSlug: {
          type: 'string',
          description: 'The project slug to delete',
        },
      },
      required: ['projectPath', 'projectSlug'],
    },
  },
  {
    name: 'create_project_features',
    description:
      'Create Kanban board features from a project plan. Converts phases to features with optional epic grouping.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        projectSlug: {
          type: 'string',
          description: 'The project slug to create features from',
        },
        createEpics: {
          type: 'boolean',
          default: true,
          description: 'Create epic features for each milestone',
        },
        setupDependencies: {
          type: 'boolean',
          default: true,
          description: 'Set up dependencies between features based on phase order',
        },
        initialStatus: {
          type: 'string',
          enum: ['backlog', 'in-progress'],
          default: 'backlog',
          description: 'Initial status for created features',
        },
      },
      required: ['projectPath', 'projectSlug'],
    },
  },

  // ========== Chief of Staff (CoS) ==========
  {
    name: 'submit_prd',
    description:
      'Submit a SPARC PRD from the Chief of Staff to the Project Manager for decomposition and execution. Creates a feature that enters the authority pipeline.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        title: {
          type: 'string',
          description: 'PRD title',
        },
        description: {
          type: 'string',
          description:
            'PRD description with situation, problem, approach, results, and constraints',
        },
        complexity: {
          type: 'string',
          enum: ['small', 'medium', 'large', 'architectural'],
          default: 'medium',
          description: 'Feature complexity level for model selection',
        },
        milestones: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              description: { type: 'string' },
            },
          },
          description: 'Optional array of milestones with title and description',
        },
      },
      required: ['projectPath', 'title', 'description'],
    },
  },

  // ========== Ralph Mode (Persistent Retry Loops) ==========
  {
    name: 'start_ralph_loop',
    description:
      'Start a Ralph loop for a feature. Ralph mode keeps retrying until all verification criteria pass. Never gives up until externally verified!',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        featureId: {
          type: 'string',
          description: 'The feature ID to start Ralph loop for',
        },
        config: {
          type: 'object',
          description: 'Optional Ralph loop configuration',
          properties: {
            maxIterations: {
              type: 'number',
              description: 'Maximum number of iterations before giving up (default: 10)',
            },
            iterationDelayMs: {
              type: 'number',
              description: 'Delay between iterations in milliseconds (default: 5000)',
            },
            completionCriteria: {
              type: 'array',
              description: 'Completion criteria to verify after each iteration',
              items: {
                type: 'object',
                properties: {
                  type: {
                    type: 'string',
                    enum: [
                      'tests_pass',
                      'build_succeeds',
                      'lint_passes',
                      'typecheck_passes',
                      'file_exists',
                      'file_contains',
                      'command_succeeds',
                      'http_endpoint',
                    ],
                  },
                  name: { type: 'string' },
                  required: { type: 'boolean' },
                  config: { type: 'object' },
                },
              },
            },
          },
        },
      },
      required: ['projectPath', 'featureId'],
    },
  },
  {
    name: 'stop_ralph_loop',
    description: 'Stop a running Ralph loop.',
    inputSchema: {
      type: 'object',
      properties: {
        featureId: {
          type: 'string',
          description: 'The feature ID of the running Ralph loop',
        },
      },
      required: ['featureId'],
    },
  },
  {
    name: 'pause_ralph_loop',
    description: 'Pause a running Ralph loop. Can be resumed later.',
    inputSchema: {
      type: 'object',
      properties: {
        featureId: {
          type: 'string',
          description: 'The feature ID of the running Ralph loop',
        },
      },
      required: ['featureId'],
    },
  },
  {
    name: 'resume_ralph_loop',
    description: 'Resume a paused Ralph loop.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        featureId: {
          type: 'string',
          description: 'The feature ID of the paused Ralph loop',
        },
      },
      required: ['projectPath', 'featureId'],
    },
  },
  {
    name: 'get_ralph_status',
    description:
      'Get the status of a Ralph loop including iteration history and verification results.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        featureId: {
          type: 'string',
          description: 'The feature ID',
        },
      },
      required: ['projectPath', 'featureId'],
    },
  },
  {
    name: 'list_running_ralph_loops',
    description: 'List all currently running Ralph loops across all projects.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  // ========== GitHub Operations ==========
  {
    name: 'merge_pr',
    description:
      'Merge a pull request using GitHub CLI. Supports different merge strategies (merge, squash, rebase) and can optionally wait for CI checks to pass before merging.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        prNumber: {
          type: 'number',
          description: 'PR number to merge',
        },
        strategy: {
          type: 'string',
          enum: ['merge', 'squash', 'rebase'],
          default: 'squash',
          description: 'Merge strategy to use (default: squash)',
        },
        waitForCI: {
          type: 'boolean',
          default: true,
          description: 'Whether to wait for CI checks to pass before merging (default: true)',
        },
      },
      required: ['projectPath', 'prNumber'],
    },
  },
  {
    name: 'check_pr_status',
    description:
      'Check the CI check status of a pull request. Returns information about passed, failed, and pending checks.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        prNumber: {
          type: 'number',
          description: 'PR number to check status for',
        },
      },
      required: ['projectPath', 'prNumber'],
    },
  },
  {
    name: 'resolve_review_threads',
    description:
      'Process and resolve CodeRabbit review threads for a PR. Fetches CodeRabbit comments, parses them, and links them to the associated feature for auto-remediation.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        prNumber: {
          type: 'number',
          description: 'PR number to process CodeRabbit feedback for',
        },
      },
      required: ['projectPath', 'prNumber'],
    },
  },

  // ========== Utilities ==========
  {
    name: 'setup_lab',
    description:
      'Initialize Automaker for a new repository. Creates .automaker/ directory structure (features/, context/, memory/), generates protolab.config with defaults, creates initial CLAUDE.md, and adds project to settings.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory to initialize',
        },
        research: {
          type: 'object',
          description:
            'Optional RepoResearchResult from research_repo. When provided, generates tech-stack-aware CLAUDE.md and coding-rules.md instead of generic templates.',
        },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'health_check',
    description: 'Check if the Automaker server is running and healthy.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_server_logs',
    description:
      'Read server log file directly from disk. Works even when the server is down — useful for diagnosing crashes, OOM errors, agent failures, and startup issues. Returns the last N lines of the server log.',
    inputSchema: {
      type: 'object',
      properties: {
        maxLines: {
          type: 'number',
          description:
            'Maximum number of lines to return (default: 200). Use -1 for unlimited. Returns the last N lines.',
        },
        filter: {
          type: 'string',
          description:
            'Optional text filter — only return lines containing this string (case-insensitive). Example: "ERROR", "OOM", "agent", "crash".',
        },
        since: {
          type: 'string',
          description:
            'Optional ISO timestamp — only return lines after this time. Example: "2026-02-12T10:00:00Z".',
        },
      },
    },
  },
  {
    name: 'get_board_summary',
    description: 'Get a summary of the board state showing feature counts by status.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'get_briefing',
    description:
      'Get a briefing digest of important events since last session. Returns events grouped by severity (critical, high, medium, low) for quick situation awareness. Use this when starting a session to understand what happened while you were away.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        timeRange: {
          type: 'string',
          enum: ['1h', '6h', '24h', '7d'],
          description:
            'Time range to retrieve events for (optional). If not specified, uses cursor from last briefing or defaults to 24h.',
        },
        since: {
          type: 'string',
          description:
            'ISO timestamp to retrieve events since (optional). Overrides timeRange and cursor if provided.',
        },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'graphite_restack',
    description:
      'Restack the entire branch stack on trunk using Graphite CLI. This rebases all branches in the stack when trunk (main) has changed, preventing merge conflicts during PR creation. Use this to sync feature branches with the latest main branch.',
    inputSchema: {
      type: 'object',
      properties: {
        worktreePath: {
          type: 'string',
          description: 'Absolute path to the worktree directory',
        },
      },
      required: ['worktreePath'],
    },
  },
  // ========== Worktree Management ==========
  {
    name: 'list_worktrees',
    description:
      'List all git worktrees for a project. Returns worktree paths, branches, and optionally PR info.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        includeDetails: {
          type: 'boolean',
          description: 'Include file change counts and PR info (default: false)',
        },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'get_worktree_status',
    description:
      'Get the git status of a specific worktree for a feature. Returns modified files, diff stats, and recent commits.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        featureId: {
          type: 'string',
          description: 'The feature ID to get worktree status for',
        },
      },
      required: ['projectPath', 'featureId'],
    },
  },
  {
    name: 'create_pr_from_worktree',
    description:
      'Commit, push, and create a PR from a worktree. Handles the full workflow: stage changes, commit, push branch, create GitHub PR.',
    inputSchema: {
      type: 'object',
      properties: {
        worktreePath: {
          type: 'string',
          description: 'Absolute path to the worktree directory',
        },
        projectPath: {
          type: 'string',
          description: 'Absolute path to the main project directory (optional)',
        },
        commitMessage: {
          type: 'string',
          description: 'Commit message (optional, auto-generated if not provided)',
        },
        prTitle: {
          type: 'string',
          description: 'PR title (optional, auto-generated if not provided)',
        },
        prBody: {
          type: 'string',
          description: 'PR body/description (optional)',
        },
        baseBranch: {
          type: 'string',
          description: 'Base branch for the PR (optional, defaults to main)',
        },
        draft: {
          type: 'boolean',
          description: 'Create as draft PR (default: false)',
        },
      },
      required: ['worktreePath'],
    },
  },
  // ========== Observability ==========
  {
    name: 'get_detailed_health',
    description:
      'Get detailed server health including memory usage, uptime, and environment info. Use this to monitor server resource consumption.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_settings',
    description:
      'Get global Automaker settings including theme, log level, auto-mode config, and project profiles.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'update_settings',
    description: 'Update global Automaker settings. Pass only the fields you want to change.',
    inputSchema: {
      type: 'object',
      properties: {
        settings: {
          type: 'object',
          description: 'Partial settings object with fields to update',
        },
      },
      required: ['settings'],
    },
  },
  {
    name: 'list_events',
    description:
      'List event history for a project with optional filtering by type, severity, feature, and date range.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        filter: {
          type: 'object',
          description:
            'Optional filter: { trigger?, severity?, featureId?, since?, until?, limit?, offset? }',
        },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'list_notifications',
    description:
      'List system notifications for a project. Returns unread notifications about feature completions, verifications, and agent events.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
      },
      required: ['projectPath'],
    },
  },
  // ========== Metrics ==========
  {
    name: 'get_project_metrics',
    description:
      'Get aggregated project metrics including cycle time, cost, throughput, success rate, and token usage.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'get_capacity_metrics',
    description:
      'Get capacity utilization metrics including concurrency, backlog size, and estimated backlog clearance time.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        maxConcurrency: {
          type: 'number',
          description: 'Maximum concurrent features for utilization calculation (default: 3)',
        },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'get_forecast',
    description:
      'Estimate duration and cost for a new feature based on historical averages scaled by complexity.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        complexity: {
          type: 'string',
          enum: ['small', 'medium', 'large', 'architectural'],
          description: 'Feature complexity level for forecast scaling (default: medium)',
        },
      },
      required: ['projectPath'],
    },
  },

  // ========== Discord DM ==========
  {
    name: 'send_discord_dm',
    description:
      'Send a direct message to a Discord user by username. Uses the Automaker Discord bot to deliver the DM.',
    inputSchema: {
      type: 'object',
      properties: {
        username: {
          type: 'string',
          description: 'Discord username to send the DM to (e.g., "chukz")',
        },
        content: {
          type: 'string',
          description: 'Message content to send',
        },
      },
      required: ['username', 'content'],
    },
  },
  {
    name: 'read_discord_dms',
    description:
      'Read recent direct messages with a Discord user by username. Returns messages from the DM channel between the bot and the user.',
    inputSchema: {
      type: 'object',
      properties: {
        username: {
          type: 'string',
          description: 'Discord username to read DMs from (e.g., "chukz")',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of messages to return (default: 10, max: 100)',
        },
      },
      required: ['username'],
    },
  },

  // ========== Agent Management ==========
  {
    name: 'list_agent_templates',
    description:
      'List all registered agent templates in the role registry. Optionally filter by role. Returns template summaries (name, displayName, description, role, tier, model, tags).',
    inputSchema: {
      type: 'object',
      properties: {
        role: {
          type: 'string',
          description:
            'Filter by role (e.g., "backend-engineer", "frontend-engineer", "chief-of-staff"). Omit to list all.',
        },
      },
    },
  },
  {
    name: 'get_agent_template',
    description:
      'Get the full configuration of a specific agent template by name. Returns all template fields including capabilities, assignments, and headsdown config.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Template name (kebab-case, e.g., "ava", "pm-agent")',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'register_agent_template',
    description:
      'Register a new agent template in the role registry. Template is validated against AgentTemplateSchema (Zod). Rejects duplicates and refuses to overwrite tier 0 (protected/system) templates.',
    inputSchema: {
      type: 'object',
      properties: {
        template: {
          type: 'object',
          description:
            'Full agent template object. Required fields: name (kebab-case), displayName, description, role. Optional: tier, model, tools, maxTurns, systemPrompt, trustLevel, capabilities, assignments, headsdownConfig, tags.',
        },
      },
      required: ['template'],
    },
  },
  {
    name: 'update_agent_template',
    description:
      'Update an existing agent template. Merges provided fields into the existing template. Cannot update tier 0 (protected) templates. Cannot change the template name.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name of the template to update',
        },
        updates: {
          type: 'object',
          description: 'Partial template fields to merge into existing template',
        },
      },
      required: ['name', 'updates'],
    },
  },
  {
    name: 'unregister_agent_template',
    description:
      'Remove an agent template from the registry. Refuses to unregister tier 0 (protected/system) templates.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name of the template to remove',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'execute_dynamic_agent',
    description:
      'Create and run a dynamic agent from a registered template. Resolves the template to a full agent config, then executes it with the given prompt. Returns the agent output, duration, and success status.',
    inputSchema: {
      type: 'object',
      properties: {
        templateName: {
          type: 'string',
          description: 'Name of the registered template to use',
        },
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        prompt: {
          type: 'string',
          description: 'The task/prompt for the agent to execute',
        },
        overrides: {
          type: 'object',
          description:
            'Optional field-level overrides (model, tools, maxTurns, etc.) applied on top of the template',
        },
        additionalSystemPrompt: {
          type: 'string',
          description: 'Additional system prompt to prepend to the template system prompt',
        },
      },
      required: ['templateName', 'projectPath', 'prompt'],
    },
  },
  {
    name: 'get_role_registry_status',
    description:
      'Get the current status of the role registry: total registered templates, list of template names and roles, and known built-in roles.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  // ========== Setup Pipeline ==========
  {
    name: 'research_repo',
    description:
      'Scan a repository to detect its current tech stack, structure, and configuration. Returns detailed research results including monorepo setup, frontend/backend frameworks, testing, CI/CD, and more. Pure heuristics, no AI calls.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the repository to scan',
        },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'analyze_gaps',
    description:
      'Compare repository research results against the ProtoLabs gold standard. Returns a structured gap analysis report with alignment score, gaps by severity (critical/recommended/optional), and compliant items.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        research: {
          type: 'object',
          description: 'RepoResearchResult from research_repo tool',
        },
        skipChecks: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of gap IDs to skip (e.g., ["storybook", "payload"])',
        },
      },
      required: ['projectPath', 'research'],
    },
  },
  {
    name: 'propose_alignment',
    description:
      'Convert gap analysis into alignment features organized into milestones. Optionally creates features on the Automaker board. Returns milestone breakdown with estimated effort.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        gapAnalysis: {
          type: 'object',
          description: 'GapAnalysisReport from analyze_gaps tool',
        },
        autoCreate: {
          type: 'boolean',
          description:
            'If true, creates features on the board immediately. Default: false (returns proposal for review).',
        },
      },
      required: ['projectPath', 'gapAnalysis'],
    },
  },
  {
    name: 'provision_discord',
    description:
      'Create Discord category and channels for a project. Creates a category named after the project with #general, #updates, and #dev channels.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        projectName: {
          type: 'string',
          description: 'Project name for the Discord category',
        },
        guildId: {
          type: 'string',
          description: 'Discord server (guild) ID',
        },
      },
      required: ['projectPath', 'projectName', 'guildId'],
    },
  },
  {
    name: 'setup_beads',
    description:
      'Initialize Beads task tracker for a project. Runs bd init and configures no-daemon mode. Idempotent - safe to call on already-initialized projects.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
      },
      required: ['projectPath'],
    },
  },
  // ========== Ceremonies ==========
  {
    name: 'trigger_ceremony',
    description:
      'Manually trigger a ceremony (standup, milestone retro, or project retro). Useful for retroactively generating ceremonies for already-completed milestones or projects.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        projectSlug: {
          type: 'string',
          description: 'Project slug',
        },
        milestoneSlug: {
          type: 'string',
          description: 'Milestone slug (required for standup and retro types)',
        },
        ceremonyType: {
          type: 'string',
          enum: ['standup', 'retro', 'project-retro'],
          description:
            'Type of ceremony: "standup" (milestone kickoff), "retro" (milestone completion), "project-retro" (full project retrospective)',
        },
      },
      required: ['projectPath', 'projectSlug', 'ceremonyType'],
    },
  },
  {
    name: 'run_full_setup',
    description:
      'Run the complete setup pipeline: research repo, analyze gaps, initialize .automaker, and generate proposal. This is a convenience wrapper that chains research_repo → analyze_gaps → setup_lab → propose_alignment.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        skipChecks: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of gap IDs to skip',
        },
        autoCreate: {
          type: 'boolean',
          description: 'If true, creates alignment features on the board. Default: false.',
        },
      },
      required: ['projectPath'],
    },
  },
];

// Tool implementations
async function handleTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    // Feature Management
    case 'list_features':
      return apiCall('/features/list', {
        projectPath: args.projectPath,
        status: args.status,
        compact: true, // Use compact mode to reduce response size
      });

    case 'get_feature': {
      const featureResult = (await apiCall('/features/get', {
        projectPath: args.projectPath,
        featureId: args.featureId,
      })) as { success?: boolean; feature?: Record<string, unknown> };
      // Strip heavy history fields to reduce context usage unless explicitly requested
      if (featureResult.feature && !args.includeHistory) {
        const f = featureResult.feature;
        const execHistory = f.executionHistory as unknown[] | undefined;
        const descHistory = f.descriptionHistory as unknown[] | undefined;
        if (execHistory?.length) {
          f.executionCount = execHistory.length;
          delete f.executionHistory;
        }
        if (descHistory?.length) {
          f.descriptionRevisions = descHistory.length;
          delete f.descriptionHistory;
        }
        delete f.statusHistory;
        delete f.planSpec;
      }
      return featureResult;
    }

    case 'create_feature': {
      const featureData: Record<string, unknown> = {
        title: args.title,
        description: args.description,
        status: args.status || 'backlog',
      };
      if (args.branchName) featureData.branchName = args.branchName;
      if (args.dependencies) featureData.dependencies = args.dependencies;
      if (args.isEpic) featureData.isEpic = args.isEpic;
      if (args.epicId) featureData.epicId = args.epicId;
      if (args.complexity) featureData.complexity = args.complexity;
      if (args.assignee !== undefined) featureData.assignee = args.assignee;
      if (args.dueDate !== undefined) featureData.dueDate = args.dueDate;
      if (args.priority !== undefined) featureData.priority = args.priority;
      return apiCall('/features/create', {
        projectPath: args.projectPath,
        feature: featureData,
      });
    }

    case 'update_feature': {
      const updates: Record<string, unknown> = {};
      if (args.title) updates.title = args.title;
      if (args.description) updates.description = args.description;
      if (args.status) updates.status = args.status;
      if (args.complexity) updates.complexity = args.complexity;
      if (args.assignee !== undefined) updates.assignee = args.assignee;
      if (args.dueDate !== undefined) updates.dueDate = args.dueDate;
      if (args.priority !== undefined) updates.priority = args.priority;
      return apiCall('/features/update', {
        projectPath: args.projectPath,
        featureId: args.featureId,
        updates,
      });
    }

    case 'delete_feature':
      return apiCall('/features/delete', {
        projectPath: args.projectPath,
        featureId: args.featureId,
      });

    case 'move_feature':
      return apiCall('/features/update', {
        projectPath: args.projectPath,
        featureId: args.featureId,
        updates: { status: args.status },
      });

    case 'update_feature_git_settings': {
      const gitWorkflow: Record<string, unknown> = {};
      if (args.autoCommit !== undefined) gitWorkflow.autoCommit = args.autoCommit;
      if (args.autoPush !== undefined) gitWorkflow.autoPush = args.autoPush;
      if (args.autoCreatePR !== undefined) gitWorkflow.autoCreatePR = args.autoCreatePR;
      if (args.autoMergePR !== undefined) gitWorkflow.autoMergePR = args.autoMergePR;
      if (args.prMergeStrategy !== undefined) gitWorkflow.prMergeStrategy = args.prMergeStrategy;
      if (args.waitForCI !== undefined) gitWorkflow.waitForCI = args.waitForCI;
      if (args.prBaseBranch !== undefined) gitWorkflow.prBaseBranch = args.prBaseBranch;
      return apiCall('/features/update', {
        projectPath: args.projectPath,
        featureId: args.featureId,
        updates: { gitWorkflow },
      });
    }

    // Agent Control
    case 'start_agent':
      return apiCall('/auto-mode/run-feature', {
        projectPath: args.projectPath,
        featureId: args.featureId,
        useWorktrees: args.useWorktrees ?? true,
      });

    case 'stop_agent':
      return apiCall('/auto-mode/stop-feature', {
        featureId: args.featureId,
      });

    case 'list_running_agents':
      return apiCall('/running-agents', {}, 'GET');

    case 'get_agent_output': {
      const agentOutput = (await apiCall('/features/agent-output', {
        projectPath: args.projectPath,
        featureId: args.featureId,
      })) as { success?: boolean; content?: string };
      // Truncate to last N lines to prevent context window bloat
      const maxLines = (args.maxLines as number) ?? 200;
      if (agentOutput.content && maxLines > 0) {
        const lines = agentOutput.content.split('\n');
        if (lines.length > maxLines) {
          agentOutput.content = [
            `[Truncated: showing last ${maxLines} of ${lines.length} lines. Use maxLines: -1 for full output]`,
            '',
            ...lines.slice(-maxLines),
          ].join('\n');
        }
      }
      return agentOutput;
    }

    case 'send_message_to_agent':
      return apiCall('/auto-mode/follow-up-feature', {
        projectPath: args.projectPath,
        featureId: args.featureId,
        prompt: args.message,
        useWorktrees: true,
      });

    // Queue Management
    case 'queue_feature':
      return apiCall('/agent/queue/add', {
        projectPath: args.projectPath,
        featureId: args.featureId,
      });

    case 'list_queue':
      return apiCall('/agent/queue/list', {});

    case 'clear_queue':
      return apiCall('/agent/queue/clear', {});

    // Context Files
    case 'list_context_files':
      return apiCall('/context/list', {
        projectPath: args.projectPath,
      });

    case 'get_context_file':
      return apiCall('/context/get', {
        projectPath: args.projectPath,
        filename: args.filename,
      });

    case 'create_context_file':
      return apiCall('/context/create', {
        projectPath: args.projectPath,
        filename: args.filename,
        content: args.content,
      });

    case 'delete_context_file':
      return apiCall('/context/delete', {
        projectPath: args.projectPath,
        filename: args.filename,
      });

    // Skills
    case 'list_skills':
      return apiCall('/skills/list', {
        projectPath: args.projectPath,
      });

    case 'get_skill':
      return apiCall('/skills/get', {
        projectPath: args.projectPath,
        skillName: args.skillName,
      });

    case 'create_skill':
      return apiCall('/skills/create', {
        projectPath: args.projectPath,
        name: args.name,
        description: args.description,
        content: args.content,
        emoji: args.emoji,
        tags: args.tags,
      });

    case 'delete_skill':
      return apiCall('/skills/delete', {
        projectPath: args.projectPath,
        skillName: args.skillName,
      });

    // Project Spec
    case 'get_project_spec':
      return apiCall('/app-spec/get', {
        projectPath: args.projectPath,
      });

    case 'update_project_spec':
      return apiCall('/app-spec/update', {
        projectPath: args.projectPath,
        content: args.content,
      });

    // Orchestration
    case 'set_feature_dependencies':
      return apiCall('/features/update', {
        projectPath: args.projectPath,
        featureId: args.featureId,
        updates: {
          dependencies: args.dependencies,
        },
      });

    case 'get_dependency_graph': {
      const result = (await apiCall('/features/list', {
        projectPath: args.projectPath,
      })) as {
        features?: Array<{ id: string; title: string; status: string; dependencies?: string[] }>;
      };
      const features = result.features || [];
      const graph: Record<
        string,
        { title: string; status: string; dependsOn: string[]; blocks: string[] }
      > = {};

      // Build the graph
      for (const f of features) {
        graph[f.id] = {
          title: f.title,
          status: f.status,
          dependsOn: f.dependencies || [],
          blocks: [],
        };
      }

      // Calculate reverse dependencies (what each feature blocks)
      for (const f of features) {
        for (const depId of f.dependencies || []) {
          if (graph[depId]) {
            graph[depId].blocks.push(f.id);
          }
        }
      }

      return graph;
    }

    case 'start_auto_mode':
      return apiCall('/auto-mode/start', {
        projectPath: args.projectPath,
        maxConcurrency: args.maxConcurrency || 1,
        branchName: args.branchName || null,
      });

    case 'stop_auto_mode':
      return apiCall('/auto-mode/stop', {
        projectPath: args.projectPath,
        branchName: args.branchName || null,
      });

    case 'get_auto_mode_status':
      return apiCall('/auto-mode/status', {
        projectPath: args.projectPath,
      });

    case 'get_execution_order': {
      const result = (await apiCall('/features/list', {
        projectPath: args.projectPath,
      })) as {
        features?: Array<{ id: string; title: string; status: string; dependencies?: string[] }>;
      };
      const features = result.features || [];

      // Filter by status if specified
      const filtered =
        args.status === 'all' ? features : features.filter((f) => f.status === 'backlog');

      // Topological sort based on dependencies
      const visited = new Set<string>();
      const order: Array<{ id: string; title: string; dependencies: string[] }> = [];
      const featureMap = new Map(filtered.map((f) => [f.id, f]));

      function visit(id: string) {
        if (visited.has(id)) return;
        visited.add(id);
        const feature = featureMap.get(id);
        if (!feature) return;
        for (const depId of feature.dependencies || []) {
          visit(depId);
        }
        order.push({
          id: feature.id,
          title: feature.title,
          dependencies: feature.dependencies || [],
        });
      }

      for (const f of filtered) {
        visit(f.id);
      }

      return { executionOrder: order, totalFeatures: order.length };
    }

    // Project Orchestration
    case 'list_projects':
      return apiCall('/projects/list', {
        projectPath: args.projectPath,
      });

    case 'get_project':
      return apiCall('/projects/get', {
        projectPath: args.projectPath,
        projectSlug: args.projectSlug,
      });

    case 'create_project':
      return apiCall('/projects/create', {
        projectPath: args.projectPath,
        title: args.title,
        goal: args.goal,
        prd: args.prd,
        milestones: args.milestones,
      });

    case 'update_project': {
      const projectUpdates: Record<string, unknown> = {};
      if (args.title) projectUpdates.title = args.title;
      if (args.goal) projectUpdates.goal = args.goal;
      if (args.status) projectUpdates.status = args.status;
      return apiCall('/projects/update', {
        projectPath: args.projectPath,
        projectSlug: args.projectSlug,
        updates: projectUpdates,
      });
    }

    case 'delete_project':
      return apiCall('/projects/delete', {
        projectPath: args.projectPath,
        projectSlug: args.projectSlug,
      });

    case 'create_project_features':
      return apiCall('/projects/create-features', {
        projectPath: args.projectPath,
        projectSlug: args.projectSlug,
        createEpics: args.createEpics ?? true,
        setupDependencies: args.setupDependencies ?? true,
        initialStatus: args.initialStatus || 'backlog',
      });

    // Chief of Staff (CoS)
    case 'submit_prd':
      return apiCall('/cos/submit-prd', {
        projectPath: args.projectPath,
        title: args.title,
        description: args.description,
        complexity: args.complexity || 'medium',
        milestones: args.milestones,
      });

    // Ralph Mode
    case 'start_ralph_loop':
      return apiCall('/ralph/start', {
        projectPath: args.projectPath,
        featureId: args.featureId,
        config: args.config,
      });

    case 'stop_ralph_loop':
      return apiCall('/ralph/stop', {
        featureId: args.featureId,
      });

    case 'pause_ralph_loop':
      return apiCall('/ralph/pause', {
        featureId: args.featureId,
      });

    case 'resume_ralph_loop':
      return apiCall('/ralph/resume', {
        projectPath: args.projectPath,
        featureId: args.featureId,
      });

    case 'get_ralph_status':
      return apiCall('/ralph/status', {
        projectPath: args.projectPath,
        featureId: args.featureId,
      });

    case 'list_running_ralph_loops':
      return apiCall('/ralph/list-running', {});

    // Utilities
    case 'setup_lab':
      return apiCall('/setup/project', {
        projectPath: args.projectPath,
        research: args.research,
      });

    case 'health_check': {
      const response = await fetch(`${API_URL}/api/health`);
      return response.json();
    }

    case 'get_server_logs': {
      // Read directly from disk — works even when server is down
      const fs = await import('fs');
      const path = await import('path');

      // Resolve log file path: DATA_DIR/server.log
      const dataDir =
        process.env.DATA_DIR || path.join(process.env.AUTOMAKER_ROOT || process.cwd(), 'data');
      const logPath = path.join(dataDir, 'server.log');

      if (!fs.existsSync(logPath)) {
        return {
          success: false,
          error: `Server log file not found at ${logPath}. The server may not have been started with file logging enabled.`,
          logPath,
        };
      }

      const maxLines = (args.maxLines as number) || 200;
      const filterText = args.filter as string | undefined;
      const sinceTimestamp = args.since as string | undefined;

      const content = fs.readFileSync(logPath, 'utf-8');
      let lines = content.split('\n').filter((l: string) => l.length > 0);

      // Filter by timestamp if provided
      if (sinceTimestamp) {
        const sinceDate = new Date(sinceTimestamp);
        lines = lines.filter((line: string) => {
          const match = line.match(/^\[(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)\]/);
          if (!match) return true; // Keep non-timestamped lines (markers, separators)
          const lineDate = new Date(match[1]);
          return lineDate >= sinceDate;
        });
      }

      // Filter by text content if provided
      if (filterText) {
        const lowerFilter = filterText.toLowerCase();
        lines = lines.filter((line: string) => line.toLowerCase().includes(lowerFilter));
      }

      // Take last N lines
      const totalLines = lines.length;
      if (maxLines > 0 && lines.length > maxLines) {
        lines = lines.slice(-maxLines);
      }

      const stats = fs.statSync(logPath);

      return {
        success: true,
        logPath,
        fileSize: `${(stats.size / 1024).toFixed(1)} KB`,
        totalLines,
        returnedLines: lines.length,
        truncated: maxLines > 0 && totalLines > maxLines,
        content: lines.join('\n'),
      };
    }

    case 'get_briefing': {
      const digestResult = await apiCall('/briefing/digest', {
        projectPath: args.projectPath,
        timeRange: args.timeRange,
        since: args.since,
      });
      // Auto-acknowledge to advance cursor after successful digest
      await apiCall('/briefing/ack', {
        projectPath: args.projectPath,
      }).catch(() => {
        /* ack failure is non-critical */
      });
      return digestResult;
    }

    case 'get_board_summary': {
      const result = (await apiCall('/features/list', {
        projectPath: args.projectPath,
      })) as { features?: Array<{ status: string }> };
      const features = result.features || [];
      const summary = {
        total: features.length,
        backlog: features.filter((f) => f.status === 'backlog').length,
        inProgress: features.filter((f) => f.status === 'in-progress').length,
        review: features.filter((f) => f.status === 'review').length,
        done: features.filter((f) => f.status === 'done').length,
      };
      return summary;
    }

    case 'graphite_restack':
      return apiCall('/worktree/graphite-restack', {
        worktreePath: args.worktreePath,
      });

    // GitHub Operations
    case 'merge_pr':
      return apiCall('/github/merge-pr', {
        projectPath: args.projectPath,
        prNumber: args.prNumber,
        strategy: args.strategy || 'squash',
        waitForCI: args.waitForCI ?? true,
      });

    case 'check_pr_status':
      return apiCall('/github/check-pr-status', {
        projectPath: args.projectPath,
        prNumber: args.prNumber,
      });

    case 'resolve_review_threads':
      return apiCall('/github/process-coderabbit-feedback', {
        projectPath: args.projectPath,
        prNumber: args.prNumber,
      });

    // Ceremonies
    case 'trigger_ceremony':
      return apiCall('/ceremonies/trigger', {
        projectPath: args.projectPath,
        projectSlug: args.projectSlug,
        milestoneSlug: args.milestoneSlug,
        ceremonyType: args.ceremonyType,
      });

    // Worktree Management
    case 'list_worktrees':
      return apiCall('/worktree/list', {
        projectPath: args.projectPath,
        includeDetails: args.includeDetails ?? false,
      });

    case 'get_worktree_status':
      return apiCall('/worktree/status', {
        projectPath: args.projectPath,
        featureId: args.featureId,
      });

    case 'create_pr_from_worktree':
      return apiCall('/worktree/create-pr', {
        worktreePath: args.worktreePath,
        projectPath: args.projectPath,
        commitMessage: args.commitMessage,
        prTitle: args.prTitle,
        prBody: args.prBody,
        baseBranch: args.baseBranch,
        draft: args.draft,
      });

    // Observability
    case 'get_detailed_health':
      return apiCall('/health/detailed', {}, 'GET');

    case 'get_settings':
      return apiCall('/settings/global', {}, 'GET');

    case 'update_settings': {
      const settingsBody = (args.settings || {}) as Record<string, unknown>;
      const options: RequestInit = {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY,
        },
        body: JSON.stringify(settingsBody),
      };
      const response = await fetch(`${API_URL}/api/settings/global`, options);
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`API error ${response.status}: ${text}`);
      }
      return response.json();
    }

    case 'list_events':
      return apiCall('/event-history/list', {
        projectPath: args.projectPath,
        filter: args.filter,
      });

    case 'list_notifications':
      return apiCall('/notifications/list', {
        projectPath: args.projectPath,
      });

    // Metrics
    case 'get_project_metrics':
      return apiCall('/metrics/summary', {
        projectPath: args.projectPath,
      });

    case 'get_capacity_metrics':
      return apiCall('/metrics/capacity', {
        projectPath: args.projectPath,
        maxConcurrency: args.maxConcurrency,
      });

    case 'get_forecast':
      return apiCall('/metrics/forecast', {
        projectPath: args.projectPath,
        complexity: args.complexity || 'medium',
      });

    // Discord DM
    case 'send_discord_dm':
      return apiCall('/discord/send-dm', {
        username: args.username,
        content: args.content,
      });

    case 'read_discord_dms':
      return apiCall('/discord/read-dms', {
        username: args.username,
        limit: args.limit || 10,
      });

    // Agent Management
    case 'list_agent_templates':
      return apiCall('/agents/templates/list', {
        role: args.role,
      });

    case 'get_agent_template':
      return apiCall('/agents/templates/get', {
        name: args.name,
      });

    case 'register_agent_template':
      return apiCall('/agents/templates/register', {
        template: args.template,
      });

    case 'update_agent_template':
      return apiCall('/agents/templates/update', {
        name: args.name,
        updates: args.updates,
      });

    case 'unregister_agent_template':
      return apiCall('/agents/templates/unregister', {
        name: args.name,
      });

    case 'execute_dynamic_agent':
      return apiCall('/agents/execute', {
        templateName: args.templateName,
        projectPath: args.projectPath,
        prompt: args.prompt,
        overrides: args.overrides,
        additionalSystemPrompt: args.additionalSystemPrompt,
      });

    case 'get_role_registry_status': {
      // List all templates to build status overview
      const templatesResult = (await apiCall('/agents/templates/list', {})) as {
        templates?: Array<{ name: string; role: string; tier: number }>;
        count?: number;
      };
      return {
        success: true,
        totalTemplates: templatesResult.count || 0,
        templates: (templatesResult.templates || []).map((t) => ({
          name: t.name,
          role: t.role,
          tier: t.tier,
        })),
      };
    }

    // Setup Pipeline
    case 'research_repo':
      return apiCall('/setup/research', {
        projectPath: args.projectPath,
      });

    case 'analyze_gaps':
      return apiCall('/setup/gap-analysis', {
        projectPath: args.projectPath,
        research: args.research,
        skipChecks: args.skipChecks,
      });

    case 'propose_alignment':
      return apiCall('/setup/propose', {
        projectPath: args.projectPath,
        gapAnalysis: args.gapAnalysis,
        autoCreate: args.autoCreate ?? false,
      });

    case 'provision_discord':
      return apiCall('/setup/discord-provision', {
        projectPath: args.projectPath,
        projectName: args.projectName,
        guildId: args.guildId,
      });

    case 'setup_beads':
      return apiCall('/setup/beads', {
        projectPath: args.projectPath,
      });

    case 'run_full_setup': {
      // Chain: research → gap analysis → setup lab → propose
      const researchResult = (await apiCall('/setup/research', {
        projectPath: args.projectPath,
      })) as { success?: boolean; research?: Record<string, unknown> };

      if (!researchResult.success || !researchResult.research) {
        return { success: false, error: 'Research phase failed', research: researchResult };
      }

      const gapResult = (await apiCall('/setup/gap-analysis', {
        projectPath: args.projectPath,
        research: researchResult.research,
        skipChecks: args.skipChecks,
      })) as { success?: boolean; report?: Record<string, unknown> };

      if (!gapResult.success || !gapResult.report) {
        return {
          success: false,
          error: 'Gap analysis phase failed',
          research: researchResult.research,
          gapAnalysis: gapResult,
        };
      }

      // Initialize .automaker (pass research for smart context generation)
      const setupResult = await apiCall('/setup/project', {
        projectPath: args.projectPath,
        research: researchResult.research,
      });

      // Generate proposal
      const proposalResult = (await apiCall('/setup/propose', {
        projectPath: args.projectPath,
        gapAnalysis: gapResult.report,
        autoCreate: args.autoCreate ?? false,
      })) as { success?: boolean; proposal?: Record<string, unknown> };

      return {
        success: true,
        research: researchResult.research,
        gapAnalysis: gapResult.report,
        setup: setupResult,
        proposal: proposalResult.proposal,
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// Create and run server
async function main() {
  const server = new Server(
    {
      name: 'automaker-mcp-server',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List tools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools,
  }));

  // Call tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      const result = await handleTool(name, (args as Record<string, unknown>) || {});
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${message}`,
          },
        ],
        isError: true,
      };
    }
  });

  // Start server
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('Automaker MCP Server running on stdio');
}

main().catch(console.error);
