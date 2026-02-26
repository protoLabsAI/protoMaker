/**
 * Promotion Pipeline Tools
 *
 * Tools for managing the staging/production promotion pipeline:
 * - list_staging_candidates: List candidates with optional status filter
 * - create_promotion_batch: Create a PromotionBatch from candidate IDs
 * - promote_to_staging: Trigger autonomous git promotion (cherry-pick → staging PR → auto-merge)
 * - promote_to_main: Create staging→main PR and fire HITL form for human approval
 * - get_promotion_status: Return queue depth, batch count, last promotion date, pending HITL forms
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const promotionTools: Tool[] = [
  {
    name: 'list_staging_candidates',
    description:
      'List promotion candidates — features merged to dev that are eligible to be promoted to staging. Optionally filter by status (candidate, selected, promoted, held, rejected).',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project root.',
        },
        status: {
          type: 'string',
          description:
            'Optional status filter. Valid values: candidate, selected, promoted, held, rejected. Omit to list all candidates.',
        },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'create_promotion_batch',
    description:
      'Create a PromotionBatch from a list of staging candidate IDs. Returns the created batch including its batchId for use with promote_to_staging or promote_to_main.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project root.',
        },
        candidateIds: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Array of featureId values from list_staging_candidates to include in this batch.',
        },
        batchId: {
          type: 'string',
          description:
            'Optional custom batch ID. If omitted, a unique ID is generated automatically.',
        },
      },
      required: ['projectPath', 'candidateIds'],
    },
  },
  {
    name: 'promote_to_staging',
    description:
      'Ava-autonomous: Promote a batch to staging by cherry-picking commits onto a promotion branch, opening a staging PR, and enabling auto-merge. This tool is fully autonomous — no human approval is needed for staging promotions.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project root.',
        },
        batchId: {
          type: 'string',
          description: 'The promotion batch ID to promote to staging.',
        },
      },
      required: ['projectPath', 'batchId'],
    },
  },
  {
    name: 'promote_to_main',
    description:
      'Creates the staging→main PR but does NOT merge. Human approval required via HITL form. Ava calls this to initiate a staging→main promotion, which opens a PR and fires a HITL form for a human to review and approve before any merge occurs.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project root.',
        },
        batchId: {
          type: 'string',
          description: 'The promotion batch ID to promote from staging to main.',
        },
      },
      required: ['projectPath', 'batchId'],
    },
  },
  {
    name: 'list_promotion_batches',
    description:
      'Returns all in-memory promotion batches, including their status, candidate lists, and PR URLs for any staging or main PRs that have been created.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
];
