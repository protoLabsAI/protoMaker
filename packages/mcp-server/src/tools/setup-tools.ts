/**
 * Setup Pipeline and Ceremonies Tools
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const setupTools: Tool[] = [
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
  {
    name: 'generate_report',
    description:
      'Generate a self-contained HTML report from gap analysis and research results. Saves to {projectPath}/protoLabs.report.html and automatically opens in browser.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        research: {
          type: 'object',
          description: 'RepoResearchResult object from repo research phase',
        },
        report: {
          type: 'object',
          description: 'GapAnalysisReport object from gap analysis phase',
        },
      },
      required: ['projectPath', 'research', 'report'],
    },
  },
  {
    name: 'open_report',
    description:
      'Open an existing ProtoLabs HTML report in the default browser. Use this to view previously generated reports.',
    inputSchema: {
      type: 'object',
      properties: {
        reportPath: {
          type: 'string',
          description:
            'Absolute path to the report HTML file (e.g., {projectPath}/protoLabs.report.html)',
        },
      },
      required: ['reportPath'],
    },
  },

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
      'Run the complete setup pipeline: clone (if git URL), research repo, analyze gaps, generate HTML report, initialize .automaker, and generate proposal. This is a convenience wrapper that chains clone_repo (if URL) → research_repo → analyze_gaps → generate_report → setup_lab → propose_alignment.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description:
            'Git repository URL (https://, git@, or ending with .git) or absolute path to local project directory. If a URL is provided, the repo will be cloned to ./labs/{repo-name}/ first.',
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

  {
    name: 'clone_repo',
    description:
      'Clone a git repository to the ./labs directory. Supports shallow clones for speed. If repository already exists, it will be refreshed with git pull --rebase.',
    inputSchema: {
      type: 'object',
      properties: {
        gitUrl: {
          type: 'string',
          description: 'Git repository URL (https://, git@, or git://)',
        },
        directoryName: {
          type: 'string',
          description:
            'Optional directory name for the cloned repository (defaults to repository name extracted from URL)',
        },
        shallow: {
          type: 'boolean',
          default: true,
          description: 'Perform shallow clone (--depth 1) for speed (default: true)',
        },
      },
      required: ['gitUrl'],
    },
  },
  {
    name: 'deliver_alignment',
    description:
      'Deliver alignment work back to client repository via fork+PR. Forks the client repo to proto-labs-ai org, creates an aligned-by-protolabs branch with branding (footer component + README badge), and opens a PR with alignment details.',
    inputSchema: {
      type: 'object',
      properties: {
        clientRepoUrl: {
          type: 'string',
          description: 'Client repository URL (e.g., https://github.com/owner/repo)',
        },
        scoreBefore: {
          type: 'number',
          description: 'Alignment score before alignment work (optional)',
        },
        scoreAfter: {
          type: 'number',
          description: 'Alignment score after alignment work (optional)',
        },
        gapsSummary: {
          type: 'string',
          description: 'Summary of gaps identified during analysis (optional)',
        },
        changesMade: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: 'List of changes made during alignment (optional)',
        },
        alignmentPerformed: {
          type: 'boolean',
          description: 'Whether alignment work was performed (vs just branding)',
          default: false,
        },
      },
      required: ['clientRepoUrl'],
    },
  },
];
