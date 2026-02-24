/**
 * Fan-Out Pairs Node
 *
 * Dispatches pair review subgraphs based on distillation depth:
 * - depth=0 (surface): Skip all pairs
 * - depth=1 (standard): Activate most relevant pair (Matt+Cindi)
 * - depth=2 (deep): Activate all three pairs in parallel
 *
 * Uses LangGraph Send() pattern for parallel execution.
 */

import { Send, Command } from '@langchain/langgraph';
import { DistillationDepth } from '@protolabs-ai/types';
import type { AntagonisticReviewState } from '../state.js';
import { ALL_PAIRS, MATT_CINDI_PAIR } from '../pairs.js';

/**
 * Fan-out node that dispatches pair reviews based on distillation depth
 *
 * Routes to pair_review node with appropriate pair configurations.
 * Uses Send() to enable parallel execution when depth=2.
 *
 * @param state - Current antagonistic review state
 * @returns Command with Send[] for parallel dispatch, or empty goto for skip
 */
export async function fanOutPairs(state: AntagonisticReviewState): Promise<Command> {
  const depth = state.distillationDepth ?? DistillationDepth.Surface;

  console.log(`[FanOutPairs] Distillation depth: ${depth}`);

  // depth=0 (surface): Skip pair reviews entirely
  if (depth === DistillationDepth.Surface) {
    console.log('[FanOutPairs] Depth=0, skipping all pair reviews');
    return new Command({ goto: 'aggregate_pairs' });
  }

  // depth=1 (standard): Activate most relevant pair (Matt+Cindi for performance)
  if (depth === DistillationDepth.Standard) {
    console.log(`[FanOutPairs] Depth=1, activating single pair: ${MATT_CINDI_PAIR.section}`);
    return new Command({
      goto: [new Send('pair_review', { pairConfig: MATT_CINDI_PAIR })],
    });
  }

  // depth=2 (deep): Activate all three pairs in parallel
  console.log(`[FanOutPairs] Depth=2, activating all ${ALL_PAIRS.length} pairs in parallel`);
  const sends = ALL_PAIRS.map((pairConfig) => new Send('pair_review', { pairConfig }));

  return new Command({ goto: sends });
}
