/**
 * Feature title generator service.
 *
 * Produces a concise, human-readable feature title from a description using
 * the fast model tier (titleGenerationModel) and captures every input→output
 * pair as training data so a small purpose-built model can be distilled later.
 *
 * Returns `null` when it cannot produce a title (no description, model failure,
 * or empty result) so the caller falls back to deterministic behavior. Never throws.
 */

import { createLogger } from '@protolabsai/utils';
import { resolvePhaseModel } from '@protolabsai/model-resolver';
import { simpleQuery } from '../providers/simple-query-service.js';
import { getPromptCustomization, getPhaseModelWithOverrides } from '../lib/settings-helpers.js';
import { captureTrainingRow } from './training-capture.js';
import type { SettingsService } from './settings-service.js';

const logger = createLogger('TitleGenerator');

/**
 * Generate a concise feature title from a description using the configured
 * title-generation model and prompts.
 *
 * @returns The generated title string, or `null` on failure / empty input.
 */
export async function generateFeatureTitle(
  description: string,
  settingsService?: SettingsService | null,
  projectPath?: string
): Promise<string | null> {
  try {
    const trimmed = description.trim();
    if (!trimmed) return null;

    // Get customized prompts from settings
    const prompts = await getPromptCustomization(settingsService, '[TitleGenerator]');
    const systemPrompt = prompts.titleGeneration.systemPrompt;

    const userPrompt = `Generate a concise title for this feature:\n\n${trimmed}`;

    // Resolve model via phase-model settings (titleGenerationModel)
    const credentials = await settingsService?.getCredentials();

    const { phaseModel } = await getPhaseModelWithOverrides(
      'titleGenerationModel',
      settingsService,
      projectPath,
      '[TitleGenerator]'
    );
    const { model } = resolvePhaseModel(phaseModel);

    const result = await simpleQuery({
      prompt: `${systemPrompt}\n\n${userPrompt}`,
      model,
      cwd: process.cwd(),
      maxTurns: 1,
      allowedTools: [],
      credentials,
    });

    const title = (result.text ?? '').trim();

    // Capture the input→output pair as training data (non-blocking; #3859).
    if (projectPath && title) {
      void captureTrainingRow(projectPath, {
        task: 'feature-title',
        model,
        input: { description: trimmed.slice(0, 500) },
        output: title,
      });
    }

    if (!title) return null;

    logger.info(`Generated title: ${title}`);
    return title;
  } catch (err) {
    logger.debug('Title generation failed; returning null for fallback', err);
    return null;
  }
}
