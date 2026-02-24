/**
 * Observability, Metrics, and Langfuse Tools
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const observabilityTools: Tool[] = [
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

  {
    name: 'langfuse_list_traces',
    description:
      'List recent Langfuse traces. Filter by name, tags, userId, sessionId, date range. Returns traceId, name, model, cost, latency, timestamp.',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'number', description: 'Page number (default: 1)' },
        limit: { type: 'number', description: 'Results per page (default: 20)' },
        name: { type: 'string', description: 'Filter by trace name' },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by tags (e.g., ["automaker", "feature:abc123"])',
        },
        userId: { type: 'string', description: 'Filter by user ID' },
        sessionId: { type: 'string', description: 'Filter by session ID' },
        fromTimestamp: { type: 'string', description: 'Start date (ISO 8601)' },
        toTimestamp: { type: 'string', description: 'End date (ISO 8601)' },
      },
    },
  },
  {
    name: 'langfuse_get_trace',
    description:
      'Get full trace detail: all generations, spans, scores, token usage, cost breakdown.',
    inputSchema: {
      type: 'object',
      properties: {
        traceId: { type: 'string', description: 'The trace ID to retrieve' },
      },
      required: ['traceId'],
    },
  },
  {
    name: 'langfuse_get_costs',
    description:
      'Get observations/generations for cost analysis. Filter by type, model, time range. Returns token usage and costs per observation.',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'number', description: 'Page number (default: 1)' },
        limit: { type: 'number', description: 'Results per page (default: 50)' },
        type: {
          type: 'string',
          enum: ['GENERATION', 'SPAN', 'EVENT'],
          description: 'Observation type filter (default: GENERATION)',
        },
        model: { type: 'string', description: 'Filter by model name' },
        fromStartTime: { type: 'string', description: 'Start date (ISO 8601)' },
        toStartTime: { type: 'string', description: 'End date (ISO 8601)' },
      },
    },
  },
  {
    name: 'langfuse_list_prompts',
    description: 'List all managed prompts in Langfuse with versions and labels.',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'number', description: 'Page number (default: 1)' },
        limit: { type: 'number', description: 'Results per page (default: 50)' },
        name: { type: 'string', description: 'Filter by prompt name' },
        label: { type: 'string', description: 'Filter by label (e.g., "production")' },
        version: { type: 'number', description: 'Filter by specific version number' },
      },
    },
  },
  {
    name: 'langfuse_score_trace',
    description:
      'Score a trace (name, value 0-1, optional comment). Use for manual quality review of agent outputs.',
    inputSchema: {
      type: 'object',
      properties: {
        traceId: { type: 'string', description: 'The trace ID to score' },
        name: {
          type: 'string',
          description: 'Score name (e.g., "quality", "accuracy", "helpfulness")',
        },
        value: { type: 'number', description: 'Score value (0 to 1)' },
        comment: { type: 'string', description: 'Optional comment explaining the score' },
      },
      required: ['traceId', 'name', 'value'],
    },
  },
  {
    name: 'langfuse_list_datasets',
    description:
      'List all Langfuse datasets. Datasets are collections of traces used for evaluation and benchmarking.',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'number', description: 'Page number (default: 1)' },
        limit: { type: 'number', description: 'Results per page (default: 50)' },
      },
    },
  },
  {
    name: 'langfuse_add_to_dataset',
    description:
      'Add a trace to a named dataset for evaluation. Creates the dataset if it does not exist.',
    inputSchema: {
      type: 'object',
      properties: {
        datasetName: {
          type: 'string',
          description: 'Name of the dataset (created if it does not exist)',
        },
        traceId: { type: 'string', description: 'Trace ID to add to the dataset' },
        observationId: {
          type: 'string',
          description: 'Optional observation ID within the trace',
        },
        metadata: { type: 'object', description: 'Optional metadata for the dataset item' },
      },
      required: ['datasetName', 'traceId'],
    },
  },
  {
    name: 'langfuse_seed_prompts',
    description:
      'Upload default prompt baselines to Langfuse for version tracking and A/B experiments. Seeds key prompts (auto-mode, task execution, agent, planning) as managed Langfuse prompts. Skips prompts that already exist unless force=true.',
    inputSchema: {
      type: 'object',
      properties: {
        labels: {
          type: 'array',
          items: { type: 'string' },
          description: 'Labels to apply to seeded prompts (default: ["production"])',
        },
        force: {
          type: 'boolean',
          description: 'Create new version even if prompt already exists (default: false)',
        },
      },
    },
  },
];
