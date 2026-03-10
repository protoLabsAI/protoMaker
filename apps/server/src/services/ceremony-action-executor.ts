/**
 * CeremonyActionExecutor — Processes retro completion events and generates structured actions.
 *
 * Subscribes to ceremony:fired events for milestone_retro and project_retro.
 * For each retro, uses Haiku to classify retro items into three action types:
 *
 * 1. context-update: Learning that mentions a pattern/convention →
 *    append new rule to .automaker/context/<slug>.md
 *
 * 2. improvement-feature: couldImprove item →
 *    create backlog feature in the project with retro attribution
 *
 * 3. gate-tuning: Challenge with no resolution →
 *    emit gate:tuning-signal event for LeadEngineerRules to consume
 */

import path from 'path';
import fs from 'fs';
import Anthropic from '@anthropic-ai/sdk';
import { createLogger } from '@protolabsai/utils';
import { resolveModelString } from '@protolabsai/model-resolver';
import type { EventEmitter } from '../lib/events.js';
import type { FeatureLoader } from './feature-loader.js';
import type { MilestoneUpdateData, ProjectRetroData } from '@protolabsai/types';

const logger = createLogger('CeremonyActionExecutor');

// ---------------------------------------------------------------------------
// Event payload shape for ceremony:fired with optional retro data
// ---------------------------------------------------------------------------

interface CeremonyFiredPayload {
  type: string;
  projectPath: string;
  projectSlug: string;
  milestoneSlug?: string;
  retroData?: MilestoneUpdateData | ProjectRetroData;
}

// ---------------------------------------------------------------------------
// Classification types
// ---------------------------------------------------------------------------

type ActionType = 'context-update' | 'improvement-feature' | 'gate-tuning' | 'none';

interface ClassifiedItem {
  actionType: ActionType;
  item: string;
  /** For context-update: the context filename slug (without extension) */
  contextFile?: string;
  /** For context-update: the rule text to append */
  rule?: string;
  /** For improvement-feature: formatted feature title */
  featureTitle?: string;
  /** For gate-tuning: the signal description */
  signalDescription?: string;
}

// ---------------------------------------------------------------------------
// Classifier prompt
// ---------------------------------------------------------------------------

const CLASSIFIER_SYSTEM_PROMPT = `You are a retro action classifier for an AI development studio.
Given a retro item (a learning, improvement suggestion, or unresolved challenge), classify it into exactly one action type and extract a structured delta.

Action types:
- context-update: The item mentions a pattern, convention, or rule that agents should follow. Extract the rule and a short context filename slug (e.g. "testing-patterns", "api-conventions").
- improvement-feature: The item describes something that could be improved in the system or process. Extract a concise feature title (max 80 chars).
- gate-tuning: The item is an unresolved challenge with no clear resolution — something that may need retry limit or escalation threshold changes. Extract a short signal description.
- none: The item does not clearly fit any of the above.

Respond with ONLY valid JSON (no markdown, no code fences):
{
  "actionType": "<context-update|improvement-feature|gate-tuning|none>",
  "contextFile": "<slug-only, if context-update, else null>",
  "rule": "<rule text to append, if context-update, else null>",
  "featureTitle": "<feature title, if improvement-feature, else null>",
  "signalDescription": "<signal description, if gate-tuning, else null>"
}`;

// ---------------------------------------------------------------------------
// Haiku classification helper
// ---------------------------------------------------------------------------

async function classifyItem(anthropic: Anthropic, item: string): Promise<ClassifiedItem> {
  const model = resolveModelString('haiku');

  try {
    const response = await anthropic.messages.create({
      model,
      max_tokens: 512,
      system: CLASSIFIER_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `Classify this retro item:\n\n"${item}"` }],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      logger.warn('CeremonyActionExecutor: unexpected response type from model, skipping');
      return { actionType: 'none', item };
    }

    const cleaned = content.text.replace(/```(?:json)?\n?/g, '').trim();
    const parsed = JSON.parse(cleaned) as {
      actionType?: ActionType;
      contextFile?: string | null;
      rule?: string | null;
      featureTitle?: string | null;
      signalDescription?: string | null;
    };

    return {
      actionType: parsed.actionType ?? 'none',
      item,
      contextFile: parsed.contextFile ?? undefined,
      rule: parsed.rule ?? undefined,
      featureTitle: parsed.featureTitle ?? undefined,
      signalDescription: parsed.signalDescription ?? undefined,
    };
  } catch (err) {
    logger.warn(
      `CeremonyActionExecutor: failed to classify retro item: ${err instanceof Error ? err.message : String(err)}`
    );
    return { actionType: 'none', item };
  }
}

// ---------------------------------------------------------------------------
// Action helpers
// ---------------------------------------------------------------------------

async function applyContextUpdate(
  projectPath: string,
  contextFile: string,
  rule: string,
  retroSource: string
): Promise<void> {
  const contextDir = path.join(projectPath, '.automaker', 'context');
  try {
    await fs.promises.mkdir(contextDir, { recursive: true });
    const filePath = path.join(contextDir, `${contextFile}.md`);
    const timestamp = new Date().toISOString();
    const entry = `\n## Rule added from ${retroSource} (${timestamp})\n\n${rule}\n`;
    await fs.promises.appendFile(filePath, entry, 'utf-8');
    logger.info(`CeremonyActionExecutor: appended rule to ${filePath}`);
  } catch (err) {
    logger.warn(
      `CeremonyActionExecutor: failed to write context file "${contextFile}": ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

async function createImprovementFeature(
  featureLoader: FeatureLoader,
  emitter: EventEmitter,
  projectPath: string,
  featureTitle: string,
  retroSource: string,
  originalItem: string
): Promise<void> {
  try {
    const created = await featureLoader.create(projectPath, {
      title: featureTitle,
      description:
        `**Source**: Retro from ${retroSource}\n\n` +
        `**Original retro item**: ${originalItem}\n\n` +
        `_Auto-generated by CeremonyActionExecutor from retro analysis._`,
      status: 'backlog',
      category: 'System Improvements',
      complexity: 'small',
      priority: 4,
    });
    logger.info(
      `CeremonyActionExecutor: created backlog feature "${featureTitle}" from ${retroSource}`
    );
    emitter.emit('feature:created', {
      featureId: created.id,
      featureName: created.title,
      projectPath,
    });
  } catch (err) {
    logger.warn(
      `CeremonyActionExecutor: failed to create improvement feature: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

// ---------------------------------------------------------------------------
// Retro item extraction
// ---------------------------------------------------------------------------

/**
 * Extract classifiable text items from either MilestoneUpdateData or ProjectRetroData.
 * For unresolved challenges, prefixes the text with "UNRESOLVED:" so the classifier
 * can detect gate-tuning candidates.
 */
function extractItems(data: MilestoneUpdateData | ProjectRetroData): string[] {
  const items: string[] = [];

  if ('couldImprove' in data) {
    // ProjectRetroData
    const retro = data as ProjectRetroData;
    for (const l of retro.learnings ?? []) {
      items.push(l);
    }
    for (const c of retro.couldImprove ?? []) {
      items.push(c);
    }
  } else {
    // MilestoneUpdateData
    const milestone = data as MilestoneUpdateData;
    for (const l of milestone.learnings ?? []) {
      items.push(l);
    }
    for (const ch of milestone.challenges ?? []) {
      // Challenges with no (or empty) resolution are gate-tuning candidates
      const text = ch.resolution?.trim() ? ch.challenge : `UNRESOLVED: ${ch.challenge}`;
      items.push(text);
    }
  }

  return items;
}

// ---------------------------------------------------------------------------
// Main executor
// ---------------------------------------------------------------------------

export class CeremonyActionExecutor {
  private emitter: EventEmitter | null = null;
  private featureLoader: FeatureLoader | null = null;
  private unsubscribe: (() => void) | null = null;
  private anthropic: Anthropic | null = null;

  initialize(emitter: EventEmitter, featureLoader: FeatureLoader): void {
    this.emitter = emitter;
    this.featureLoader = featureLoader;
    this.anthropic = new Anthropic();

    this.unsubscribe = emitter.subscribe((type, payload) => {
      if (type === 'ceremony:fired') {
        const p = payload as CeremonyFiredPayload;
        if (p.type === 'milestone_retro' || p.type === 'project_retro') {
          this.handleRetroCompleted(p).catch((err) =>
            logger.warn('CeremonyActionExecutor: retro handler error:', err)
          );
        }
      }
    });

    logger.info('CeremonyActionExecutor initialized');
  }

  destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.emitter = null;
    this.featureLoader = null;
    this.anthropic = null;
  }

  private async handleRetroCompleted(payload: CeremonyFiredPayload): Promise<void> {
    const { projectPath, projectSlug, milestoneSlug, type, retroData } = payload;

    if (!retroData) {
      logger.debug(`CeremonyActionExecutor: no retroData for ${type} in ${projectSlug}, skipping`);
      return;
    }

    if (!this.anthropic || !this.featureLoader || !this.emitter) {
      logger.warn('CeremonyActionExecutor: not fully initialized, skipping');
      return;
    }

    const retroSource = milestoneSlug ? `${projectSlug}/${milestoneSlug}` : projectSlug;

    logger.info(`CeremonyActionExecutor: processing ${type} for ${retroSource}`);

    const items = extractItems(retroData);
    if (items.length === 0) {
      logger.debug(`CeremonyActionExecutor: no items to process for ${retroSource}`);
      return;
    }

    // Classify all items in parallel (lightweight Haiku calls)
    const anthropic = this.anthropic;
    const classified = await Promise.all(items.map((item) => classifyItem(anthropic, item)));

    // Apply actions sequentially to avoid race conditions on file writes
    for (const result of classified) {
      if (result.actionType === 'context-update' && result.contextFile && result.rule) {
        await applyContextUpdate(projectPath, result.contextFile, result.rule, retroSource);
      } else if (
        result.actionType === 'improvement-feature' &&
        result.featureTitle &&
        this.featureLoader
      ) {
        await createImprovementFeature(
          this.featureLoader,
          this.emitter,
          projectPath,
          result.featureTitle,
          retroSource,
          result.item
        );
      }
    }

    logger.info(
      `CeremonyActionExecutor: processed ${classified.length} retro items for ${retroSource}`
    );
  }
}

// Singleton instance
export const ceremonyActionExecutor = new CeremonyActionExecutor();
