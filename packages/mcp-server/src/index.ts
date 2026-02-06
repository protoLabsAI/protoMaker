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
          type: 'string',
          description:
            "Who this feature is assigned to. If set to a human name (e.g., 'josh'), auto-mode will skip this feature. If set to 'agent' or undefined, auto-mode can pick it up.",
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

  // ========== Utilities ==========
  {
    name: 'health_check',
    description: 'Check if the Automaker server is running and healthy.',
    inputSchema: {
      type: 'object',
      properties: {},
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
];

// Tool implementations
async function handleTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    // Feature Management
    case 'list_features':
      return apiCall('/features/list', {
        projectPath: args.projectPath,
        status: args.status,
      });

    case 'get_feature':
      return apiCall('/features/get', {
        projectPath: args.projectPath,
        featureId: args.featureId,
      });

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

    case 'get_agent_output':
      return apiCall('/features/agent-output', {
        projectPath: args.projectPath,
        featureId: args.featureId,
      });

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
    case 'health_check': {
      const response = await fetch(`${API_URL}/api/health`);
      return response.json();
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
