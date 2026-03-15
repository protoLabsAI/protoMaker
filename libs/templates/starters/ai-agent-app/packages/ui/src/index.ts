export * from './atoms/index.js';
// ── Utilities ─────────────────────────────────────────────────────────────────
export { cn } from './lib/utils.js';

// ── UI Primitives ─────────────────────────────────────────────────────────────
export { Button, buttonVariants } from './ui/button.js';
export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor } from './ui/popover.js';

// ── AI Chat Components ────────────────────────────────────────────────────────
export {
  ChatMessage,
  ChatMessageAvatar,
  ChatMessageBubble,
  StepStartPart,
  messageVariants,
  bubbleVariants,
  avatarVariants,
  type MessageRole,
} from './components/chat-message.js';

export {
  ChatMessageList,
  type BranchInfo,
  type PendingSubagentApproval,
} from './components/chat-message-list.js';

export {
  ChatMessageMarkdown,
  type ChatMessageMarkdownProps,
} from './components/chat-message-markdown.js';

export { ChatInput } from './components/chat-input.js';

export { ChainOfThought, type ChainOfThoughtProps } from './components/chain-of-thought.js';

export { ReasoningPart, type ReasoningPartProps } from './components/reasoning-part.js';

export { CodeBlock, type CodeBlockProps } from './components/code-block.js';

export {
  ToolInvocationPart,
  formatToolName,
  type ToolInvocationPartProps,
} from './components/tool-invocation-part.js';

export {
  TaskBlock,
  type TaskBlockProps,
  type ToolInvocationItem,
  type TaskToolState,
} from './components/task-block.js';

export { ConfirmationCard, type ConfirmationCardProps } from './components/confirmation-card.js';

export {
  PlanPart,
  PlanPartToolRenderer,
  extractPlanData,
  type PlanData,
  type PlanStep,
  type PlanStepStatus,
  type PlanStatus,
  type PlanPartProps,
} from './components/plan-part.js';

export {
  SubagentBlock,
  SubagentBlockRenderer,
  type SubagentBlockProps,
  type SubagentStatus,
} from './components/subagent-block.js';

export {
  SubagentApprovalCard,
  type SubagentApprovalCardProps,
} from './components/subagent-approval-card.js';

export {
  InlineCitation,
  type Citation,
  type InlineCitationProps,
} from './components/inline-citation.js';

export { MessageSources, type MessageSourcesProps } from './components/message-sources.js';

export {
  MessageActions,
  type MessageActionsProps,
  type FeedbackRating,
} from './components/message-actions.js';

export { MessageBranches, type MessageBranchesProps } from './components/message-branches.js';

export { ShimmerLoader, type ShimmerLoaderProps } from './components/shimmer.js';

export { AILoader, type AILoaderProps } from './components/loader.js';

export { PromptInputProvider, usePromptInput } from './components/prompt-input-context.js';

export {
  SlashCommandDropdown,
  type SlashCommand,
  type SlashCommandDropdownProps,
  type UseSlashCommandsResult,
} from './components/slash-command-dropdown.js';

export { SuggestionList, type SuggestionItem } from './components/suggestion.js';

export {
  QueueView,
  type QueueViewProps,
  type QueueItem,
  type QueueItemStatus,
  type QueueItemComplexity,
} from './components/queue-view.js';

export {
  CheckpointMarker,
  type CheckpointMarkerProps,
  type CheckpointInfo,
} from './components/checkpoint-marker.js';

export {
  toolResultRegistry,
  type ToolResultRenderer,
  type ToolResultRendererProps,
  type ToolState,
} from './components/tool-result-registry.js';
