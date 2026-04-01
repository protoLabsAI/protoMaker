/**
 * Context Fidelity Service
 *
 * Shapes prior context before passing it to agents. Controls how much
 * of the previous agent-output.md is included based on the pipeline stage.
 *
 * Modes:
 * - full:    Entire agent-output.md (unbounded)
 * - compact: Headings + summary + final result, strip tool calls (~2000 tokens)
 * - summary: Haiku-generated summary (~500 tokens)
 * - none:    Nothing — fresh start
 */

import { createLogger } from '@protolabsai/utils';
import type { ContextFidelityMode } from '@protolabsai/types';

const logger = createLogger('ContextFidelityService');

const COMPACT_MAX_CHARS = 8000; // ~2000 tokens

export class ContextFidelityService {
  /**
   * Shape prior agent output according to the fidelity mode.
   */
  async shape(agentOutput: string, mode: ContextFidelityMode): Promise<string> {
    switch (mode) {
      case 'full':
        return agentOutput;

      case 'compact':
        return this.compactOutput(agentOutput);

      case 'summary':
        return this.summaryOutput(agentOutput);

      case 'none':
        return '';

      default:
        logger.warn(`Unknown fidelity mode "${mode}", falling back to full`);
        return agentOutput;
    }
  }

  /**
   * Determine the appropriate fidelity mode for a given stage and context.
   */
  resolveMode(
    stage: string,
    opts?: { isRetry?: boolean; isRemediation?: boolean; hasPlan?: boolean }
  ): ContextFidelityMode {
    if (stage === 'PLAN') return 'none';
    if (stage === 'EXECUTE' && opts?.isRetry) return 'compact';
    if (stage === 'EXECUTE' && opts?.hasPlan) return 'compact';
    if (stage === 'EXECUTE') return 'none';
    if (stage === 'REVIEW' && opts?.isRemediation) return 'compact';
    return 'none';
  }

  /**
   * Extract headings, summary sections, and final result from agent output.
   * Strips tool call blocks and verbose intermediate content.
   */
  private compactOutput(output: string): string {
    const lines = output.split('\n');
    const result: string[] = [];
    let inToolBlock = false;

    for (const line of lines) {
      // Skip tool call blocks
      if (line.startsWith('🔧 Tool:') || line.startsWith('Input: {')) {
        inToolBlock = true;
        continue;
      }

      // End tool block on next heading or empty line after content
      if (inToolBlock) {
        if (line.startsWith('#') || line.startsWith('## ') || line.trim() === '') {
          inToolBlock = false;
        } else {
          continue;
        }
      }

      // Keep headings
      if (line.startsWith('#')) {
        result.push(line);
        continue;
      }

      // Keep summary-like sections
      if (
        line.toLowerCase().includes('summary') ||
        line.toLowerCase().includes('result') ||
        line.toLowerCase().includes('conclusion') ||
        line.toLowerCase().includes('changes made') ||
        line.toLowerCase().includes('error')
      ) {
        result.push(line);
        continue;
      }

      // Keep non-empty content lines up to the limit
      if (line.trim() && result.join('\n').length < COMPACT_MAX_CHARS) {
        result.push(line);
      }
    }

    const compacted = result.join('\n').slice(0, COMPACT_MAX_CHARS);
    logger.debug(`Compacted ${output.length} chars → ${compacted.length} chars`);
    return compacted;
  }

  /**
   * Generate a brief summary of agent output.
   * Uses simple extraction (not LLM) for speed and predictability.
   */
  private summaryOutput(output: string): string {
    // Extract headings and first sentence of each section
    const lines = output.split('\n');
    const summaryParts: string[] = [];
    let lastHeading = '';

    for (const line of lines) {
      if (line.startsWith('#')) {
        lastHeading = line;
        summaryParts.push(line);
      } else if (lastHeading && line.trim() && summaryParts.length < 20) {
        // Take first content line after each heading
        summaryParts.push(line.trim().split('.')[0] + '.');
        lastHeading = '';
      }
    }

    const summary = summaryParts.join('\n').slice(0, 2000);
    logger.debug(`Summarized ${output.length} chars → ${summary.length} chars`);
    return summary;
  }
}
