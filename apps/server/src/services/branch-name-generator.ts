/**
 * Smart branch-name generator (#3794).
 *
 * Produces a concise, human-readable feature branch name using the fast model
 * tier (protolabs/fast) instead of a plain deterministic slug — and captures
 * every input→output pair as training data so a small purpose-built model can
 * be distilled for this task later (#3859).
 *
 * Designed for dependency injection into FeatureLoader: returns `null` whenever
 * it can't (or shouldn't) produce a smart name — disabled by setting, no title,
 * model failure, or a degenerate result — so the caller falls back to the
 * deterministic slug. It never throws.
 */

import { createLogger } from '@protolabsai/utils';
import { resolvePhaseModel } from '@protolabsai/model-resolver';
import { simpleQuery } from '../providers/simple-query-service.js';
import { getWorkflowSettings, getPhaseModelWithOverrides } from '../lib/settings-helpers.js';
import { captureTrainingRow } from './training-capture.js';
import type { SettingsService } from './settings-service.js';

const logger = createLogger('SmartBranchName');

export interface SmartBranchInput {
  title?: string;
  description?: string;
  category?: string;
  featureId?: string;
}

export type SmartBranchNameGenerator = (
  input: SmartBranchInput,
  projectPath: string
) => Promise<string | null>;

/**
 * Build a smart-branch-name generator. `branchPrefixForCategory` is injected so
 * the prefix convention stays in one place (FeatureLoader).
 */
export function createSmartBranchNameGenerator(
  settingsService: SettingsService | null,
  branchPrefixForCategory: (category?: string) => string
): SmartBranchNameGenerator {
  return async (input, projectPath) => {
    try {
      const ws = await getWorkflowSettings(projectPath, settingsService);
      if (!ws.smartBranchNames) return null; // disabled → deterministic slug

      const title = input.title?.trim();
      if (!title) return null;

      const prefix = branchPrefixForCategory(input.category);
      const shortId = (input.featureId ?? Date.now().toString(36)).slice(-7);

      // Model comes from the phase-model settings (Settings → AI Models →
      // branchNameModel), not a hardcoded id — defaults to the nano tier.
      const { phaseModel } = await getPhaseModelWithOverrides(
        'branchNameModel',
        settingsService,
        projectPath,
        '[SmartBranchName]'
      );
      const { model } = resolvePhaseModel(phaseModel);

      let slug = '';
      let usedFallback = true;
      try {
        const res = await simpleQuery({
          prompt:
            `Generate a concise git branch slug for this work. ` +
            `Rules: 2-5 words, lowercase, hyphen-separated, no path prefix, no quotes, no trailing id. ` +
            `Return ONLY the slug.\n\nTitle: ${title}\nDescription: ${(input.description ?? '').slice(0, 300)}`,
          model,
          cwd: projectPath,
          maxTurns: 1,
        });
        slug = (res.text ?? '')
          .trim()
          .toLowerCase()
          .split('\n')[0]
          .replace(/[^a-z0-9-]/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 50);
        if (slug.length >= 3) usedFallback = false;
      } catch (err) {
        logger.debug('fast-model branch-name generation failed; deterministic fallback', err);
      }

      const branchName = usedFallback ? null : `${prefix}/${slug}-${shortId}`;

      // Capture the input→output pair as training data (non-blocking, fail-open).
      void captureTrainingRow(projectPath, {
        task: 'branch-name',
        model,
        input: {
          title,
          description: (input.description ?? '').slice(0, 500),
          category: input.category ?? '',
        },
        output: branchName ?? '<deterministic-fallback>',
        usedFallback,
      });

      return branchName; // null → caller uses the deterministic slug
    } catch (err) {
      logger.debug('smart branch-name generator error; deterministic fallback', err);
      return null;
    }
  };
}
