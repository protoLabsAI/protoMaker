/**
 * Content Pipeline Management Tools
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const contentTools: Tool[] = [
  {
    name: 'create_content',
    description:
      'Trigger content creation flow for blog posts, technical documentation, or training data. Returns a runId for tracking progress.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        topic: {
          type: 'string',
          description: 'Topic or subject for the content to generate',
        },
        contentConfig: {
          type: 'object',
          description: 'Optional configuration for content generation',
          properties: {
            format: {
              type: 'string',
              enum: ['tutorial', 'reference', 'guide'],
              description: 'Content format (default: guide)',
            },
            tone: {
              type: 'string',
              enum: ['technical', 'conversational', 'formal'],
              description: 'Writing tone (default: conversational)',
            },
            audience: {
              type: 'string',
              enum: ['beginner', 'intermediate', 'expert'],
              description: 'Target audience level (default: intermediate)',
            },
            outputFormats: {
              type: 'array',
              items: {
                type: 'string',
                enum: ['markdown', 'html', 'pdf'],
              },
              description: 'Array of output formats (default: [markdown])',
            },
          },
        },
      },
      required: ['projectPath', 'topic'],
    },
  },
  {
    name: 'get_content_status',
    description:
      'Check the execution status of a content creation flow. Returns current progress, status, and any pending HITL gates.',
    inputSchema: {
      type: 'object',
      properties: {
        runId: {
          type: 'string',
          description: 'The unique run identifier returned when the flow was created',
        },
      },
      required: ['runId'],
    },
  },
  {
    name: 'list_content',
    description:
      'List all generated content pieces in a project. Can filter by status or content type.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        filters: {
          type: 'object',
          description: 'Optional filters',
          properties: {
            status: {
              type: 'string',
              description: 'Filter by completion status',
            },
          },
        },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'review_content',
    description:
      'Submit HITL review decision at content flow interrupt gates (research_hitl, outline_hitl, final_review_hitl). Use to approve, revise, or reject.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        runId: {
          type: 'string',
          description: 'The flow run identifier',
        },
        gate: {
          type: 'string',
          enum: ['research_hitl', 'outline_hitl', 'final_review_hitl'],
          description: 'Which HITL gate to respond to',
        },
        decision: {
          type: 'string',
          enum: ['approve', 'revise', 'reject'],
          description: 'Review decision',
        },
        feedback: {
          type: 'string',
          description: 'Optional feedback for revision or rejection',
        },
      },
      required: ['projectPath', 'runId', 'gate', 'decision'],
    },
  },
  {
    name: 'export_content',
    description:
      'Export generated content in a specific format (markdown, hf-dataset, jsonl, frontmatter-md).',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        runId: {
          type: 'string',
          description: 'The flow run identifier',
        },
        format: {
          type: 'string',
          enum: ['markdown', 'hf-dataset', 'jsonl', 'frontmatter-md'],
          description: 'Export format',
        },
      },
      required: ['projectPath', 'runId', 'format'],
    },
  },
  {
    name: 'execute_antagonistic_review',
    description:
      'Execute antagonistic review flow for a PRD. Runs Ava (operational) and Jon (strategic) reviews, then consolidates into final PRD.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        prdTitle: {
          type: 'string',
          description: 'Title of the PRD being reviewed',
        },
        prdDescription: {
          type: 'string',
          description:
            'Full PRD content in SPARC format (Situation, Problem, Approach, Results, Constraints)',
        },
        config: {
          type: 'object',
          description: 'Optional configuration',
          properties: {
            smartModel: {
              type: 'string',
              description: 'Model to use for review (default: claude-sonnet-4-5-20250929)',
            },
            enableHITL: {
              type: 'boolean',
              description: 'Enable human-in-the-loop review (default: false)',
            },
          },
        },
      },
      required: ['projectPath', 'prdTitle', 'prdDescription'],
    },
  },
];
