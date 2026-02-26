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
      'List promotion candidates — features or commits eligible to be promoted to staging. Optionally filter by status (e.g. "pending", "promoted", "failed").',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          description:
            'Optional status filter. Common values: "pending", "promoted", "failed". Omit to list all candidates.',
        },
      },
      required: [],
    },
  },
  {
    name: 'create_promotion_batch',
    description:
      'Create a PromotionBatch from a list of staging candidate IDs. Returns the created batch including its batchId for use with promote_to_staging or promote_to_main.',
    inputSchema: {
      type: 'object',
      properties: {
        candidateIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of staging candidate IDs to include in this promotion batch.',
        },
        batchId: {
          type: 'string',
          description:
            'Optional custom batch ID. If omitted, a unique ID is generated automatically.',
        },
      },
      required: ['candidateIds'],
    },
  },
  {
    name: 'promote_to_staging',
    description:
      'Ava-autonomous: Promote a batch to staging by cherry-picking commits, opening a staging PR, and auto-merging it. This tool is fully autonomous — no human approval is needed for staging promotions.',
    inputSchema: {
      type: 'object',
      properties: {
        batchId: {
          type: 'string',
          description: 'The promotion batch ID to promote to staging.',
        },
      },
      required: ['batchId'],
    },
  },
  {
    name: 'promote_to_main',
    description:
      'Creates the PR but does NOT merge. Human approval required via HITL form. Ava calls this to initiate a staging→main promotion, which opens a PR and fires a HITL form for a human to review and approve before any merge occurs.',
    inputSchema: {
      type: 'object',
      properties: {
        batchId: {
          type: 'string',
          description: 'The promotion batch ID to promote from staging to main.',
        },
      },
      required: ['batchId'],
    },
  },
  {
    name: 'get_promotion_status',
    description:
      'Returns the current state of the promotion pipeline: queue depth (candidates awaiting promotion), batch count, last promotion date, and any pending HITL forms awaiting human approval.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
];
