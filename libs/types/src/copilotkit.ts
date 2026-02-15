/**
 * CopilotKit / AG-UI Protocol Types
 *
 * Discriminated union types for HITL (Human-in-the-Loop) approval system interrupt payloads.
 * These types are shared between:
 * - Server (apps/server): LangGraph flows emit interrupts with these payloads
 * - UI (apps/ui): Renders interrupt-specific UI components based on type discriminant
 *
 * The CopilotKit AG-UI adapter handles the interrupt/resume protocol automatically.
 */

/**
 * PRD Review Interrupt Payload
 * Emitted when a Product Requirements Document needs human review
 */
export interface PRDReviewInterrupt {
  type: 'prd-review';
  prdTitle: string;
  prdContent: string;
  reviewResults: unknown;
}

/**
 * Entity Review Interrupt Payload
 * Emitted when entities (e.g., domain models, features) need approval
 */
export interface EntityReviewInterrupt {
  type: 'entity-review';
  entities: Array<{
    name: string;
    description: string;
    status: string;
  }>;
}

/**
 * Phase Approval Interrupt Payload
 * Emitted when a project phase needs approval before proceeding
 */
export interface PhaseApprovalInterrupt {
  type: 'phase-approval';
  phaseTitle: string;
  phaseDescription: string;
  acceptanceCriteria: string[];
}

/**
 * Generic Interrupt Payload
 * Fallback for general approval/decision points
 */
export interface GenericInterrupt {
  type: 'generic';
  title: string;
  message: string;
  options?: string[];
}

/**
 * Discriminated Union of all interrupt payload types
 *
 * The 'type' field is the discriminant used for routing to the correct UI component.
 *
 * Usage in Server (LangGraph):
 * ```typescript
 * import { InterruptPayload } from '@automaker/types';
 *
 * const payload: InterruptPayload = {
 *   type: 'prd-review',
 *   prdTitle: 'New Feature',
 *   prdContent: '...',
 *   reviewResults: {...}
 * };
 * await interrupt(payload);
 * ```
 *
 * Usage in UI:
 * ```typescript
 * import { InterruptPayload } from '@automaker/types';
 *
 * function InterruptHandler({ payload }: { payload: InterruptPayload }) {
 *   switch (payload.type) {
 *     case 'prd-review':
 *       return <PRDReviewUI {...payload} />;
 *     case 'entity-review':
 *       return <EntityReviewUI {...payload} />;
 *     // ...
 *   }
 * }
 * ```
 */
export type InterruptPayload =
  | PRDReviewInterrupt
  | EntityReviewInterrupt
  | PhaseApprovalInterrupt
  | GenericInterrupt;
