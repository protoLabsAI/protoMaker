/**
 * PromptSeedService — Seeds default prompts into Langfuse as managed baselines.
 *
 * Uploads the key prompt templates from @automaker/prompts to Langfuse,
 * enabling version tracking, A/B experiments, and rollout management
 * through the Langfuse dashboard.
 *
 * Prompt naming convention: `{category}.{key}` (e.g., `autoMode.featurePromptTemplate`)
 * This matches the PromptResolver lookup pattern.
 */

import { createLogger } from '@automaker/utils';
import { DEFAULT_PROMPTS } from '@automaker/prompts';
import type { LangfuseClient } from '@automaker/observability';
import { getLangfuseInstance } from '../lib/langfuse-singleton.js';

const logger = createLogger('PromptSeedService');

/** Result of seeding a single prompt */
interface SeedResult {
  name: string;
  version: number;
  status: 'created' | 'skipped' | 'error';
  error?: string;
}

/** Summary of a seed operation */
export interface SeedSummary {
  total: number;
  created: number;
  skipped: number;
  errors: number;
  results: SeedResult[];
}

/**
 * The prompt catalog — maps Langfuse prompt names to their default values.
 * Only includes high-impact prompts used by auto-mode agents.
 * Category.key naming matches PromptResolver lookup convention.
 */
function buildPromptCatalog(): Array<{
  name: string;
  prompt: string;
  tags: string[];
}> {
  const catalog: Array<{ name: string; prompt: string; tags: string[] }> = [];

  // Auto-mode prompts (most impactful for agent quality)
  const autoMode = DEFAULT_PROMPTS.autoMode;
  catalog.push(
    {
      name: 'autoMode.featurePromptTemplate',
      prompt: autoMode.featurePromptTemplate,
      tags: ['auto-mode', 'agent', 'high-impact'],
    },
    {
      name: 'autoMode.planningLite',
      prompt: autoMode.planningLite,
      tags: ['auto-mode', 'planning'],
    },
    {
      name: 'autoMode.planningSpec',
      prompt: autoMode.planningSpec,
      tags: ['auto-mode', 'planning'],
    },
    {
      name: 'autoMode.planningFull',
      prompt: autoMode.planningFull,
      tags: ['auto-mode', 'planning'],
    }
  );

  // Task execution prompts
  const taskExec = DEFAULT_PROMPTS.taskExecution;
  catalog.push(
    {
      name: 'taskExecution.implementationInstructions',
      prompt: taskExec.implementationInstructions,
      tags: ['task-execution', 'agent', 'high-impact'],
    },
    {
      name: 'taskExecution.taskPromptTemplate',
      prompt: taskExec.taskPromptTemplate,
      tags: ['task-execution', 'agent'],
    }
  );

  // Agent system prompt
  catalog.push({
    name: 'agent.systemPrompt',
    prompt: DEFAULT_PROMPTS.agent.systemPrompt,
    tags: ['agent', 'system-prompt'],
  });

  // Backlog planning
  const backlog = DEFAULT_PROMPTS.backlogPlan;
  catalog.push({
    name: 'backlogPlan.systemPrompt',
    prompt: backlog.systemPrompt,
    tags: ['planning', 'backlog'],
  });

  return catalog;
}

export class PromptSeedService {
  private static instance: PromptSeedService;

  static getInstance(): PromptSeedService {
    if (!PromptSeedService.instance) {
      PromptSeedService.instance = new PromptSeedService();
    }
    return PromptSeedService.instance;
  }

  /**
   * Seed all default prompts to Langfuse as v1 baselines.
   *
   * @param labels - Labels to apply (default: ["production"])
   * @param force - If true, creates new versions even if prompt exists
   */
  async seedDefaults(labels: string[] = ['production'], force = false): Promise<SeedSummary> {
    const langfuse = getLangfuseInstance();

    if (!langfuse.isAvailable()) {
      logger.warn('Langfuse not available — cannot seed prompts');
      return { total: 0, created: 0, skipped: 0, errors: 0, results: [] };
    }

    const catalog = buildPromptCatalog();
    const results: SeedResult[] = [];

    for (const entry of catalog) {
      const result = await this.seedPrompt(langfuse, entry, labels, force);
      results.push(result);
    }

    const summary: SeedSummary = {
      total: results.length,
      created: results.filter((r) => r.status === 'created').length,
      skipped: results.filter((r) => r.status === 'skipped').length,
      errors: results.filter((r) => r.status === 'error').length,
      results,
    };

    logger.info(
      `Prompt seeding complete: ${summary.created} created, ${summary.skipped} skipped, ${summary.errors} errors`
    );

    return summary;
  }

  private async seedPrompt(
    langfuse: LangfuseClient,
    entry: { name: string; prompt: string; tags: string[] },
    labels: string[],
    force: boolean
  ): Promise<SeedResult> {
    try {
      // Check if prompt already exists (skip unless force)
      if (!force) {
        const existing = await langfuse.getPrompt(entry.name);
        if (existing) {
          logger.debug(`Prompt already exists: ${entry.name} (v${existing.version}), skipping`);
          return { name: entry.name, version: existing.version, status: 'skipped' };
        }
      }

      const result = await langfuse.createPrompt({
        name: entry.name,
        prompt: entry.prompt,
        labels,
        tags: entry.tags,
        commitMessage: force
          ? 'Baseline update from prompt seed service'
          : 'Initial baseline from @automaker/prompts defaults',
      });

      if (!result) {
        return {
          name: entry.name,
          version: 0,
          status: 'error',
          error: 'createPrompt returned null',
        };
      }

      return { name: entry.name, version: result.version, status: 'created' };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to seed prompt ${entry.name}:`, error);
      return { name: entry.name, version: 0, status: 'error', error: msg };
    }
  }

  /**
   * Get the prompt catalog without seeding — useful for documentation.
   */
  getCatalog(): Array<{ name: string; tags: string[] }> {
    return buildPromptCatalog().map((e) => ({ name: e.name, tags: e.tags }));
  }
}
