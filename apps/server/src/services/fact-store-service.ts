/**
 * Fact Store Service
 *
 * Extracts structured TrajectoryFact objects from agent output using a Haiku
 * model call and persists them to .automaker/trajectory/{featureId}/facts.json.
 *
 * Designed to be called fire-and-forget: extractAndSave() returns void and
 * never throws — all errors are caught and logged.
 */

import path from 'node:path';
import { randomUUID } from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { createLogger, atomicWriteJson } from '@protolabs-ai/utils';
import { resolveModelString } from '@protolabs-ai/model-resolver';
import type { TrajectoryFact } from '@protolabs-ai/types';

const logger = createLogger('FactStoreService');

const EXTRACTION_PROMPT = `You are a knowledge extractor for an AI development system. Your job is to extract structured facts from an AI agent's execution output.

Analyze the agent output below and extract discrete, reusable facts that would help future agents working on similar tasks. Focus on:
- **patterns**: Repeatable implementation patterns or approaches that worked well
- **gotchas**: Pitfalls, unexpected behaviors, or common mistakes to avoid
- **constraints**: Hard rules or limitations discovered during implementation
- **performance**: Observations about performance, efficiency, or scalability
- **decision**: Key architectural or design decisions made and their rationale

Return a JSON array of fact objects. Each object must have:
- "content": string — a concise, actionable statement (1-3 sentences)
- "category": one of "pattern" | "gotcha" | "constraint" | "performance" | "decision"
- "confidence": number between 0 and 1 — your confidence this fact is accurate and generalizable

Return ONLY valid JSON (an array). No markdown, no explanation.

Example:
[
  {"content": "Always call atomicWriteJson with createDirs: true when writing to new directories.", "category": "pattern", "confidence": 0.95},
  {"content": "The featureLoader.update() method does not create the feature directory — it must already exist.", "category": "gotcha", "confidence": 0.85}
]

Agent output to analyze:`;

/**
 * Fact Store Service — extracts and persists structured facts from agent output.
 */
export class FactStoreService {
  private anthropic: Anthropic;

  constructor() {
    this.anthropic = new Anthropic();
  }

  /**
   * Fire-and-forget: extract facts from agentOutput and write to facts.json.
   * Never throws — all errors are caught and logged.
   */
  extractAndSave(projectPath: string, featureId: string, agentOutput: string): void {
    void this._extractAndSave(projectPath, featureId, agentOutput).catch((err) => {
      logger.error('[FactStore] Unexpected error in extractAndSave:', err);
    });
  }

  private async _extractAndSave(
    projectPath: string,
    featureId: string,
    agentOutput: string
  ): Promise<void> {
    if (!agentOutput.trim()) {
      logger.debug('[FactStore] Empty agent output, skipping extraction');
      return;
    }

    const model = resolveModelString('haiku');
    const prompt = `${EXTRACTION_PROMPT}\n\n${agentOutput}`;

    let responseText: string;
    try {
      const response = await this.anthropic.messages.create({
        model,
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        logger.warn('[FactStore] Unexpected response type from model, skipping');
        return;
      }
      responseText = content.text;
    } catch (err) {
      logger.error('[FactStore] LLM call failed:', err);
      return;
    }

    let rawFacts: Array<{
      content?: unknown;
      category?: unknown;
      confidence?: unknown;
    }>;
    try {
      const parsed = JSON.parse(responseText);
      rawFacts = Array.isArray(parsed) ? parsed : [];
    } catch {
      logger.warn('[FactStore] Failed to parse JSON from model response, skipping');
      return;
    }

    const now = new Date().toISOString();
    const validCategories = new Set(['pattern', 'gotcha', 'constraint', 'performance', 'decision']);

    const facts: TrajectoryFact[] = rawFacts
      .filter((f) => {
        const confidence = typeof f.confidence === 'number' ? f.confidence : 0;
        return confidence >= 0.7 && validCategories.has(String(f.category));
      })
      .map(
        (f): TrajectoryFact => ({
          id: randomUUID(),
          content: String(f.content || '').trim(),
          category: f.category as TrajectoryFact['category'],
          confidence: typeof f.confidence === 'number' ? f.confidence : 0,
          featureId,
          createdAt: now,
        })
      )
      .filter((f) => f.content.length > 0);

    if (facts.length === 0) {
      logger.info('[FactStore] No high-confidence facts extracted for feature', { featureId });
      return;
    }

    const factsPath = path.join(projectPath, '.automaker', 'trajectory', featureId, 'facts.json');

    try {
      await atomicWriteJson(factsPath, facts, { createDirs: true });
      logger.info(`[FactStore] Saved ${facts.length} facts for feature ${featureId}`);
    } catch (err) {
      logger.error('[FactStore] Failed to write facts.json:', err);
    }
  }
}
