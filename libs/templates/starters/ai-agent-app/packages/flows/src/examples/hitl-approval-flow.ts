/**
 * Human-in-the-Loop (HITL) Approval Flow Example
 *
 * Demonstrates a LangGraph flow with human approval gates using:
 * - LangGraph MemorySaver checkpointing (interrupt/resume pattern)
 * - createBranchingGraph for approve/reject routing
 * - createSequentialRouter for multi-condition routing
 * - StateTransformer for subgraph composition
 */

import { z } from 'zod';
import { Annotation, interrupt } from '@langchain/langgraph';
import { GraphBuilder } from '../builder.js';
import { createSequentialRouter } from '../routers.js';
import { appendReducer } from '../reducers.js';
import { createSubgraphBridge, createIdentityTransformer } from '../state-transforms.js';
import { validateState } from '../state-utils.js';

// --- Types ---

type ApprovalDecision = 'approved' | 'rejected' | 'pending';

type ApprovalRequest = {
  id: string;
  description: string;
  payload: unknown;
  requestedAt: string;
};

type AuditEntry = {
  timestamp: string;
  action: string;
  actor: string;
  details: string;
};

// Derive state type from annotation (LangGraph pattern)
type ApprovalState = typeof ApprovalAnnotation.State;

// --- State Schema (for validation) ---

const ApprovalRequestSchema = z.object({
  id: z.string(),
  description: z.string().min(1),
  payload: z.unknown(),
  requestedAt: z.string(),
});

// --- State Annotation ---

const ApprovalAnnotation = Annotation.Root({
  // Replace-semantics (default): bare Annotation<T> with no arguments
  request: Annotation<ApprovalRequest | undefined>,
  decision: Annotation<ApprovalDecision>,
  reviewerNotes: Annotation<string>,
  // Append-semantics: requires value (reducer) + default
  auditLog: Annotation<AuditEntry[]>({
    value: appendReducer,
    default: () => [],
  }),
  output: Annotation<unknown>,
  errorMessage: Annotation<string | undefined>,
});

// --- Helper: Audit Log Entry ---

function auditEntry(action: string, actor: string, details: string): AuditEntry {
  return { timestamp: new Date().toISOString(), action, actor, details };
}

// --- Node Functions ---

async function validateRequestNode(state: ApprovalState): Promise<Partial<ApprovalState>> {
  const validation = validateState(ApprovalRequestSchema, state.request);

  if (!validation.success) {
    return {
      decision: 'rejected',
      errorMessage: `Invalid request: ${validation.error.message}`,
      auditLog: [auditEntry('validate', 'system', 'Request validation failed')],
    };
  }

  return {
    auditLog: [auditEntry('validate', 'system', `Request ${state.request?.id} validated`)],
  };
}

async function awaitApprovalNode(state: ApprovalState): Promise<Partial<ApprovalState>> {
  // LangGraph interrupt pattern: pause execution and wait for human input
  // The graph will be checkpointed here; resume by calling graph.invoke() again
  // with the same thread_id and updated state
  if (state.decision === 'pending') {
    const humanDecision = interrupt({
      type: 'approval_required',
      requestId: state.request?.id,
      description: state.request?.description,
      prompt: 'Please approve or reject this request',
    });

    // When resumed, humanDecision will contain the human's response
    const decision = (humanDecision as { decision?: string })?.decision ?? 'rejected';
    const notes = (humanDecision as { notes?: string })?.notes ?? '';

    return {
      decision: decision as ApprovalDecision,
      reviewerNotes: notes,
      auditLog: [
        auditEntry('review', 'human', `Decision: ${decision}${notes ? ` — ${notes}` : ''}`),
      ],
    };
  }

  return {};
}

async function processApprovedNode(state: ApprovalState): Promise<Partial<ApprovalState>> {
  // Execute the approved action
  const result = {
    processed: true,
    requestId: state.request?.id,
    payload: state.request?.payload,
    processedAt: new Date().toISOString(),
  };

  return {
    output: result,
    auditLog: [
      auditEntry('process', 'system', `Request ${state.request?.id} processed successfully`),
    ],
  };
}

async function handleRejectedNode(state: ApprovalState): Promise<Partial<ApprovalState>> {
  return {
    output: null,
    auditLog: [
      auditEntry(
        'reject',
        'system',
        `Request ${state.request?.id} rejected: ${state.reviewerNotes || state.errorMessage || 'No reason provided'}`
      ),
    ],
  };
}

// --- Router ---

const routeAfterReview = createSequentialRouter<ApprovalState>(
  [
    {
      condition: (state) => state.decision === 'rejected' || !!state.errorMessage,
      node: 'handle_rejected',
    },
    {
      condition: (state) => state.decision === 'approved',
      node: 'process_approved',
    },
  ],
  'await_approval' // default: re-enter approval loop if somehow still pending
);

// --- Build Graph ---

export function buildHITLApprovalFlow() {
  const builder = new GraphBuilder<ApprovalState>({
    stateAnnotation: ApprovalAnnotation,
    flowId: 'hitl-approval-flow',
    enableCheckpointing: true, // REQUIRED for interrupt/resume
  });

  builder
    .addNode('validate_request', validateRequestNode)
    .addNode('await_approval', awaitApprovalNode)
    .addNode('process_approved', processApprovedNode)
    .addNode('handle_rejected', handleRejectedNode)
    .setEntryPoint('validate_request')
    .addConditionalEdge('validate_request', routeAfterReview)
    .addEdge('await_approval', 'route_decision')
    .addNode('route_decision', async (state) => state) // passthrough
    .addConditionalEdge('route_decision', routeAfterReview)
    .setFinishPoint('process_approved')
    .setFinishPoint('handle_rejected');

  return builder.compile();
}

// --- Subgraph Composition Example ---
// Wraps the HITL flow as a subgraph within a larger pipeline

type PipelineState = {
  input: string;
  approvalRequest: ApprovalRequest | undefined;
  approvalResult: unknown;
  nextStep: string;
};

const PipelineAnnotation = Annotation.Root({
  input: Annotation<string>,
  approvalRequest: Annotation<ApprovalRequest | undefined>,
  approvalResult: Annotation<unknown>,
  nextStep: Annotation<string>,
});

// Use identity transformer since we handle field mapping manually
export function buildApprovalSubgraphBridge() {
  const approvalSubgraph = buildHITLApprovalFlow();

  // Bridge maps pipeline state → approval subgraph state
  const bridge = createSubgraphBridge<PipelineState, ApprovalState>({
    transformer: {
      toInput: (pipeline) => ({
        request: pipeline.approvalRequest,
        decision: 'pending' as ApprovalDecision,
        reviewerNotes: '',
        auditLog: [],
        output: undefined,
        errorMessage: undefined,
      }),
      extractOutput: (approval, _pipeline) => ({
        approvalResult: approval.output,
        nextStep: approval.decision === 'approved' ? 'continue' : 'stop',
      }),
    },
    subgraph: approvalSubgraph,
  });

  return bridge;
}

// --- Usage Example ---

export async function runHITLExample() {
  const graph = buildHITLApprovalFlow();

  const threadId = `thread_${Date.now()}`;
  const config = { configurable: { thread_id: threadId } };

  // Step 1: Start the flow (will interrupt at await_approval)
  const initialResult = await graph.invoke(
    {
      request: {
        id: 'req_001',
        description: 'Deploy application to production',
        payload: { environment: 'production', version: 'v1.2.3' },
        requestedAt: new Date().toISOString(),
      },
      decision: 'pending',
      reviewerNotes: '',
      auditLog: [],
      output: undefined,
      errorMessage: undefined,
    },
    config
  );

  console.log('Flow paused at approval gate:', initialResult);

  // Step 2: Resume with human decision (simulated)
  const finalResult = await graph.invoke(
    // Pass null to resume from checkpoint, providing human decision via Command
    null,
    {
      ...config,
      // In real usage, you'd use Command to resume with human input:
      // new Command({ resume: { decision: 'approved', notes: 'LGTM' } })
    }
  );

  console.log('Final result:', finalResult);
  console.log('Audit log:', finalResult.auditLog);
  return finalResult;
}

// Suppress unused variable warning — PipelineAnnotation documents the schema
void PipelineAnnotation;

// --- Export identity transformer for convenience ---
export { createIdentityTransformer };
