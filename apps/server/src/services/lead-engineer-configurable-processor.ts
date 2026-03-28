/**
 * Configurable Processor — Generic processor driven by YAML config.
 *
 * Instead of writing a TypeScript class for every processor, define behavior
 * via ProcessorConfig in the workflow YAML:
 *
 * ```yaml
 * phases:
 *   - state: EXECUTE
 *     enabled: true
 *     processorConfig:
 *       prompt: |
 *         Scan the codebase for TODO comments and deprecated patterns.
 *         Output a JSON report with file, line, severity, description.
 *       tools: [Read, Grep, Glob, Bash]
 *       outputFormat: json
 *       maxTurns: 15
 * ```
 *
 * The ConfigurableProcessor:
 * 1. Runs pre-scripts (if any)
 * 2. Launches an agent with the configured prompt, tools, and model
 * 3. Captures the output in the specified format
 * 4. Runs post-scripts (if any)
 * 5. Writes results to the feature directory
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import * as fs from 'fs';
import { createLogger } from '@protolabsai/utils';
import type { ProcessorConfig } from '@protolabsai/types';
import type { StateContext, StateProcessor, StateTransitionResult } from './lead-engineer-types.js';
import { getFeatureDir } from '@protolabsai/platform';

const execAsync = promisify(exec);
const logger = createLogger('ConfigurableProcessor');

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const DEFAULT_MAX_TURNS = 20;

export class ConfigurableProcessor implements StateProcessor {
  constructor(private config: ProcessorConfig) {}

  async enter(ctx: StateContext): Promise<void> {
    logger.info(`[Configurable] Entering phase for feature ${ctx.feature.id}`, {
      outputFormat: this.config.outputFormat ?? 'text',
      maxTurns: this.config.maxTurns ?? DEFAULT_MAX_TURNS,
      hasPreScripts: (this.config.preScripts?.length ?? 0) > 0,
    });

    // Run pre-scripts
    if (this.config.preScripts?.length) {
      for (const script of this.config.preScripts) {
        try {
          const { stdout, stderr } = await execAsync(script, {
            cwd: ctx.projectPath,
            timeout: 30_000,
          });
          if (stdout.trim()) logger.debug(`[Configurable] pre-script output: ${stdout.trim()}`);
          if (stderr.trim()) logger.warn(`[Configurable] pre-script stderr: ${stderr.trim()}`);
        } catch (err) {
          logger.warn(`[Configurable] pre-script failed (non-fatal): ${err}`);
        }
      }
    }
  }

  async process(ctx: StateContext): Promise<StateTransitionResult> {
    const featureDir = getFeatureDir(ctx.projectPath, ctx.feature.id);

    // Build the agent prompt by combining the processor config prompt with feature context
    const systemPrompt = this.config.prompt;
    const featureContext = [
      `Feature: ${ctx.feature.title}`,
      `Description: ${ctx.feature.description}`,
      `Project: ${ctx.projectPath}`,
      ctx.feature.category ? `Category: ${ctx.feature.category}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    // Write the processor prompt to the feature dir so the agent picks it up
    const promptPath = path.join(featureDir, 'processor-prompt.md');
    fs.mkdirSync(featureDir, { recursive: true });
    fs.writeFileSync(
      promptPath,
      `# Processor Instructions\n\n${systemPrompt}\n\n# Feature Context\n\n${featureContext}\n`
    );

    // Store the config on the context so ExecuteProcessor can read it
    ctx.feature.spec = `${systemPrompt}\n\n---\n\nFeature: ${ctx.feature.title}\n${ctx.feature.description}`;

    logger.info(`[Configurable] Processor prompt written to ${promptPath}`);

    // Determine next state — configurable processors typically precede EXECUTE
    // If this IS the EXECUTE phase, transition forward; otherwise go to EXECUTE
    return {
      nextState: 'EXECUTE',
      shouldContinue: true,
      reason: 'Configurable processor prepared context for execution',
    };
  }

  async exit(ctx: StateContext): Promise<void> {
    // Run post-scripts
    if (this.config.postScripts?.length) {
      for (const script of this.config.postScripts) {
        try {
          const { stdout, stderr } = await execAsync(script, {
            cwd: ctx.projectPath,
            timeout: 30_000,
          });
          if (stdout.trim()) logger.debug(`[Configurable] post-script output: ${stdout.trim()}`);
          if (stderr.trim()) logger.warn(`[Configurable] post-script stderr: ${stderr.trim()}`);
        } catch (err) {
          logger.warn(`[Configurable] post-script failed (non-fatal): ${err}`);
        }
      }
    }
  }
}
