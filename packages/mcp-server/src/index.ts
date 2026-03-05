#!/usr/bin/env node
/**
 * Automaker MCP Server
 *
 * Exposes Automaker's board and feature management via MCP protocol.
 * Allows Claude Code and other MCP clients to interact with Automaker programmatically.
 *
 * Usage:
 *   npx @protolabsai/mcp-server
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
import { toMCPTool } from '@protolabsai/tools';

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

  // Build URL with query params for GET requests, body for POST
  let url = `${API_URL}/api${endpoint}`;
  if (method === 'GET' && Object.keys(body).length > 0) {
    const params = new URLSearchParams();
    Object.entries(body).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.append(key, String(value));
      }
    });
    url += `?${params.toString()}`;
  } else if (method === 'POST') {
    options.body = JSON.stringify(body);
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

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

// Import all tool modules
import { featureTools } from './tools/feature-tools.js';
import { agentTools } from './tools/agent-tools.js';
import { queueTools } from './tools/queue-tools.js';
import { contextTools } from './tools/context-tools.js';
import { orchestrationTools } from './tools/orchestration-tools.js';
import { projectTools } from './tools/project-tools.js';
import { gitTools } from './tools/git-tools.js';
import { observabilityTools } from './tools/observability-tools.js';
import { contentTools } from './tools/content-tools.js';
import { integrationTools } from './tools/integration-tools.js';
import { workspaceTools } from './tools/workspace-tools.js';
import { setupTools } from './tools/setup-tools.js';
import { utilityTools } from './tools/utility-tools.js';
import { schedulerTools } from './tools/scheduler-tools.js';
import { calendarTools } from './tools/calendar-tools.js';
import { quarantineTools } from './tools/quarantine-tools.js';
import { fileOpsTools } from './tools/file-ops-tools.js';
import { gitOpsTools } from './tools/git-ops-tools.js';
import { worktreeGitTools } from './tools/worktree-git-tools.js';
import { promotionTools } from './tools/promotion-tools.js';
import { leadEngineerTools } from './tools/lead-engineer-tools.js';

// Aggregate all tools
const tools: Tool[] = [
  ...featureTools,
  ...agentTools,
  ...queueTools,
  ...contextTools,
  ...orchestrationTools,
  ...projectTools,
  ...gitTools,
  ...gitOpsTools,
  ...observabilityTools,
  ...contentTools,
  ...integrationTools,
  ...workspaceTools,
  ...setupTools,
  ...utilityTools,
  ...schedulerTools,
  ...calendarTools,
  ...quarantineTools,
  ...fileOpsTools,
  ...worktreeGitTools,
  ...promotionTools,
  ...leadEngineerTools,
];

// Tool implementations
async function handleTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    // Feature Management
    case 'list_features':
      return apiCall('/features/list', {
        projectPath: args.projectPath,
        status: args.status,
        projectSlug: args.projectSlug,
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
      if (args.isFoundation !== undefined) featureData.isFoundation = args.isFoundation;
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
      if (args.isFoundation !== undefined) updates.isFoundation = args.isFoundation;
      if (args.statusChangeReason) updates.statusChangeReason = args.statusChangeReason;
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
        forceStart: args.forceStart || false,
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

    case 'archive_project':
      return apiCall('/projects/archive', {
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
        category: args.category,
        milestones: args.milestones,
      });

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
      const result = (await apiCall('/features/summary', {
        projectPath: args.projectPath,
      })) as { summary?: Record<string, number> };
      return result.summary ?? result;
    }

    // Git Operations
    case 'git_enhanced_status':
      return apiCall('/git/enhanced-status', { projectPath: args.projectPath });

    case 'git_stage_files':
      return apiCall('/git/stage-files', {
        projectPath: args.projectPath,
        files: args.files,
      });

    case 'git_file_details':
      return apiCall('/git/details', {
        projectPath: args.projectPath,
        filePath: args.filePath,
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

    case 'get_pr_feedback':
      return apiCall('/github/get-pr-feedback', {
        projectPath: args.projectPath,
        prNumber: args.prNumber,
        includeInlineThreads: args.includeInlineThreads ?? false,
      });

    case 'resolve_pr_threads':
      return apiCall('/github/resolve-pr-threads', {
        projectPath: args.projectPath,
        prNumber: args.prNumber,
        minSeverity: args.minSeverity ?? 'low',
      });

    // Escalation
    case 'get_escalation_status':
      return apiCall('/escalation/status', {}, 'GET');

    case 'get_escalation_log':
      return apiCall(
        '/escalation/log',
        {
          limit: args.limit ?? 100,
        },
        'GET'
      );

    case 'acknowledge_escalation':
      return apiCall('/escalation/acknowledge', {
        signalId: args.signalId,
        acknowledgedBy: args.acknowledgedBy,
        notes: args.notes,
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

    case 'worktree_cherry_pick':
      return apiCall('/worktree/cherry-pick', {
        worktreePath: args.worktreePath,
        commits: args.commits,
      });

    case 'worktree_abort_operation':
      return apiCall('/worktree/abort-operation', {
        worktreePath: args.worktreePath,
      });

    case 'worktree_continue_operation':
      return apiCall('/worktree/continue-operation', {
        worktreePath: args.worktreePath,
      });

    case 'get_pr_review_comments':
      return apiCall('/github/pr-review-comments', {
        projectPath: args.projectPath,
        prNumber: args.prNumber,
        includeResolved: args.includeResolved ?? false,
      });

    case 'resolve_pr_comment':
      return apiCall('/github/resolve-pr-comment', {
        projectPath: args.projectPath,
        threadId: args.threadId,
      });

    case 'worktree_stash_push':
      return apiCall('/worktree/stash-push', {
        worktreePath: args.worktreePath,
        message: args.message,
        files: args.files,
      });

    case 'worktree_stash_list':
      return apiCall('/worktree/stash-list', { worktreePath: args.worktreePath });

    case 'worktree_stash_apply':
      return apiCall('/worktree/stash-apply', {
        worktreePath: args.worktreePath,
        stashRef: args.stashRef,
      });

    case 'worktree_stash_drop':
      return apiCall('/worktree/stash-drop', {
        worktreePath: args.worktreePath,
        stashRef: args.stashRef,
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

    case 'run_full_setup': {
      // Step 1: Detect if projectPath is a git URL and clone if needed
      let projectPath = args.projectPath as string;
      let wasCloned = false;
      let originalGitUrl: string | undefined;

      const isGitUrl = (path: string): boolean => {
        return (
          path.startsWith('https://') ||
          path.startsWith('git@') ||
          path.startsWith('git://') ||
          path.endsWith('.git')
        );
      };

      if (isGitUrl(projectPath)) {
        originalGitUrl = projectPath;
        const cloneResult = (await apiCall('/setup/clone', {
          gitUrl: projectPath,
          shallow: true,
        })) as { success?: boolean; path?: string; message?: string };

        if (!cloneResult.success || !cloneResult.path) {
          return {
            success: false,
            error: 'Failed to clone repository',
            cloneResult,
          };
        }

        projectPath = cloneResult.path;
        wasCloned = true;
      }

      // Chain: research → gap analysis → generate report → setup lab → propose
      const researchResult = (await apiCall('/setup/research', {
        projectPath,
      })) as { success?: boolean; research?: Record<string, unknown> };

      if (!researchResult.success || !researchResult.research) {
        return { success: false, error: 'Research phase failed', research: researchResult };
      }

      const gapResult = (await apiCall('/setup/gap-analysis', {
        projectPath,
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

      // Generate HTML report
      const reportResult = (await apiCall('/setup/report', {
        projectPath,
        research: researchResult.research,
        report: gapResult.report,
      })) as { success?: boolean; reportPath?: string };

      // Initialize .automaker (pass research for smart context generation)
      const setupResult = await apiCall('/setup/project', {
        projectPath,
        research: researchResult.research,
      });

      // Generate proposal
      const proposalResult = (await apiCall('/setup/propose', {
        projectPath,
        gapAnalysis: gapResult.report,
        autoCreate: args.autoCreate ?? false,
      })) as { success?: boolean; proposal?: Record<string, unknown> };

      return {
        success: true,
        wasCloned,
        originalGitUrl,
        projectPath,
        research: researchResult.research,
        gapAnalysis: gapResult.report,
        reportPath: reportResult.reportPath,
        setup: setupResult,
        proposal: proposalResult.proposal,
      };
    }

    // Content Pipeline
    case 'create_content':
      return apiCall('/content/create', {
        projectPath: args.projectPath,
        topic: args.topic,
        contentConfig: args.contentConfig,
      });

    case 'get_content_status':
      return apiCall('/content/status', {
        runId: args.runId,
      });

    case 'list_content':
      return apiCall('/content/list', {
        projectPath: args.projectPath,
        filters: args.filters,
      });

    case 'review_content':
      return apiCall('/content/review', {
        projectPath: args.projectPath,
        runId: args.runId,
        gate: args.gate,
        decision: args.decision,
        feedback: args.feedback,
      });

    case 'export_content':
      return apiCall('/content/export', {
        projectPath: args.projectPath,
        runId: args.runId,
        format: args.format,
      });

    case 'execute_antagonistic_review': {
      // Parse SPARC sections from the description text
      const desc = String(args.prdDescription || '');
      const parseSparc = (text: string) => {
        const extract = (label: string) => {
          const re = new RegExp(`##\\s*${label}[\\s\\S]*?\\n([\\s\\S]*?)(?=\\n##\\s|$)`, 'i');
          const m = text.match(re);
          return m ? m[1].trim() : '';
        };
        const situation = extract('Situation');
        const problem = extract('Problem');
        const approach = extract('Approach');
        const results = extract('Results');
        const constraints = extract('Constraints');
        // If no SPARC sections found, use full text as situation
        if (!situation && !problem && !approach && !results) {
          return { situation: text, problem: text, approach: text, results: text, constraints: '' };
        }
        return { situation, problem, approach, results, constraints };
      };
      return apiCall('/flows/antagonistic-review/execute', {
        projectPath: args.projectPath,
        prd: parseSparc(desc),
        config: args.config,
      });
    }

    // Project Lifecycle
    case 'initiate_project':
      return apiCall('/projects/lifecycle/initiate', {
        projectPath: args.projectPath,
        title: args.title,
        ideaDescription: args.ideaDescription,
      });

    case 'generate_project_prd':
      return apiCall('/projects/lifecycle/generate-prd', {
        projectPath: args.projectPath,
        projectSlug: args.projectSlug,
        additionalContext: args.additionalContext,
      });

    case 'approve_project_prd':
      return apiCall('/projects/lifecycle/approve-prd', {
        projectPath: args.projectPath,
        projectSlug: args.projectSlug,
        createEpics: args.createEpics ?? true,
        setupDependencies: args.setupDependencies ?? true,
      });

    case 'launch_project':
      return apiCall('/projects/lifecycle/launch', {
        projectPath: args.projectPath,
        projectSlug: args.projectSlug,
        maxConcurrency: args.maxConcurrency,
      });

    case 'get_lifecycle_status':
      return apiCall('/projects/lifecycle/status', {
        projectPath: args.projectPath,
        projectSlug: args.projectSlug,
      });

    // Lead Engineer (Production Phase)
    case 'start_lead_engineer':
      return apiCall('/lead-engineer/start', {
        projectPath: args.projectPath,
        projectSlug: args.projectSlug,
        maxConcurrency: args.maxConcurrency,
      });

    case 'stop_lead_engineer':
      return apiCall('/lead-engineer/stop', {
        projectPath: args.projectPath,
      });

    case 'get_lead_engineer_status':
      return apiCall('/lead-engineer/status', {
        projectPath: args.projectPath,
      });

    // ProtoLabs Setup Pipeline
    case 'generate_report':
      return apiCall('/setup/report', {
        projectPath: args.projectPath,
        research: args.research,
        report: args.report,
      });

    case 'open_report':
      return apiCall('/setup/open-report', {
        reportPath: args.reportPath,
      });

    // Labs Management
    case 'clone_repo':
      return apiCall('/setup/clone', {
        gitUrl: args.gitUrl,
        directoryName: args.directoryName,
        shallow: args.shallow ?? true,
      });

    case 'deliver_alignment':
      return apiCall('/setup/deliver', {
        clientRepoUrl: args.clientRepoUrl,
        scoreBefore: args.scoreBefore,
        scoreAfter: args.scoreAfter,
        gapsSummary: args.gapsSummary,
        changesMade: args.changesMade,
        alignmentPerformed: args.alignmentPerformed ?? false,
      });

    // Langfuse Observability
    case 'langfuse_list_traces':
      return apiCall('/langfuse/traces', {
        page: args.page,
        limit: args.limit,
        name: args.name,
        tags: args.tags,
        userId: args.userId,
        sessionId: args.sessionId,
        fromTimestamp: args.fromTimestamp,
        toTimestamp: args.toTimestamp,
      });

    case 'langfuse_get_trace':
      return apiCall('/langfuse/traces/detail', {
        traceId: args.traceId,
      });

    case 'langfuse_get_costs':
      return apiCall('/langfuse/costs', {
        page: args.page,
        limit: args.limit,
        type: args.type,
        model: args.model,
        fromStartTime: args.fromStartTime,
        toStartTime: args.toStartTime,
      });

    case 'langfuse_list_prompts':
      return apiCall('/langfuse/prompts', {
        page: args.page,
        limit: args.limit,
        name: args.name,
        label: args.label,
        version: args.version,
      });

    case 'langfuse_score_trace':
      return apiCall('/langfuse/scores', {
        traceId: args.traceId,
        name: args.name,
        value: args.value,
        comment: args.comment,
      });

    case 'langfuse_list_datasets':
      return apiCall('/langfuse/datasets', {
        page: args.page,
        limit: args.limit,
      });

    case 'langfuse_add_to_dataset':
      return apiCall('/langfuse/datasets/items', {
        datasetName: args.datasetName,
        traceId: args.traceId,
        observationId: args.observationId,
        metadata: args.metadata,
      });

    case 'langfuse_seed_prompts':
      return apiCall('/langfuse/prompts/seed', {
        labels: args.labels,
        force: args.force,
      });

    // Twitch Integration
    case 'twitch_list_suggestions':
      return apiCall(
        '/twitch/suggestions',
        {
          filter: args.filter,
        },
        'GET'
      );

    case 'twitch_build_suggestion':
      return apiCall(`/twitch/suggestions/${args.suggestionId}/build`, {
        projectPath: args.projectPath,
      });

    case 'twitch_create_poll':
      return apiCall('/twitch/poll', {
        suggestionIds: args.suggestionIds,
        projectPath: args.projectPath,
        durationSeconds: args.durationSeconds,
      });

    // HITL Forms
    case 'request_user_input':
      return apiCall('/hitl-forms/create', {
        title: args.title,
        description: args.description,
        steps: args.steps,
        callerType: 'api',
        featureId: args.featureId,
        projectPath: args.projectPath,
        ttlSeconds: args.ttlSeconds,
      });

    case 'get_form_response':
      return apiCall('/hitl-forms/get', {
        formId: args.formId,
      });

    case 'list_pending_forms':
      return apiCall('/hitl-forms/list', {
        projectPath: args.projectPath,
      });

    case 'submit_form_response':
      return apiCall('/hitl-forms/submit', {
        formId: args.formId,
        response: args.response,
      });

    case 'cancel_form':
      return apiCall('/hitl-forms/cancel', {
        formId: args.formId,
      });

    case 'list_actionable_items':
      return apiCall('/actionable-items/list', {
        projectPath: args.projectPath,
        category: args.category,
      });

    case 'act_on_actionable_item':
      return apiCall('/actionable-items/update-status', {
        itemId: args.itemId,
        action: args.action,
      });

    // Idea Processing
    case 'process_idea':
      return apiCall('/authority/inject-idea', {
        projectPath: args.projectPath,
        title: args.title,
        description: args.description,
      });

    // Board Query
    case 'query_board': {
      const qResult = (await apiCall('/features/list', {
        projectPath: args.projectPath,
      })) as { features?: Array<Record<string, unknown>> };
      let qFeatures = qResult.features || [];

      if (args.status) {
        const statuses = Array.isArray(args.status) ? args.status : [args.status];
        qFeatures = qFeatures.filter((f) => statuses.includes(f.status as string));
      }
      if (args.epicId !== undefined) {
        qFeatures = qFeatures.filter((f) => f.epicId === args.epicId);
      }
      if (args.assignee !== undefined) {
        if (args.assignee === null) {
          qFeatures = qFeatures.filter((f) => !f.assignee);
        } else {
          qFeatures = qFeatures.filter((f) => f.assignee === args.assignee);
        }
      }
      if (args.complexity) {
        qFeatures = qFeatures.filter((f) => f.complexity === args.complexity);
      }
      if (args.isEpic !== undefined) {
        qFeatures = qFeatures.filter((f) => !!f.isEpic === args.isEpic);
      }
      if (args.isBlocked !== undefined) {
        if (args.isBlocked) {
          qFeatures = qFeatures.filter((f) => f.status === 'blocked');
        } else {
          qFeatures = qFeatures.filter((f) => f.status !== 'blocked');
        }
      }
      if (args.hasDependencies !== undefined) {
        if (args.hasDependencies) {
          qFeatures = qFeatures.filter(
            (f) => Array.isArray(f.dependencies) && (f.dependencies as string[]).length > 0
          );
        } else {
          qFeatures = qFeatures.filter(
            (f) => !Array.isArray(f.dependencies) || (f.dependencies as string[]).length === 0
          );
        }
      }
      if (args.search) {
        const lower = (args.search as string).toLowerCase();
        qFeatures = qFeatures.filter(
          (f) =>
            (f.title as string)?.toLowerCase().includes(lower) ||
            (f.description as string)?.toLowerCase().includes(lower)
        );
      }
      if (args.dueBefore) {
        qFeatures = qFeatures.filter((f) => {
          if (!f.dueDate) return false;
          return (f.dueDate as string) < (args.dueBefore as string);
        });
      }
      if (args.dueAfter) {
        qFeatures = qFeatures.filter((f) => {
          if (!f.dueDate) return false;
          return (f.dueDate as string) > (args.dueAfter as string);
        });
      }

      const qTotal = qFeatures.length;
      const qLimit = (args.limit as number) || 50;
      const qLimited = qFeatures.slice(0, qLimit);

      return {
        features: qLimited.map((f) => ({
          id: f.id,
          title: f.title,
          status: f.status,
          complexity: f.complexity,
          branchName: f.branchName,
          epicId: f.epicId,
          isEpic: f.isEpic,
          assignee: f.assignee,
          dependencies: f.dependencies,
          prNumber: f.prNumber,
        })),
        total: qTotal,
        returned: qLimited.length,
      };
    }

    case 'get_feature_dependencies': {
      const depResult = (await apiCall('/features/list', {
        projectPath: args.projectPath,
      })) as { features?: Array<Record<string, unknown>> };
      const depFeatures = depResult.features || [];
      const depMap = new Map(depFeatures.map((f) => [f.id, f]));
      const depTarget = depMap.get(args.featureId as string);

      if (!depTarget) {
        return { error: 'Feature not found' };
      }

      const satStatuses = ['done', 'completed', 'verified', 'review'];
      const dependsOn = ((depTarget.dependencies as string[]) || []).map((depId: string) => {
        const dep = depMap.get(depId);
        return {
          id: depId,
          title: dep?.title,
          status: dep?.status,
          satisfied: dep ? satStatuses.includes(dep.status as string) : false,
        };
      });

      const reverseDeps = depFeatures
        .filter(
          (f) =>
            Array.isArray(f.dependencies) &&
            (f.dependencies as string[]).includes(args.featureId as string)
        )
        .map((f) => ({
          id: f.id,
          title: f.title,
          status: f.status,
          satisfied: satStatuses.includes(f.status as string),
        }));

      return {
        featureId: args.featureId,
        featureTitle: depTarget.title,
        dependsOn,
        blockedBy: reverseDeps,
        allSatisfied:
          dependsOn.length === 0 || dependsOn.every((d: { satisfied: boolean }) => d.satisfied),
      };
    }

    // Notes Workspace
    case 'list_note_tabs':
      return apiCall('/notes/list-tabs', {
        projectPath: args.projectPath,
        includeRestricted: args.includeRestricted,
      });

    case 'read_note_tab':
      return apiCall('/notes/get-tab', {
        projectPath: args.projectPath,
        tabId: args.tabId,
      });

    case 'write_note_tab':
      return apiCall('/notes/write-tab', {
        projectPath: args.projectPath,
        tabId: args.tabId,
        content: args.content,
        mode: args.mode,
      });

    case 'create_note_tab':
      return apiCall('/notes/create-tab', {
        projectPath: args.projectPath,
        name: args.name,
        content: args.content,
        permissions: args.permissions,
      });

    case 'delete_note_tab':
      return apiCall('/notes/delete-tab', {
        projectPath: args.projectPath,
        tabId: args.tabId,
      });

    case 'rename_note_tab':
      return apiCall('/notes/rename-tab', {
        projectPath: args.projectPath,
        tabId: args.tabId,
        name: args.name,
      });

    case 'update_note_tab_permissions': {
      const permissions: Record<string, boolean> = {};
      if (args.agentRead !== undefined) permissions.agentRead = args.agentRead as boolean;
      if (args.agentWrite !== undefined) permissions.agentWrite = args.agentWrite as boolean;
      return apiCall('/notes/update-tab-permissions', {
        projectPath: args.projectPath,
        tabId: args.tabId,
        permissions,
      });
    }

    case 'reorder_note_tabs':
      return apiCall('/notes/reorder-tabs', {
        projectPath: args.projectPath,
        tabOrder: args.tabOrder,
      });

    // Calendar Management
    case 'list_calendar_events':
      return apiCall('/calendar/list', {
        projectPath: args.projectPath,
        startDate: args.startDate,
        endDate: args.endDate,
        types: args.types,
      });

    case 'create_calendar_event': {
      const eventData: Record<string, unknown> = {
        projectPath: args.projectPath,
        title: args.title,
        date: args.date,
        type: args.type || 'custom',
      };
      if (args.endDate) eventData.endDate = args.endDate;
      if (args.description) eventData.description = args.description;
      if (args.color) eventData.color = args.color;
      if (args.url) eventData.url = args.url;
      if (args.time) eventData.time = args.time;
      if (args.jobAction) eventData.jobAction = args.jobAction;
      return apiCall('/calendar/create', eventData);
    }

    case 'update_calendar_event': {
      const updateBody: Record<string, unknown> = {
        projectPath: args.projectPath,
        id: args.id,
      };
      if (args.title) updateBody.title = args.title;
      if (args.date) updateBody.date = args.date;
      if (args.endDate) updateBody.endDate = args.endDate;
      if (args.description) updateBody.description = args.description;
      if (args.color) updateBody.color = args.color;
      if (args.url) updateBody.url = args.url;
      return apiCall('/calendar/update', updateBody);
    }

    case 'delete_calendar_event':
      return apiCall('/calendar/delete', {
        projectPath: args.projectPath,
        id: args.id,
      });

    // Scheduler Management
    case 'get_scheduler_status':
      return apiCall('/scheduler/status', {}, 'GET');

    case 'update_maintenance_task': {
      const taskId = args.taskId as string;
      const results: Record<string, unknown> = { taskId };

      // Update cron schedule if provided
      if (args.cronExpression) {
        const scheduleResult = (await apiCall(`/scheduler/tasks/${taskId}/schedule`, {
          cronExpression: args.cronExpression,
        })) as { success?: boolean; error?: string };
        results.scheduleUpdated = scheduleResult.success;
        if (!scheduleResult.success) {
          return { success: false, error: scheduleResult.error, taskId };
        }
      }

      // Enable/disable if provided
      if (args.enabled !== undefined) {
        const endpoint = args.enabled ? 'enable' : 'disable';
        const toggleResult = (await apiCall(`/scheduler/tasks/${taskId}/${endpoint}`, {})) as {
          success?: boolean;
        };
        results.enabledUpdated = toggleResult.success;
      }

      return { success: true, ...results };
    }

    // Quarantine Management
    case 'list_quarantine_entries':
      return apiCall('/quarantine/list', {
        projectPath: args.projectPath,
        result: args.result,
      });

    case 'approve_quarantine_entry':
      return apiCall('/quarantine/approve', {
        projectPath: args.projectPath,
        quarantineId: args.quarantineId,
        reviewedBy: args.reviewedBy,
      });

    case 'reject_quarantine_entry':
      return apiCall('/quarantine/reject', {
        projectPath: args.projectPath,
        quarantineId: args.quarantineId,
        reviewedBy: args.reviewedBy,
        reason: args.reason,
      });

    case 'get_trust_tier': {
      const tierResult = (await apiCall('/quarantine/trust-tiers/list', {})) as {
        success?: boolean;
        records?: Array<{ githubUsername: string; tier: number }>;
      };
      if (tierResult.success && tierResult.records) {
        const record = tierResult.records.find((r) => r.githubUsername === args.githubUsername);
        return {
          success: true,
          githubUsername: args.githubUsername,
          tier: record ? record.tier : 0,
        };
      }
      return { success: false, error: 'Failed to get trust tier' };
    }

    case 'set_trust_tier':
      return apiCall('/quarantine/trust-tiers/set', {
        githubUsername: args.githubUsername,
        tier: args.tier,
        grantedBy: args.grantedBy,
        reason: args.reason,
      });

    // File Operations
    case 'copy_file':
      return apiCall('/fs/copy', {
        sourcePath: args.sourcePath,
        destinationPath: args.destinationPath,
        overwrite: args.overwrite,
      });

    case 'move_file':
      return apiCall('/fs/move', {
        sourcePath: args.sourcePath,
        destinationPath: args.destinationPath,
      });

    case 'browse_project_files':
      return apiCall('/fs/browse-project-files', {
        projectPath: args.projectPath,
        relativePath: args.relativePath,
        showHidden: args.showHidden,
      });

    // Promotion Pipeline
    case 'list_staging_candidates':
      return apiCall(
        '/promotions/candidates',
        { projectPath: args.projectPath, status: args.status },
        'GET'
      );

    case 'create_promotion_batch':
      return apiCall('/promotions/batch', {
        projectPath: args.projectPath,
        candidateIds: args.candidateIds,
        batchId: args.batchId,
      });

    case 'promote_to_staging':
      return apiCall('/promotions/promote-to-staging', {
        projectPath: args.projectPath,
        batchId: args.batchId,
      });

    case 'promote_to_main':
      return apiCall('/promotions/promote-to-main', {
        projectPath: args.projectPath,
        batchId: args.batchId,
      });

    case 'list_promotion_batches':
      return apiCall('/promotions/batches', {}, 'GET');

    // Lead Engineer Handoffs
    case 'get_feature_handoff': {
      const fsModule = await import('fs/promises');
      const pathModule = await import('path');

      const projectPath = args.projectPath as string;
      const featureId = args.featureId as string;
      const handoffDir = pathModule.join(projectPath, '.automaker', 'features', featureId);

      let files: string[] = [];
      try {
        const entries = await fsModule.readdir(handoffDir);
        files = entries.filter((f: string) => f.startsWith('handoff-') && f.endsWith('.json'));
      } catch {
        return { success: true, handoff: null, message: 'No handoffs found for this feature' };
      }

      if (files.length === 0) {
        return { success: true, handoff: null, message: 'No handoffs found for this feature' };
      }

      // Find the latest handoff by createdAt
      let latest: Record<string, unknown> | null = null;
      for (const file of files) {
        try {
          const content = await fsModule.readFile(pathModule.join(handoffDir, file), 'utf-8');
          const handoff = JSON.parse(content) as Record<string, unknown>;
          if (
            !latest ||
            new Date(handoff.createdAt as string) > new Date(latest.createdAt as string)
          ) {
            latest = handoff;
          }
        } catch {
          // Skip corrupt files
        }
      }

      return { success: true, handoff: latest };
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
