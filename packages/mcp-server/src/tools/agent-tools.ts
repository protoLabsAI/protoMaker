/**
 * Agent Control and Management Tools
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const agentTools: Tool[] = [
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
];
