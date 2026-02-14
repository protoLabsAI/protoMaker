/**
 * Analyze Lessons Node
 *
 * Analyzes milestone achievements and derives lessons learned.
 * Currently uses deterministic heuristic — will be LLM-powered
 * when integrated into the server runtime.
 *
 * The LLM node will analyze:
 * - Technical patterns that emerged
 * - Process improvements discovered
 * - Collaboration insights
 * - Quality learnings
 */

import type { MilestoneSummaryState, LessonLearned } from '../types.js';

/**
 * Deterministic lesson analysis (mock)
 *
 * In production, this will be replaced with an LLM call that analyzes
 * the achievements and derives meaningful lessons learned.
 */
export async function analyzeLessons(
  state: MilestoneSummaryState
): Promise<Partial<MilestoneSummaryState>> {
  try {
    const { achievements } = state;

    // Mock heuristic: generate lessons based on achievement count and cost
    const lessonsLearned: LessonLearned[] = [];

    if (achievements.length > 0) {
      const totalCost = achievements.reduce((sum, a) => sum + (a.costUsd ?? 0), 0);
      const avgCost = totalCost / achievements.length;

      // Technical lesson
      lessonsLearned.push({
        category: 'technical',
        insight:
          'LangGraph flow architecture enables modular, testable implementations with clear node boundaries',
        impact: 'positive',
        actionItems: [
          'Continue using mock-first pattern for rapid development',
          'Document node injection patterns for LLM integration',
        ],
      });

      // Process lesson
      if (avgCost < 2.0) {
        lessonsLearned.push({
          category: 'process',
          insight: 'Deterministic nodes kept costs low during initial development',
          impact: 'positive',
          actionItems: ['Maintain mock implementations until integration phase'],
        });
      }

      // Collaboration lesson
      lessonsLearned.push({
        category: 'collaboration',
        insight: 'Feature-specific worktrees prevented merge conflicts across parallel work',
        impact: 'positive',
      });

      // Quality lesson
      lessonsLearned.push({
        category: 'quality',
        insight: 'Antagonistic review pattern ensures high-quality outputs before finalization',
        impact: 'positive',
        actionItems: ['Apply review pattern to all summarization flows'],
      });
    }

    return { lessonsLearned };
  } catch (err) {
    return {
      error: `Failed to analyze lessons: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
