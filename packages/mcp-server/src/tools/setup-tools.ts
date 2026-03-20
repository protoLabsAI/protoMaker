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
    name: 'run_full_setup',
    description:
      'Run the complete setup pipeline: clone (if git URL), research repo, analyze gaps, generate HTML report, initialize .automaker, generate proto.config.yaml, and generate proposal. This is a convenience wrapper that chains clone_repo (if URL) → research_repo → analyze_gaps → generate_report → setup_lab → propose_alignment. setup_lab writes proto.config.yaml at the project root, populated from research results (name, techStack, commands, git).',
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
];
