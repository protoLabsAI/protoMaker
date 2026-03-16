// Basic chat agent — linear flow with OTel tracing
export { buildChatGraph, buildChatGraphLinear, runChatExample } from './basic-chat-agent.js';

// Tool-calling agent — branching flow with XML-based tool parsing
export {
  buildToolCallingAgent,
  runToolCallingExample,
  validateAgentInput,
} from './tool-calling-agent.js';

// Human-in-the-loop approval flow — interrupt/resume with checkpointing
export {
  buildHITLApprovalFlow,
  buildApprovalSubgraphBridge,
  runHITLExample,
  createIdentityTransformer,
} from './hitl-approval-flow.js';
