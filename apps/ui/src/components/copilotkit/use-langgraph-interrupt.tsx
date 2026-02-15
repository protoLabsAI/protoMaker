/**
 * LangGraph Interrupt Handler
 *
 * Registers CopilotKit human-in-the-loop tools that handle interrupt events
 * from LangGraph flows. Each interrupt type gets a dedicated HITL tool.
 *
 * When a LangGraph flow calls `interrupt(payload)`, the AG-UI protocol
 * routes it to the matching HITL tool's render component. The user
 * responds via the dialog, and `respond()` resumes the graph.
 *
 * Usage:
 * ```tsx
 * function InterruptHandler() {
 *   useLangGraphInterrupt();
 *   return null;
 * }
 * ```
 */

import { useHumanInTheLoop } from '@copilotkitnext/react';
import { z } from 'zod';
import { GenericApprovalDialog } from './generic-dialog';
import { EntityWizard } from './entity-wizard';

/**
 * Registers all HITL interrupt handlers with CopilotKit.
 * Must be called inside a CopilotKitProvider context.
 *
 * Each interrupt type from InterruptPayload gets its own HITL tool:
 * - approve_prd: PRD review gate
 * - approve_entities: Entity review gate
 * - approve_phase: Phase approval gate
 * - approve_generic: Generic approval gate
 */
export function useLangGraphInterrupt() {
  useHumanInTheLoop(
    {
      name: 'approve_prd',
      description: 'Review and approve a PRD document before the pipeline continues',
      parameters: z.object({
        type: z.literal('prd-review'),
        prdTitle: z.string(),
        prdContent: z.string(),
      }),
      render: ({ args, respond }) => {
        if (!respond) {
          return <div className="p-4 text-sm text-muted-foreground">Loading PRD review...</div>;
        }
        return (
          <GenericApprovalDialog
            open={true}
            title={`PRD Review: ${args.prdTitle}`}
            message={args.prdContent?.substring(0, 500) || 'Review the PRD document'}
            onResolve={(approved) => respond({ approved })}
          />
        );
      },
    },
    []
  );

  useHumanInTheLoop(
    {
      name: 'approve_entities',
      description: 'Review and approve extracted entities using a multi-step wizard',
      parameters: z.object({
        type: z.literal('entity-review'),
        entities: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            type: z.string(),
            approved: z.boolean().optional(),
          })
        ),
      }),
      render: ({ args, respond }) => {
        if (!respond) {
          return <div className="p-4 text-sm text-muted-foreground">Loading entity review...</div>;
        }
        return (
          <EntityWizard
            open={true}
            entities={args.entities ?? []}
            onResolve={(decisions) => respond({ decisions })}
            onCancel={() => respond({ cancelled: true })}
          />
        );
      },
    },
    []
  );

  useHumanInTheLoop(
    {
      name: 'approve_phase',
      description: 'Approve a content pipeline phase before it proceeds to the next stage',
      parameters: z.object({
        type: z.literal('phase-approval'),
        phaseTitle: z.string(),
        phaseDescription: z.string(),
      }),
      render: ({ args, respond }) => {
        if (!respond) {
          return <div className="p-4 text-sm text-muted-foreground">Loading phase approval...</div>;
        }
        return (
          <GenericApprovalDialog
            open={true}
            title={args.phaseTitle}
            message={args.phaseDescription}
            onResolve={(approved) => respond({ approved })}
          />
        );
      },
    },
    []
  );

  useHumanInTheLoop(
    {
      name: 'approve_generic',
      description: 'Generic approval gate for any content pipeline step',
      parameters: z.object({
        type: z.literal('generic'),
        title: z.string(),
        message: z.string(),
      }),
      render: ({ args, respond }) => {
        if (!respond) {
          return <div className="p-4 text-sm text-muted-foreground">Loading approval...</div>;
        }
        return (
          <GenericApprovalDialog
            open={true}
            title={args.title}
            message={args.message}
            onResolve={(approved) => respond({ approved })}
          />
        );
      },
    },
    []
  );
}
