/**
 * Content Pipeline Tools
 *
 * Tools for Cindi's content creation and review pipeline:
 * - create_content: Start a new content creation flow
 * - get_content_status: Check flow progress and pending HITL gates
 * - list_content: List all generated content pieces
 * - review_content: Submit HITL decisions at interrupt gates
 * - export_content: Export final content to various formats
 * - execute_antagonistic_review: Run standalone antagonistic quality review
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const contentTools: Tool[] = [
  {
    name: 'create_content',
    description:
      'Start a new content creation pipeline flow. Runs research → outline → writing → antagonistic review → export phases via LangGraph. Runs autonomously by default (no HITL). Output saved to .automaker/content/{runId}/. Returns runId for status tracking.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        topic: {
          type: 'string',
          description:
            'Topic or title for the content (e.g., "Building RAG Pipelines with LangGraph")',
        },
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
          items: { type: 'string', enum: ['markdown', 'html', 'pdf'] },
          description: 'Output formats to generate (default: ["markdown"])',
        },
        enableHITL: {
          type: 'boolean',
          description:
            'Enable human-in-the-loop interrupt gates at review checkpoints (default: false). When enabled, flow pauses at research_hitl, outline_hitl, and final_review_hitl for approval via review_content.',
        },
        maxRetries: {
          type: 'number',
          description: 'Max retries per review phase if quality gates fail (default: 2)',
        },
      },
      required: ['projectPath', 'topic'],
    },
  },
  {
    name: 'get_content_status',
    description:
      'Get the current status of a content creation flow run. Returns progress (0-100), current node, review scores for each phase (research/outline/content), and any pending HITL gates.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        runId: {
          type: 'string',
          description:
            'Content run ID returned by create_content (e.g., "content-1708123456789-abc123")',
        },
      },
      required: ['projectPath', 'runId'],
    },
  },
  {
    name: 'list_content',
    description:
      'List all content items for a project. Returns metadata about generated content including topic, format, status, review scores, and output paths.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        status: {
          type: 'string',
          description: 'Filter by status (e.g., "completed", "failed")',
        },
        contentType: {
          type: 'string',
          description: 'Filter by content type/format (e.g., "guide", "tutorial")',
        },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'review_content',
    description:
      'Submit a HITL review decision at a content flow interrupt gate. Only applicable when the flow was started with enableHITL=true and is currently in "interrupted" status. Check get_content_status for hitlGatesPending to know which gate to review.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        runId: {
          type: 'string',
          description: 'Content run ID to resume',
        },
        gate: {
          type: 'string',
          enum: ['research_hitl', 'outline_hitl', 'final_review_hitl'],
          description:
            'The HITL gate to review (must match hitlGatesPending from get_content_status)',
        },
        decision: {
          type: 'string',
          enum: ['approve', 'revise', 'reject'],
          description:
            'Review decision: approve continues the flow, revise triggers regeneration with feedback, reject stops the flow',
        },
        feedback: {
          type: 'string',
          description: 'Optional feedback to guide revision (used when decision is "revise")',
        },
      },
      required: ['projectPath', 'runId', 'gate', 'decision'],
    },
  },
  {
    name: 'export_content',
    description:
      'Export completed content to a specific format. The run must be in "completed" status. Formats: markdown (raw .md), frontmatter-md (YAML front matter for CMS), jsonl (instruction-response pairs for training data), hf-dataset (HuggingFace dataset entry).',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        runId: {
          type: 'string',
          description: 'Content run ID to export',
        },
        format: {
          type: 'string',
          enum: ['markdown', 'frontmatter-md', 'jsonl', 'hf-dataset'],
          description:
            'Export format: markdown (raw .md), frontmatter-md (CMS-ready with YAML front matter), jsonl (instruction-response training data), hf-dataset (HuggingFace dataset entry)',
        },
      },
      required: ['projectPath', 'runId', 'format'],
    },
  },
  {
    name: 'execute_antagonistic_review',
    description:
      'Run an antagonistic quality review on content text. Scores across 6 dimensions on a 1-10 scale: Accuracy (factual correctness), Usefulness (reader value), Clarity (readability/structure), Engagement (hook quality), Depth (detail/nuance), Actionability (clear next steps). Passes if overall average >= 7.5 and no dimension < 5. Use this before publishing or after creating content to validate quality.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        content: {
          type: 'string',
          description: 'The content text to review',
        },
        topic: {
          type: 'string',
          description: 'The intended topic of the content (helps evaluate accuracy and relevance)',
        },
        format: {
          type: 'string',
          enum: ['tutorial', 'reference', 'guide', 'blog-post', 'documentation'],
          description: 'Content format type for context-appropriate evaluation (default: guide)',
        },
        audience: {
          type: 'string',
          enum: ['beginner', 'intermediate', 'expert'],
          description:
            'Intended audience for calibrating depth and clarity scores (default: intermediate)',
        },
      },
      required: ['projectPath', 'content'],
    },
  },
];
