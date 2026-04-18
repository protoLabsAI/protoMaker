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

// Trust tier enforcement removed — MCP callers are trusted by default.
// The authority system was blocking legitimate MCP tool calls because the
// hardcoded 'mcp-caller' identity was never registered in agents.json.

// Helper for API calls with retry logic
async function apiCall(
  endpoint: string,
  body: Record<string, unknown>,
  method: 'GET' | 'POST' | 'PUT' = 'POST'
): Promise<unknown> {
  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
      'x-automaker-client': 'mcp',
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
  } else if (method === 'POST' || method === 'PUT') {
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
import { integrationTools } from './tools/integration-tools.js';
import { workspaceTools } from './tools/workspace-tools.js';
import { setupTools } from './tools/setup-tools.js';
import { utilityTools } from './tools/utility-tools.js';
import { schedulerTools } from './tools/scheduler-tools.js';
import { quarantineTools } from './tools/quarantine-tools.js';
import { gitOpsTools } from './tools/git-ops-tools.js';
import { leadEngineerTools } from './tools/lead-engineer-tools.js';
import { knowledgeTools } from './tools/knowledge-tools.js';
import { qaTools } from './tools/qa-tools.js';
import { portfolioTools } from './tools/portfolio-tools.js';
import { crossRepoTools } from './tools/cross-repo-tools.js';

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
  ...integrationTools,
  ...workspaceTools,
  ...setupTools,
  ...utilityTools,
  ...schedulerTools,
  ...quarantineTools,
  ...leadEngineerTools,
  ...knowledgeTools,
  ...qaTools,
  ...portfolioTools,
  ...crossRepoTools,
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
      if (args.dueDate !== undefined) featureData.dueDate = args.dueDate;
      if (args.priority !== undefined) featureData.priority = args.priority;
      if (args.isFoundation !== undefined) featureData.isFoundation = args.isFoundation;
      if (args.category) featureData.category = args.category;
      if (args.projectSlug) featureData.projectSlug = args.projectSlug;
      if (args.executionMode) featureData.executionMode = args.executionMode;
      if (args.workflow) featureData.workflow = args.workflow;
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
      if (args.dueDate !== undefined) updates.dueDate = args.dueDate;
      if (args.priority !== undefined) updates.priority = args.priority;
      if (args.isFoundation !== undefined) updates.isFoundation = args.isFoundation;
      if (args.statusChangeReason) updates.statusChangeReason = args.statusChangeReason;
      if (args.category) updates.category = args.category;
      if (args.executionMode) updates.executionMode = args.executionMode;
      if (args.workflow) updates.workflow = args.workflow;
      return apiCall('/features/update', {
        projectPath: args.projectPath,
        featureId: args.featureId,
        updates,
      });
    }

    case 'list_workflows':
      return apiCall('/settings/workflows', {
        projectPath: args.projectPath,
      });

    case 'delete_feature':
      return apiCall('/features/delete', {
        projectPath: args.projectPath,
        featureId: args.featureId,
      });

    case 'rollback_feature':
      return apiCall('/features/rollback', {
        projectPath: args.projectPath,
        featureId: args.featureId,
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
        ...(args.targetStatus !== undefined && { targetStatus: args.targetStatus }),
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

      // When featureId is provided, return detailed dependency info for that feature
      if (args.featureId) {
        const depMap = new Map(features.map((f) => [f.id, f]));
        const depTarget = depMap.get(args.featureId as string);
        if (!depTarget) {
          return { error: 'Feature not found' };
        }
        const satStatuses = ['done', 'completed', 'verified', 'review'];
        const dependsOn = (depTarget.dependencies || []).map((depId: string) => {
          const dep = depMap.get(depId);
          return {
            id: depId,
            title: dep?.title,
            status: dep?.status,
            satisfied: dep ? satStatuses.includes(dep.status) : false,
          };
        });
        const blockedBy = features
          .filter((f) => (f.dependencies || []).includes(args.featureId as string))
          .map((f) => ({
            id: f.id,
            title: f.title,
            status: f.status,
            satisfied: satStatuses.includes(f.status),
          }));
        return {
          featureId: args.featureId,
          featureTitle: depTarget.title,
          dependsOn,
          blockedBy,
          allSatisfied:
            dependsOn.length === 0 || dependsOn.every((d: { satisfied: boolean }) => d.satisfied),
        };
      }

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
        defaultWorkflow: args.defaultWorkflow,
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

    case 'health_check':
      if (args.detailed) {
        return apiCall('/health/detailed', {}, 'GET');
      }
      return apiCall('/health', {}, 'GET');

    case 'get_server_logs': {
      // Strategy: ask the server to read its own log file via API.
      // This works even when the server runs in Docker (log file is inside
      // a Docker volume that the MCP tool on the host can't access).
      // Falls back to direct disk reads only when the server is down.
      const fs = await import('fs');
      const path = await import('path');

      const maxLines = (args.maxLines as number) || 200;
      const filterText = args.filter as string | undefined;
      const sinceTimestamp = args.since as string | undefined;

      // Try the server API first — it can always access its own log file
      try {
        const params = new URLSearchParams();
        if (maxLines) params.set('maxLines', String(maxLines));
        if (filterText) params.set('filter', filterText);
        if (sinceTimestamp) params.set('since', sinceTimestamp);

        const result = await apiCall(`/health/logs?${params.toString()}`, {}, 'GET');
        return result;
      } catch {
        // Server is down — fall back to direct disk read.
        // Compute best-guess path from environment.
        const dataDirEnv = process.env.DATA_DIR;
        let logPath: string;
        if (dataDirEnv && path.isAbsolute(dataDirEnv)) {
          logPath = path.join(dataDirEnv, 'server.log');
        } else {
          const serverRoot = path.join(
            process.env.AUTOMAKER_ROOT || process.cwd(),
            'apps',
            'server'
          );
          logPath = path.join(serverRoot, dataDirEnv || 'data', 'server.log');
        }

        if (!fs.existsSync(logPath)) {
          return {
            success: false,
            error: `Server is down and log file not found at ${logPath}. If the server runs in Docker, logs are only accessible while the server is running.`,
            logPath,
          };
        }

        const content = fs.readFileSync(logPath, 'utf-8');
        let lines = content.split('\n').filter((l: string) => l.length > 0);

        if (sinceTimestamp) {
          const sinceDate = new Date(sinceTimestamp);
          lines = lines.filter((line: string) => {
            const match = line.match(/^\[(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)\]/);
            if (!match) return true;
            const lineDate = new Date(match[1]);
            return lineDate >= sinceDate;
          });
        }

        if (filterText) {
          const lowerFilter = filterText.toLowerCase();
          lines = lines.filter((line: string) => line.toLowerCase().includes(lowerFilter));
        }

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
          source: 'disk-fallback',
        };
      }
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

    case 'get_sitrep':
      return apiCall('/sitrep', {
        projectPath: args.projectPath,
        projectSlug: args.projectSlug,
      });

    case 'sync_registry':
      return apiCall('/portfolio/sync-registry', {
        dryRun: args.dryRun !== false,
      });

    case 'get_portfolio_sitrep':
      return apiCall(
        '/portfolio/sitrep',
        args.projectPaths !== undefined
          ? { projectPaths: (args.projectPaths as string[]).join(',') }
          : {},
        'GET'
      );

    // Cross-Repo Dependency Tools
    case 'get_cross_repo_dependencies':
      return apiCall(
        '/portfolio/cross-repo-deps',
        args.projectPaths !== undefined
          ? { projectPaths: (args.projectPaths as string[]).join(',') }
          : {},
        'GET'
      );

    case 'flag_cross_repo_dependency':
      return apiCall('/features/external-deps/flag', {
        projectPath: args.projectPath,
        featureId: args.featureId,
        dependencyAppPath: args.dependencyAppPath,
        dependencyFeatureId: args.dependencyFeatureId,
        description: args.description,
        dependencyType: args.dependencyType,
        prNumber: args.prNumber,
      });

    case 'resolve_cross_repo_dependency':
      return apiCall('/features/external-deps/resolve', {
        projectPath: args.projectPath,
        featureId: args.featureId,
        dependencyAppPath: args.dependencyAppPath,
        dependencyFeatureId: args.dependencyFeatureId,
      });

    // QA Tools
    case 'run_qa_check':
      return apiCall('/qa/check', { projectPath: String(args.projectPath ?? '') }, 'GET');

    // Git Operations
    case 'git_enhanced_status':
      return apiCall('/git/enhanced-status', { projectPath: args.projectPath });

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

    // Observability
    case 'get_settings': {
      // Strip large/stale fields to keep MCP response small (~12k→~1k tokens)
      const settingsResult = (await apiCall('/settings/global', {}, 'GET')) as {
        success: boolean;
        settings: Record<string, unknown>;
      };
      if (settingsResult?.settings) {
        delete settingsResult.settings.autoModeByWorktree;
        delete settingsResult.settings.trashedProjects;
        delete settingsResult.settings.keyboardShortcuts;
        delete settingsResult.settings.projectHistory;
        delete settingsResult.settings.lastSelectedSessionByProject;
        delete settingsResult.settings.recentFolders;
      }
      return settingsResult;
    }

    case 'update_settings':
      return apiCall('/settings/global', (args.settings || {}) as Record<string, unknown>, 'PUT');

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

    case 'save_project_milestones':
      return apiCall('/projects/lifecycle/save-milestones', {
        projectPath: args.projectPath,
        projectSlug: args.projectSlug,
        milestones: args.milestones,
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

    // Project Assignment
    case 'assign_project':
      return apiCall('/projects/assignment/assign', {
        projectPath: args.projectPath,
        projectSlug: args.projectSlug,
        assignedTo: args.assignedTo,
        assignedBy: args.assignedBy,
      });

    case 'unassign_project':
      return apiCall('/projects/assignment/unassign', {
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

    // Langfuse tools moved to project-level — not shipped in plugin

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
          dependencies: f.dependencies,
          prNumber: f.prNumber,
        })),
        total: qTotal,
        returned: qLimited.length,
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

    case 'write_note_tab': {
      const writeTabResult = await apiCall('/notes/write-tab', {
        projectPath: args.projectPath,
        tabId: args.tabId,
        content: args.content,
        mode: args.mode,
      });
      // Optionally rename the tab in the same call
      if (args.name) {
        await apiCall('/notes/rename-tab', {
          projectPath: args.projectPath,
          tabId: args.tabId,
          name: args.name,
        });
      }
      // Optionally update permissions in the same call
      if (args.permissions) {
        await apiCall('/notes/update-tab-permissions', {
          projectPath: args.projectPath,
          tabId: args.tabId,
          permissions: args.permissions,
        });
      }
      return writeTabResult;
    }

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

    // Scheduler Management
    case 'get_scheduler_status':
      return apiCall('/ops/timers', {}, 'GET');

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

      // Enable/disable if provided (maps to resume/pause on the timer registry)
      if (args.enabled !== undefined) {
        const endpoint = args.enabled ? 'resume' : 'pause';
        const toggleResult = (await apiCall(`/ops/timers/${taskId}/${endpoint}`, {})) as {
          success?: boolean;
        };
        results.enabledUpdated = toggleResult.success;
      }

      return { success: true, ...results };
    }

    // Lead Engineer Handoffs
    case 'get_feature_handoff':
      return apiCall('/features/handoff', {
        projectPath: args.projectPath,
        featureId: args.featureId,
      });

    // Knowledge Store
    case 'knowledge_search':
      return apiCall('/knowledge/search', {
        projectPath: args.projectPath,
        query: args.query,
        domain: args.domain,
        maxResults: args.maxResults,
        maxTokens: args.maxTokens,
      });

    case 'knowledge_ingest':
      return apiCall('/knowledge/ingest', {
        projectPath: args.projectPath,
        content: args.content,
        domain: args.domain,
        heading: args.heading,
      });

    case 'knowledge_rebuild':
      return apiCall('/knowledge/rebuild', {
        projectPath: args.projectPath,
      });

    case 'knowledge_stats':
      return apiCall('/knowledge/stats', {
        projectPath: args.projectPath,
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
