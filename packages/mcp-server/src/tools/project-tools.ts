/**
 * Project Planning and Lifecycle Management Tools
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const projectTools: Tool[] = [
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
            'ongoing',
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
    description:
      'Delete a project plan and all its files. This is a destructive action — requires sufficient trust tier. If trust is insufficient, an approval request is created instead.',
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
        requestingAgentId: {
          type: 'string',
          description:
            'Optional agent ID for trust tier enforcement. If the agent lacks sufficient trust, an approval request is created instead of executing.',
        },
      },
      required: ['projectPath', 'projectSlug'],
    },
  },
  {
    name: 'archive_project',
    description:
      'Archive a completed project. Slims project.json to mapping data only (slug, title, milestone/phase IDs) and deletes .md files and milestones/ directory.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        projectSlug: {
          type: 'string',
          description: 'The project slug to archive',
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

  {
    name: 'initiate_project',
    description:
      'Start a new project lifecycle. Creates a local project cache with the idea description. Returns duplicates if found (caller should confirm before proceeding).',
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
        ideaDescription: {
          type: 'string',
          description: 'Idea description (markdown).',
        },
      },
      required: ['projectPath', 'title', 'ideaDescription'],
    },
  },
  {
    name: 'generate_project_prd',
    description:
      'Check if a PRD exists for a project. If not, suggests generating one via the /plan-project skill or create_project tool. Returns existing PRD if available.',
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
        additionalContext: {
          type: 'string',
          description: 'Additional context for PRD generation (optional)',
        },
      },
      required: ['projectPath', 'projectSlug'],
    },
  },
  {
    name: 'save_project_milestones',
    description:
      'Save structured milestone/phase data to a project. This bridges the gap between PM agent PRD output and approve_project_prd. ' +
      'Call this after the PM agent generates a PRD to persist the structured milestones. ' +
      'Pipeline: initiate_project → PM agent drafts PRD → save_project_milestones → approve_project_prd → launch_project',
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
        milestones: {
          type: 'array',
          description: 'Structured milestone and phase data parsed from PM agent PRD output',
          items: {
            type: 'object',
            properties: {
              number: { type: 'number', description: 'Milestone number (1-based)' },
              slug: { type: 'string', description: 'Milestone slug' },
              title: { type: 'string', description: 'Milestone title' },
              description: { type: 'string', description: 'Milestone description' },
              status: {
                type: 'string',
                enum: ['stub', 'planning', 'planned', 'pending', 'in-progress', 'completed'],
                description: 'Milestone status (default: planned)',
              },
              targetDate: { type: 'string', description: 'Target date (YYYY-MM-DD)' },
              dependencies: {
                type: 'array',
                items: { type: 'string' },
                description: 'Dependent milestone slugs',
              },
              phases: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    number: { type: 'number', description: 'Phase number (1-based)' },
                    name: { type: 'string', description: 'Phase slug/name' },
                    title: { type: 'string', description: 'Phase title' },
                    description: { type: 'string', description: 'Phase description' },
                    complexity: {
                      type: 'string',
                      enum: ['small', 'medium', 'large'],
                      description: 'Complexity estimate',
                    },
                    filesToModify: { type: 'array', items: { type: 'string' } },
                    acceptanceCriteria: { type: 'array', items: { type: 'string' } },
                    dependencies: { type: 'array', items: { type: 'string' } },
                  },
                  required: ['number', 'name', 'title', 'description'],
                },
              },
            },
            required: ['number', 'slug', 'title', 'description', 'phases'],
          },
        },
      },
      required: ['projectPath', 'projectSlug', 'milestones'],
    },
  },
  {
    name: 'approve_project_prd',
    description:
      'Approve the PRD and create board features from project milestones. Call after the project has a PRD and milestones defined.',
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
        createEpics: {
          type: 'boolean',
          description: 'Create epic features for milestones (default: true)',
        },
        setupDependencies: {
          type: 'boolean',
          description: 'Set up dependencies between features (default: true)',
        },
      },
      required: ['projectPath', 'projectSlug'],
    },
  },
  {
    name: 'launch_project',
    description:
      'Launch a project and start auto-mode. Requires features to exist in backlog (call approve_project_prd first).',
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
          description: 'Max concurrent agents (optional, uses system default)',
        },
      },
      required: ['projectPath', 'projectSlug'],
    },
  },
  {
    name: 'get_lifecycle_status',
    description:
      'Get the current lifecycle phase and next actions for a project. Reads local board state to determine where the project is in the pipeline.',
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
      },
      required: ['projectPath', 'projectSlug'],
    },
  },

  // Project Assignment
  {
    name: 'assign_project',
    description:
      'Assign a project to an instance. Writes assignedTo, assignedAt, and assignedBy fields to the project.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        projectSlug: {
          type: 'string',
          description: 'The project slug to assign',
        },
        assignedTo: {
          type: 'string',
          description: 'Instance ID to assign the project to',
        },
        assignedBy: {
          type: 'string',
          description: 'Instance ID or user performing the assignment',
        },
      },
      required: ['projectPath', 'projectSlug', 'assignedTo', 'assignedBy'],
    },
  },
  {
    name: 'unassign_project',
    description: 'Clear the assignment fields on a project.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        projectSlug: {
          type: 'string',
          description: 'The project slug to unassign',
        },
      },
      required: ['projectPath', 'projectSlug'],
    },
  },
  {
    name: 'list_project_assignments',
    description:
      'List all project assignments for a projectPath. Returns every project that has an assignedTo field set.',
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
    name: 'reassign_orphaned_projects',
    description:
      'Detect projects assigned to peers with stale heartbeats (>120s) and reassign them to this instance.',
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
