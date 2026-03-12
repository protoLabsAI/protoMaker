/**
 * Utility and Support Tools (CoS, Escalation, Lead Engineer)
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const utilityTools: Tool[] = [
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
    name: 'get_sitrep',
    description:
      'Get a full operational status report in one call. Returns board summary, running agents, auto-mode status, blocked features, escalations (from feature state), recentEscalations (last 10 from escalation router audit log), recentLogErrors (last 10 ERROR/FATAL lines from server log), open PRs with CI status, staging delta, recent commits, and server health. Use this instead of calling multiple status tools separately.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        projectSlug: {
          type: 'string',
          description:
            'Filter to a specific project slug. When provided, board counts, blocked features, review features, and escalations only include features belonging to this project.',
        },
      },
      required: ['projectPath'],
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
        projectSlug: {
          type: 'string',
          description:
            'Filter to a specific project slug. When provided, only features belonging to this project are counted.',
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
        compact: {
          type: 'boolean',
          description:
            'Return compact briefing (default: true). Compact mode returns slim events for critical/high severity and aggregated trigger counts for medium/low, dramatically reducing token usage. Set to false for full event payloads.',
        },
      },
      required: ['projectPath'],
    },
  },
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
        category: {
          type: 'string',
          enum: ['ops', 'improvement', 'bug', 'feature', 'idea', 'architectural'],
          description:
            'PRD category for trust boundary evaluation. Determines if HITL gates auto-pass or require human review.',
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

  {
    name: 'get_escalation_status',
    description:
      'Get status of the escalation router including registered channels, rate limits, and recent activity',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_escalation_log',
    description: 'Get signal audit log from the escalation router',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Number of log entries to return (default: 100)',
        },
      },
    },
  },
  {
    name: 'acknowledge_escalation',
    description:
      'Acknowledge an escalation signal. Use this to mark that you have seen and handled an escalation.',
    inputSchema: {
      type: 'object',
      properties: {
        signalId: {
          type: 'string',
          description: 'Signal ID to acknowledge',
        },
        acknowledgedBy: {
          type: 'string',
          description: 'Who is acknowledging this signal (e.g., "Claude Agent", user name)',
        },
        notes: {
          type: 'string',
          description: 'Optional notes about the acknowledgment',
        },
      },
      required: ['signalId', 'acknowledgedBy'],
    },
  },

  {
    name: 'start_lead_engineer',
    description:
      'Start the Lead Engineer to manage a project through the production phase. Orchestrates auto-mode, reacts to events with fast-path rules, and wraps up with retro + improvement tickets.',
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
        maxConcurrency: {
          type: 'number',
          description: 'Maximum number of features to process concurrently (default: 1)',
        },
      },
      required: ['projectPath', 'projectSlug'],
    },
  },
  {
    name: 'stop_lead_engineer',
    description: 'Stop the Lead Engineer from managing a project.',
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
    name: 'get_lead_engineer_status',
    description:
      'Get Lead Engineer status including world state, flow state, rule execution log, and metrics.',
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
];
