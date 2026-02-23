#!/usr/bin/env npx tsx
/**
 * Seed Langfuse Prompts
 *
 * One-time idempotent script that pushes all hardcoded prompts from @automaker/prompts
 * to Langfuse using dot-notation naming and the "production" label.
 *
 * Re-running creates new versions of existing prompts (idempotent, non-destructive).
 *
 * Usage:
 *   npx tsx scripts/seed-langfuse-prompts.ts
 *
 * Required env vars:
 *   LANGFUSE_PUBLIC_KEY
 *   LANGFUSE_SECRET_KEY
 *   LANGFUSE_BASE_URL (optional, defaults to https://cloud.langfuse.com)
 */

import dotenv from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Load .env from monorepo root
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '../.env') });

import {
  DEFAULT_AUTO_MODE_PROMPTS,
  DEFAULT_AGENT_PROMPTS,
  DEFAULT_BACKLOG_PLAN_PROMPTS,
  DEFAULT_ENHANCEMENT_PROMPTS,
  DEFAULT_COMMIT_MESSAGE_PROMPTS,
  DEFAULT_TITLE_GENERATION_PROMPTS,
  DEFAULT_ISSUE_VALIDATION_PROMPTS,
  DEFAULT_IDEATION_PROMPTS,
  DEFAULT_APP_SPEC_PROMPTS,
  DEFAULT_CONTEXT_DESCRIPTION_PROMPTS,
  DEFAULT_SUGGESTIONS_PROMPTS,
  DEFAULT_TASK_EXECUTION_PROMPTS,
} from '@automaker/prompts';

// --- Configuration ---

const LANGFUSE_PUBLIC_KEY = process.env.LANGFUSE_PUBLIC_KEY;
const LANGFUSE_SECRET_KEY = process.env.LANGFUSE_SECRET_KEY;
const LANGFUSE_BASE_URL = process.env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com';

if (!LANGFUSE_PUBLIC_KEY || !LANGFUSE_SECRET_KEY) {
  console.error('Error: LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY must be set in environment.');
  console.error('Set them in your .env file or export them before running this script.');
  process.exit(1);
}

// Build Basic auth header for Langfuse API
const authHeader = `Basic ${Buffer.from(`${LANGFUSE_PUBLIC_KEY}:${LANGFUSE_SECRET_KEY}`).toString('base64')}`;

// --- Prompt Catalog ---

interface PromptEntry {
  name: string;
  prompt: string;
}

/**
 * Build a flat list of all prompts with their Langfuse dot-notation names.
 * Format: "{category}.{key}"
 */
function buildPromptCatalog(): PromptEntry[] {
  const catalog: PromptEntry[] = [];

  // Resolved*Prompts interfaces have specific keys (no index signature),
  // so we use Object.entries which works at runtime regardless
  const toRecord = (obj: object): Record<string, string> => obj as Record<string, string>;

  const categories: Array<{ category: string; prompts: Record<string, string> }> = [
    { category: 'autoMode', prompts: toRecord(DEFAULT_AUTO_MODE_PROMPTS) },
    { category: 'agent', prompts: toRecord(DEFAULT_AGENT_PROMPTS) },
    { category: 'backlogPlan', prompts: toRecord(DEFAULT_BACKLOG_PLAN_PROMPTS) },
    { category: 'enhancement', prompts: toRecord(DEFAULT_ENHANCEMENT_PROMPTS) },
    { category: 'commitMessage', prompts: toRecord(DEFAULT_COMMIT_MESSAGE_PROMPTS) },
    { category: 'titleGeneration', prompts: toRecord(DEFAULT_TITLE_GENERATION_PROMPTS) },
    { category: 'issueValidation', prompts: toRecord(DEFAULT_ISSUE_VALIDATION_PROMPTS) },
    { category: 'ideation', prompts: toRecord(DEFAULT_IDEATION_PROMPTS) },
    { category: 'appSpec', prompts: toRecord(DEFAULT_APP_SPEC_PROMPTS) },
    { category: 'contextDescription', prompts: toRecord(DEFAULT_CONTEXT_DESCRIPTION_PROMPTS) },
    { category: 'suggestions', prompts: toRecord(DEFAULT_SUGGESTIONS_PROMPTS) },
    { category: 'taskExecution', prompts: toRecord(DEFAULT_TASK_EXECUTION_PROMPTS) },
  ];

  for (const { category, prompts } of categories) {
    for (const [key, value] of Object.entries(prompts)) {
      catalog.push({
        name: `${category}.${key}`,
        prompt: value,
      });
    }
  }

  return catalog;
}

// --- Langfuse API ---

async function createOrUpdatePrompt(
  entry: PromptEntry
): Promise<{ created: boolean; version: number }> {
  const url = `${LANGFUSE_BASE_URL}/api/public/v2/prompts`;

  const body = {
    name: entry.name,
    prompt: entry.prompt,
    type: 'text',
    labels: ['production'],
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to create prompt "${entry.name}": ${response.status} ${errorText}`);
  }

  const result = await response.json();
  return {
    created: true,
    version: result.version ?? 1,
  };
}

// --- Main ---

async function main() {
  console.log('=== Langfuse Prompt Seeder ===');
  console.log(`Base URL: ${LANGFUSE_BASE_URL}`);
  console.log('');

  const catalog = buildPromptCatalog();
  console.log(`Found ${catalog.length} prompts to seed across 12 categories.\n`);

  let succeeded = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const entry of catalog) {
    try {
      const result = await createOrUpdatePrompt(entry);
      console.log(`  ✓ ${entry.name} (v${result.version})`);
      succeeded++;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(`  ✗ ${entry.name}: ${msg}`);
      errors.push(`${entry.name}: ${msg}`);
      failed++;
    }
  }

  console.log('\n=== Summary ===');
  console.log(`  Succeeded: ${succeeded}`);
  console.log(`  Failed:    ${failed}`);
  console.log(`  Total:     ${catalog.length}`);

  if (errors.length > 0) {
    console.log('\nErrors:');
    for (const err of errors) {
      console.log(`  - ${err}`);
    }
  }

  console.log('\nAll prompts are labeled "production" in Langfuse.');
  console.log('Use Langfuse dashboard or MCP tools to edit/version/promote prompts.');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
