/**
 * Format Milestone Summary Node
 *
 * Formats the approved summary into final markdown output.
 * Combines draft summary with structured milestone report data.
 *
 * This node creates both:
 * - formattedReport: Final markdown string for display
 * - milestoneReport: Structured data for programmatic access
 */

import type { MilestoneSummaryState, MilestoneReport } from '../types.js';

/**
 * Format the final milestone summary output
 */
export async function formatMilestoneSummary(
  state: MilestoneSummaryState
): Promise<Partial<MilestoneSummaryState>> {
  try {
    const { milestoneName, draftSummary, achievements, lessonsLearned, nextMilestonePreview } =
      state;

    if (!draftSummary) {
      return {
        error: 'No draft summary to format',
      };
    }

    // Calculate total cost
    const totalCostUsd = achievements.reduce((sum, a) => sum + (a.costUsd ?? 0), 0);

    // Create structured milestone report
    const milestoneReport: MilestoneReport = {
      milestoneName,
      completedAt: new Date().toISOString(),
      totalFeatures: achievements.length,
      totalCostUsd,
      achievements,
      lessonsLearned,
      nextMilestone: nextMilestonePreview,
      summary: draftSummary,
    };

    // Format the final markdown report
    const formattedReport = `${draftSummary}

---

## Milestone Metrics

- **Total Features**: ${achievements.length}
- **Total Cost**: $${totalCostUsd.toFixed(2)}
- **Completion Date**: ${new Date().toLocaleDateString()}
- **Lessons Learned**: ${lessonsLearned.length}

${
  nextMilestonePreview
    ? `
## Looking Ahead: ${nextMilestonePreview.milestoneName}

${nextMilestonePreview.description}

**Key Features**:
${nextMilestonePreview.keyFeatures.map((f) => `- ${f}`).join('\n')}
${nextMilestonePreview.estimatedDuration ? `\n**Estimated Duration**: ${nextMilestonePreview.estimatedDuration}` : ''}
${nextMilestonePreview.dependencies && nextMilestonePreview.dependencies.length > 0 ? `\n**Dependencies**: ${nextMilestonePreview.dependencies.join(', ')}` : ''}
`
    : ''
}`;

    return {
      milestoneReport,
      formattedReport,
    };
  } catch (err) {
    return {
      error: `Failed to format summary: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
