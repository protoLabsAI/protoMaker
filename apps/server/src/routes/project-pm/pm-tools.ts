/**
 * PM Ceremony Tools
 *
 * Provides four PM tools that write ceremony artifacts to the project timeline:
 *   - run_standup: summarize recent progress, blockers, next steps
 *   - run_retro: analyze what worked/didn't, action items
 *   - post_status_update: write a status update entry to the timeline
 *   - post_decision: record an architectural or strategic decision with rationale
 */

import { z } from 'zod';
import type { Tool } from 'ai';
import { projectTimelineService } from '../../services/project-timeline-service.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeTool<TSchema extends z.ZodType<any>>(config: {
  description: string;
  inputSchema: TSchema;
  execute: (input: z.infer<TSchema>) => Promise<unknown>;
}): Tool {
  return config as unknown as Tool;
}

/**
 * Build the four PM ceremony tools, scoped to a specific project.
 */
export function buildCeremonyTools(projectPath: string, projectSlug: string): Record<string, Tool> {
  return {
    run_standup: makeTool({
      description:
        'Generate and post a standup report to the project timeline. ' +
        'Summarizes recent progress, current blockers, and next steps.',
      inputSchema: z.object({
        progress: z.string().describe('What was accomplished since the last standup (markdown)'),
        blockers: z
          .string()
          .optional()
          .describe('Current blockers or impediments (markdown, omit if none)'),
        nextSteps: z.string().describe('What will be worked on next (markdown)'),
      }),
      execute: async ({ progress, blockers, nextSteps }) => {
        const lines: string[] = [
          `## Standup — ${new Date().toISOString().slice(0, 10)}`,
          '',
          '### Progress',
          progress,
          '',
          '### Next Steps',
          nextSteps,
        ];

        if (blockers) {
          lines.push('', '### Blockers', blockers);
        }

        const content = lines.join('\n');

        const entry = await projectTimelineService.appendEntry(projectPath, projectSlug, {
          type: 'standup',
          content,
          author: 'pm',
          metadata: { generatedAt: new Date().toISOString() },
        });

        return { ok: true, entryId: entry.id, type: 'standup' };
      },
    }),

    run_retro: makeTool({
      description:
        'Generate and post a retrospective report to the project timeline. ' +
        'Analyzes what worked well, what did not, and captures action items.',
      inputSchema: z.object({
        wentWell: z.string().describe('What went well during this period/milestone (markdown)'),
        didNotGoWell: z.string().describe('What did not go well or could be improved (markdown)'),
        actionItems: z.string().describe('Concrete action items for the next period (markdown)'),
        milestoneSlug: z
          .string()
          .optional()
          .describe('The milestone this retro covers (if applicable)'),
      }),
      execute: async ({ wentWell, didNotGoWell, actionItems, milestoneSlug }) => {
        const scope = milestoneSlug ? ` — Milestone: ${milestoneSlug}` : '';
        const lines: string[] = [
          `## Retrospective${scope} — ${new Date().toISOString().slice(0, 10)}`,
          '',
          '### What Went Well',
          wentWell,
          '',
          '### What Did Not Go Well',
          didNotGoWell,
          '',
          '### Action Items',
          actionItems,
        ];

        const content = lines.join('\n');

        const entry = await projectTimelineService.appendEntry(projectPath, projectSlug, {
          type: 'retro',
          content,
          author: 'pm',
          metadata: {
            generatedAt: new Date().toISOString(),
            ...(milestoneSlug ? { milestoneSlug } : {}),
          },
        });

        return { ok: true, entryId: entry.id, type: 'retro' };
      },
    }),

    post_status_update: makeTool({
      description:
        'Post a status update entry to the project timeline. ' +
        'Use this to record a snapshot of project health and key developments.',
      inputSchema: z.object({
        summary: z.string().describe('Status update body (markdown)'),
        health: z.enum(['on-track', 'at-risk', 'off-track']).describe('Current project health'),
      }),
      execute: async ({ summary, health }) => {
        const content = [
          `## Status Update — ${new Date().toISOString().slice(0, 10)}`,
          '',
          `**Health:** ${health}`,
          '',
          summary,
        ].join('\n');

        const entry = await projectTimelineService.appendEntry(projectPath, projectSlug, {
          type: 'status_report',
          content,
          author: 'pm',
          metadata: { health, generatedAt: new Date().toISOString() },
        });

        return { ok: true, entryId: entry.id, type: 'status_report' };
      },
    }),

    post_decision: makeTool({
      description:
        'Record an architectural or strategic decision with its rationale in the project timeline. ' +
        'Use this to create a durable decision log entry (ADR-style).',
      inputSchema: z.object({
        title: z.string().describe('Short title for the decision'),
        context: z.string().describe('Background context that drove this decision (markdown)'),
        decision: z.string().describe('The decision that was made (markdown)'),
        rationale: z.string().describe('Why this option was chosen over alternatives (markdown)'),
        consequences: z.string().optional().describe('Known consequences or trade-offs (markdown)'),
      }),
      execute: async ({ title, context, decision, rationale, consequences }) => {
        const lines: string[] = [
          `## Decision: ${title}`,
          `_Recorded: ${new Date().toISOString().slice(0, 10)}_`,
          '',
          '### Context',
          context,
          '',
          '### Decision',
          decision,
          '',
          '### Rationale',
          rationale,
        ];

        if (consequences) {
          lines.push('', '### Consequences', consequences);
        }

        const content = lines.join('\n');

        const entry = await projectTimelineService.appendEntry(projectPath, projectSlug, {
          type: 'decision',
          content,
          author: 'pm',
          metadata: { title, generatedAt: new Date().toISOString() },
        });

        return { ok: true, entryId: entry.id, type: 'decision' };
      },
    }),
  };
}
