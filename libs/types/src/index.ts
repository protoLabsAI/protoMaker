/**
 * @protolabs-ai/types
 * Shared type definitions for AutoMaker
 */

// Automation registry supplementary types (CreateAutomationInput, UpdateAutomationInput, FlowFactory)
// Core types (Automation, AutomationRunRecord, etc.) are already exported from the base workspace types
export type {
  CreateAutomationInput,
  UpdateAutomationInput,
  FlowFactory,
  CronTriggerInput,
  EventTriggerInput,
  WebhookTriggerInput,
} from './automation.js';

// Provider types
export type {
  ProviderConfig,
  ConversationMessage,
  ExecuteOptions,
  ContentBlock,
  ProviderMessage,
  InstallationStatus,
  ValidationResult,
  ModelDefinition,
  McpServerConfig,
  McpStdioServerConfig,
  McpSSEServerConfig,
  McpHttpServerConfig,
  AgentDefinition,
  ReasoningEffort,
  HookCallback,
  HookCallbackMatcher,
  CanUseTool,
} from './provider.js';

// Provider constants and utilities
export {
  DEFAULT_TIMEOUT_MS,
  REASONING_TIMEOUT_MULTIPLIERS,
  calculateReasoningTimeout,
} from './provider.js';

// Codex CLI types
export type {
  CodexSandboxMode,
  CodexApprovalPolicy,
  CodexCliConfig,
  CodexAuthStatus,
} from './codex.js';
export * from './codex-models.js';

// Codex App-Server JSON-RPC types
export type {
  AppServerModelResponse,
  AppServerModel,
  AppServerReasoningEffort,
  AppServerAccountResponse,
  AppServerAccount,
  AppServerRateLimitsResponse,
  AppServerRateLimits,
  AppServerRateLimitWindow,
  JsonRpcRequest,
  JsonRpcResponse,
} from './codex-app-server.js';

// Auto-mode types (lease tracking, auto-loop lifecycle, execution state persistence)
export type { RunningFeatureLease, AutoLoopState, ExecutionState } from './auto-mode.js';

// Feature types
export type {
  Feature,
  FeatureImagePath,
  FeatureTextFilePath,
  FeatureStatus,
  LegacyFeatureStatus,
  DescriptionHistoryEntry,
  StatusTransition,
  ExecutionRecord,
  RemediationHistoryEntry,
} from './feature.js';
export { normalizeFeatureStatus } from './feature.js';

// Quarantine types
export type {
  TrustTier,
  QuarantineStage,
  QuarantineResult,
  SanitizationViolation,
  QuarantineEntry,
  TrustTierRecord,
} from './quarantine.js';

// Promotion pipeline types (Detection & Candidate Tracking)
export type {
  PromotionStatus,
  PromotionCandidate,
  PromotionBatch,
  PromotionConfig,
} from './promotion.js';

// Feature store interface (pluggable storage abstraction)
export type { FeatureStore } from './feature-store.js';

// Event bus interface (pluggable event transport abstraction)
export type { EventBus, EventSubscription } from './event-bus.js';

// Hivemind types (multi-instance mesh coordination)
export type {
  InstanceCapacity,
  HivemindDomain,
  InstanceIdentity,
  HivemindPeer,
  HivemindConfig,
} from './hivemind.js';

// Project orchestration types
export type {
  PhaseComplexity,
  ProjectStatus,
  ProjectHealth,
  ProjectPriority,
  ProjectLink,
  ProjectStatusUpdate,
  ProjectDocument,
  ProjectDocumentsFile,
  MilestoneStatus,
  Phase,
  Milestone,
  Project,
  SPARCPrd,
  PRDReviewComment,
  DeepResearchResult,
  CreateProjectFromPRDOptions,
  CreateFeaturesFromProjectOptions,
  FeatureFactoryResult,
  CreateProjectInput,
  UpdateProjectInput,
  CreateFeaturesResult,
  ProjectLifecyclePhase,
  LifecycleInitiateResult,
  LifecyclePrdResult,
  LifecycleApproveResult,
  LifecycleLaunchResult,
  LifecycleStatus,
  LifecycleCollectResult,
  ProjectStats,
} from './project.js';

// Calendar types
export type {
  CalendarEventType,
  CalendarEvent,
  CalendarEventsFile,
  CalendarQueryOptions,
  JobStatus,
  JobAction,
  JobExecutionResult,
} from './calendar.js';

// Session types
export type {
  AgentSession,
  SessionListItem,
  CreateSessionParams,
  UpdateSessionParams,
} from './session.js';

// Error types
export type { ErrorType, ErrorInfo } from './error.js';

// Failure classification and recovery types
export type {
  FailureCategory,
  RecoveryStrategy,
  FailureAnalysis,
  RecoveryResult,
  ExecutionContext,
  RecoveryConfig,
} from './failure.js';
export { DEFAULT_RECOVERY_CONFIG } from './failure.js';

// Image types
export type { ImageData, ImageContentBlock } from './image.js';

// Model types and constants
export {
  CLAUDE_MODEL_MAP,
  CLAUDE_CANONICAL_MAP,
  LEGACY_CLAUDE_ALIAS_MAP,
  CODEX_MODEL_MAP,
  CODEX_MODEL_IDS,
  REASONING_CAPABLE_MODELS,
  supportsReasoningEffort,
  getAllCodexModelIds,
  DEFAULT_MODELS,
  type ClaudeCanonicalId,
  type ModelAlias,
  type CodexModelId,
  type AgentModel,
  type ModelId,
} from './model.js';

// Event types
export type {
  EventType,
  EventCallback,
  EventSeverity,
  EventPayloadMap,
  EventPayload,
  TypedEventCallback,
  PRRemediationStartedPayload,
  PRThreadEvaluatedPayload,
  PRThreadsResolvedPayload,
  GitHubPRReviewSubmittedPayload,
  GitHubPRChecksUpdatedPayload,
  GitHubPRApprovedPayload,
  GitHubPRChangesRequestedPayload,
} from './event.js';

// Spec types
export type { SpecOutput } from './spec.js';
export { specOutputSchema } from './spec.js';

// Enhancement types
export type { EnhancementMode, EnhancementExample } from './enhancement.js';

// Prompt customization types
export type {
  CustomPrompt,
  AutoModePrompts,
  AgentPrompts,
  BacklogPlanPrompts,
  EnhancementPrompts,
  CommitMessagePrompts,
  TitleGenerationPrompts,
  IssueValidationPrompts,
  IdeationPrompts,
  AppSpecPrompts,
  ContextDescriptionPrompts,
  SuggestionsPrompts,
  TaskExecutionPrompts,
  PromptCustomization,
  ResolvedAutoModePrompts,
  ResolvedAgentPrompts,
  ResolvedBacklogPlanPrompts,
  ResolvedEnhancementPrompts,
  ResolvedCommitMessagePrompts,
  ResolvedTitleGenerationPrompts,
  ResolvedIssueValidationPrompts,
  ResolvedIdeationPrompts,
  ResolvedAppSpecPrompts,
  ResolvedContextDescriptionPrompts,
  ResolvedSuggestionsPrompts,
  ResolvedTaskExecutionPrompts,
} from './prompts.js';
export { DEFAULT_PROMPT_CUSTOMIZATION } from './prompts.js';

// User profile types (agent personalization)
export type { UserProfile } from './user-profile.js';

// Settings types and constants
export type {
  ThemeMode,
  PlanningMode,
  ThinkingLevel,
  ServerLogLevel,
  ModelProvider,
  DeploymentEnvironment,
  PhaseModelEntry,
  PhaseModelConfig,
  PhaseModelKey,
  KeyboardShortcuts,
  MCPToolInfo,
  MCPServerConfig,
  ProjectRef,
  TrashedProjectRef,
  ChatSessionRef,
  GlobalSettings,
  FeatureFlags,
  Credentials,
  BoardBackgroundSettings,
  WorktreeInfo,
  ProjectSettings,
  // Event hook types
  EventHookTrigger,
  EventHookHttpMethod,
  EventHookShellAction,
  EventHookHttpAction,
  EventHookDiscordAction,
  EventHookAction,
  EventHook,
  // Git workflow types
  PRMergeStrategy,
  GitWorkflowSettings,
  GitWorkflowResult,
  // Discord integration types
  DiscordSettings,
  DiscordUserDMConfig,
  // Ceremony types (CeremonySettings only — audit types from ceremony.ts)
  CeremonySettings,
  // Project integration types
  ReactionAbility,
  DiscordChannelSignalConfig,
  ChannelWorkflow,
  ChannelWorkflowType,
  DiscordChannelMap,
  LinearIntegrationConfig,
  DiscordIntegrationConfig,
  GoogleIntegrationConfig,
  ProjectIntegrations,
  IntegrationEventMapping,
  // Trust boundary types
  PRDCategory,
  PRDComplexity,
  AutoApproveRule,
  RequireReviewRule,
  TrustBoundaryConfig,
  // Claude-compatible provider types (new)
  ApiKeySource,
  ClaudeCompatibleProviderType,
  ClaudeModelAlias,
  ProviderModel,
  ClaudeCompatibleProvider,
  ClaudeCompatibleProviderTemplate,
  // OpenAI-compatible provider types
  OpenAICompatibleConfig,
  OpenAICompatibleTemplate,
  // Claude API profile types (deprecated)
  ClaudeApiProfile,
  ClaudeApiProfileTemplate,
  // Workflow settings types
  WorkflowSettings,
} from './settings.js';
export {
  DEFAULT_KEYBOARD_SHORTCUTS,
  DEFAULT_PHASE_MODELS,
  DEFAULT_FLOW_MODELS,
  DEFAULT_GLOBAL_SETTINGS,
  DEFAULT_FEATURE_FLAGS,
  DEFAULT_CREDENTIALS,
  DEFAULT_PROJECT_SETTINGS,
  DEFAULT_MAX_CONCURRENCY,
  MAX_SYSTEM_CONCURRENCY,
  getMaxSystemConcurrency,
  SETTINGS_VERSION,
  CREDENTIALS_VERSION,
  PROJECT_SETTINGS_VERSION,
  THINKING_TOKEN_BUDGET,
  getThinkingTokenBudget,
  // Event hook constants
  EVENT_HOOK_TRIGGER_LABELS,
  // Git workflow defaults
  DEFAULT_GIT_WORKFLOW_SETTINGS,
  // Discord integration defaults
  DEFAULT_DISCORD_SETTINGS,
  // Ceremony defaults
  DEFAULT_CEREMONY_SETTINGS,
  // Trust boundary defaults
  DEFAULT_TRUST_BOUNDARY_CONFIG,
  // Workflow settings defaults
  DEFAULT_WORKFLOW_SETTINGS,
  // Integration config defaults
  DEFAULT_LINEAR_INTEGRATION,
  DEFAULT_DISCORD_INTEGRATION,
  // Claude-compatible provider templates (new)
  CLAUDE_PROVIDER_TEMPLATES,
  // OpenAI-compatible provider templates
  OPENAI_COMPATIBLE_TEMPLATES,
  // Claude API profile constants (deprecated)
  CLAUDE_API_PROFILE_TEMPLATES,
  // Environment presets
  ENVIRONMENT_PRESETS,
  getDeploymentEnvironment,
} from './settings.js';

// Model display constants
export type { ModelOption, ThinkingLevelOption, ReasoningEffortOption } from './model-display.js';
export {
  CLAUDE_MODELS,
  THINKING_LEVELS,
  THINKING_LEVEL_LABELS,
  REASONING_EFFORT_LEVELS,
  REASONING_EFFORT_LABELS,
  getModelDisplayName,
} from './model-display.js';

// Issue validation types
export type {
  IssueValidationVerdict,
  IssueValidationConfidence,
  IssueComplexity,
  PRRecommendation,
  PRAnalysis,
  LinkedPRInfo,
  IssueValidationInput,
  IssueValidationRequest,
  IssueValidationResult,
  IssueValidationResponse,
  IssueValidationErrorResponse,
  IssueValidationEvent,
  StoredValidation,
  GitHubCommentAuthor,
  GitHubComment,
  IssueCommentsResult,
} from './issue-validation.js';

// Backlog plan types
export type {
  BacklogChange,
  DependencyUpdate,
  BacklogPlanResult,
  BacklogPlanEvent,
  BacklogPlanRequest,
  BacklogPlanApplyResult,
} from './backlog-plan.js';

// Cursor types
export * from './cursor-models.js';
export * from './cursor-cli.js';

// OpenCode types
export * from './opencode-models.js';

// Provider utilities
export {
  PROVIDER_PREFIXES,
  isCursorModel,
  isClaudeModel,
  isCodexModel,
  isOpencodeModel,
  getModelProvider,
  stripProviderPrefix,
  addProviderPrefix,
  getBareModelId,
  normalizeModelString,
  validateBareModelId,
} from './provider-utils.js';

// Model migration utilities
export {
  isLegacyCursorModelId,
  isLegacyOpencodeModelId,
  isLegacyClaudeAlias,
  migrateModelId,
  migrateCursorModelIds,
  migrateOpencodeModelIds,
  migratePhaseModelEntry,
  getBareModelIdForCli,
} from './model-migration.js';

// Pipeline types
export type {
  PipelineStep,
  PipelineConfig,
  PipelineStatus,
  PipelineSummary,
  FeatureStatusWithPipeline,
} from './pipeline.js';

// Port configuration
export { STATIC_PORT, SERVER_PORT, RESERVED_PORTS } from './ports.js';

// Editor types
export type { EditorInfo } from './editor.js';

// Notification types
export type { NotificationType, Notification, NotificationsFile } from './notification.js';
export { NOTIFICATIONS_VERSION, DEFAULT_NOTIFICATIONS_FILE } from './notification.js';

// ActionableItem types (unified user attention system)
export type {
  ActionableItemActionType,
  ActionableItemPriority,
  ActionableItemStatus,
  ActionPayload,
  ActionableItem,
  ActionableItemsFile,
  CreateActionableItemInput,
} from './actionable-item.js';
export {
  ACTIONABLE_ITEMS_VERSION,
  DEFAULT_ACTIONABLE_ITEMS_FILE,
  PRIORITY_SCORE,
  getEffectivePriority,
} from './actionable-item.js';

// Event history types
export type {
  StoredEvent,
  StoredEventIndex,
  StoredEventSummary,
  EventHistoryFilter,
  EventReplayResult,
  EventReplayHookResult,
} from './event-history.js';
export { EVENT_HISTORY_VERSION, DEFAULT_EVENT_HISTORY_INDEX } from './event-history.js';

// Worktree and PR types
export type { PRState, WorktreePRInfo } from './worktree.js';
export { PR_STATES, validatePRState } from './worktree.js';

// Terminal types
export type { TerminalInfo } from './terminal.js';

// Skill types
export type {
  Skill,
  SkillRequirements,
  SkillMetadata,
  SkillFrontmatter,
  CreateSkillOptions,
  UpdateSkillOptions,
  SkillExecutionResult,
} from './skill.js';
// CodeRabbit feedback types
export type {
  CodeRabbitCommentLocation,
  CodeRabbitSeverity,
  CodeRabbitComment,
  CodeRabbitReview,
  FeatureCodeRabbitFeedback,
  CodeRabbitParseResult,
  ReviewThreadStatus,
  ReviewThreadFeedback,
  FeedbackThreadDecision,
  PendingFeedback,
} from './coderabbit.js';

// Webhook types
export type {
  GitHubWebhookEvent,
  GitHubIssueAction,
  GitHubPullRequestAction,
  GitHubPullRequestReviewAction,
  GitHubPullRequestReviewState,
  GitHubUser,
  GitHubRepository,
  GitHubIssue,
  GitHubPullRequest,
  GitHubCheckSuite,
  GitHubCheckRun,
  GitHubPullRequestReview,
  GitHubIssueWebhookPayload,
  GitHubPullRequestWebhookPayload,
  GitHubPullRequestReviewWebhookPayload,
  GitHubPushWebhookPayload,
  GitHubPingWebhookPayload,
  GitHubCheckSuiteWebhookPayload,
  GitHubWebhookPayload,
  WebhookVerificationResult,
  WebhookSettings,
  AutoMergeCheckType,
  AutoMergeSettings,
} from './webhook.js';
export { DEFAULT_WEBHOOK_SETTINGS, DEFAULT_AUTO_MERGE_SETTINGS } from './webhook.js';

// Discord types
export type {
  DiscordChannelType,
  DiscordChannel,
  DiscordCategory,
  DiscordServerInfo,
  DiscordMessage,
  DiscordWebhook,
  DiscordUser,
  DiscordDMMessage,
  CreateChannelOptions,
  CreateCategoryOptions,
  DiscordSendMessageOptions,
  ReadMessagesOptions,
  CreateWebhookOptions,
  SendWebhookMessageOptions,
  DiscordOperationResult,
  DiscordAttachment,
  DiscordReplyContext,
  DiscordRoutedMessage,
  DiscordUserMessageRoutedPayload,
} from './discord.js';

// Agent role types (headsdown agents)
export type {
  AgentRole,
  AgentTaskType,
  AgentTask,
  DiscordMonitorConfig,
  GitHubMonitorConfig,
  AgentMonitoring,
  AgentStats,
  AgentInstance,
  IdleTaskType,
  IdleTaskConfig,
  WorkItem,
  RoleCapabilities,
} from './agent-roles.js';
export { ROLE_CAPABILITIES } from './agent-roles.js';

// Headsdown configuration types
export type { HeadsdownLoopConfig, HeadsdownConfig, HeadsdownState } from './headsdown.js';
export { DEFAULT_HEADSDOWN_CONFIGS } from './headsdown.js';

// Policy engine types (used by @protolabs-ai/policy-engine)
export type {
  AgentRoleName,
  PolicyAction,
  PolicyDecisionType,
  WorkflowStatus,
  AgentTrustProfile,
  EngineActionProposal,
  PermissionMatrixEntry,
  PermissionMatrix,
  StatusTransitionGuard,
  EnginePolicyConfig,
  EnginePolicyDecision,
} from './policy.js';

// Authority system types (used by authority service)
export type {
  TrustLevel,
  RiskLevel,
  AuthorityRole,
  PolicyActionType,
  ActionProposal,
  PolicyDecision,
  TrustProfile,
  PermissionEntry,
  StatusTransitionRule,
  PolicyConfig,
  ApprovalRequest,
  DelegationRule,
} from './policy.js';

// Role mapping utilities
export { ROLE_NAME_TO_AUTHORITY, AUTHORITY_TO_ROLE_NAME } from './policy.js';

// Authority and work item types
export type { WorkItemState, AuthorityAgent, AuthorizedWorkItem } from './authority.js';

// Ceremony types (milestone updates and project retrospectives)
export type {
  CeremonyType,
  MilestoneUpdateData,
  ProjectRetroData,
  CeremonyAuditType,
  CeremonyDeliveryStatus,
  CeremonyAuditEntry,
} from './ceremony.js';

// Linear sync types (bidirectional sync metadata and payloads)
export type {
  LinearSyncMetadata,
  LinearIssueSnapshot,
  FeatureSnapshot,
  LinearIssuePayload,
  LinearProjectPayload,
  LinearSyncStartedPayload,
  LinearSyncCompletedPayload,
  LinearSyncErrorPayload,
} from './linear.js';

// Setup pipeline types (ProtoLabs agency setup)
export type {
  RepoResearchResult,
  GapCategory,
  GapSeverity,
  GapEffort,
  GapItem,
  ComplianceItem,
  GapAnalysisReport,
  ProtolabConfig,
  DiscordProvisionResult,
  AlignmentFeature,
  AlignmentMilestone,
  AlignmentProposal,
  SetupPipelineResult,
} from './setup.js';

// Agent template types (dynamic role registry)
export {
  AgentTemplateSchema,
  DiscordAssignmentSchema,
  LinearAssignmentSchema,
  GitHubAssignmentSchema,
  HeadsdownConfigSchema,
  DesiredStateConditionSchema,
  StateOperatorSchema,
  MCPServerConfigSchema,
  KNOWN_AGENT_ROLES,
  WORLD_STATE_KEYS,
} from './agent-templates.js';
export type {
  AgentTemplate,
  DiscordAssignment,
  LinearAssignment,
  GitHubAssignment,
  AgentHeadsdownConfig,
  DesiredStateCondition,
  StateOperator,
  AgentMCPServerConfig,
} from './agent-templates.js';

// ConversationSurface types (platform-agnostic agent interaction)
export type {
  ConversationPlatform,
  SurfaceCapabilities,
  SurfaceChoiceOption,
  SurfacePlanStep,
  SurfaceDocument,
  SurfaceMessage,
  SurfaceSession,
  ConversationSurface,
} from './conversation-surface.js';

// Escalation router types (signal routing to channels)
export { EscalationSeverity, EscalationSource } from './escalation.js';
export type { EscalationSignal, EscalationChannel } from './escalation.js';

// Antagonistic Review Pipeline types
export type {
  ReviewVerdict,
  SectionReview,
  ReviewerPerspective,
  AntagonisticReviewResult,
  ReviewState,
  ContentBrief,
  DeliverableType,
  PairReviewResult,
  FlowReviewConfig,
} from './review.js';
export { DistillationDepth } from './review.js';

// Content generation types
export { SectionSchema, OutlineSchema } from './content.js';
export type { ContentType, ContentConfig, Section, Outline, ResearchSummary } from './content.js';

// Metrics ledger types (persistent append-only analytics)
export type {
  MetricsLedgerRecord,
  LedgerExecution,
  LedgerQueryOptions,
  TimeSeriesPoint,
  TimeSeriesData,
  LedgerAggregateMetrics,
  CycleTimeBucket,
  TimeSeriesMetric,
  TimeGroupBy,
} from './metrics.js';

// Lead Engineer types (production-phase nerve center)
export { FeatureState } from './lead-engineer.js';
export type {
  LeadFeatureSnapshot,
  LeadAgentSnapshot,
  LeadPRSnapshot,
  LeadMilestoneSnapshot,
  LeadWorldState,
  LeadRuleAction,
  LeadFastPathRule,
  LeadEngineerFlowState,
  LeadEngineerSession,
  LeadRuleLogEntry,
  StateTransition,
  ShortCircuitCondition,
  FeatureStateContext,
  EscalationTrigger,
  PersonaAssignment,
  LeadEngineerService,
  PhaseHandoff,
} from './lead-engineer.js';

// Twitch integration types (chat suggestions)
export type { TwitchSuggestion, TwitchSettings } from './twitch.js';
export { DEFAULT_TWITCH_SETTINGS } from './twitch.js';

// Notes types (Tiptap-based project notes workspace)
export type { NoteTab, NoteTabPermissions, NotesWorkspace } from './notes.js';

// Pipeline checkpoint types (crash recovery and goal gates)
export type { PipelineCheckpoint, GoalGateResult } from './pipeline-checkpoint.js';

// Unified pipeline phase types (idea-to-production orchestration)
export type {
  PipelinePhase,
  PipelineBranch,
  GateMode,
  PhaseGateResult,
  PhaseTransition,
  PipelineState,
  PipelineGateConfig,
} from './pipeline-phase.js';
export {
  PIPELINE_PHASES,
  GTM_SKIP_PHASES,
  DEFAULT_PIPELINE_GATES,
  PIPELINE_TO_WORK_ITEM_STATE,
} from './pipeline-phase.js';

// Context fidelity types (per-stage context shaping)
export type { ContextFidelityMode } from './context-fidelity.js';
export { DEFAULT_STAGE_FIDELITY } from './context-fidelity.js';

// Integration registry types (unified external connection management)
export {
  IntegrationCategory,
  IntegrationScope,
  IntegrationHealthStatus,
  ConfigFieldType,
  ConfigFieldSchema,
  IntegrationDescriptorSchema,
} from './integration.js';
export type {
  IntegrationHealth,
  ConfigField,
  IntegrationDescriptor,
  IntegrationSummary,
} from './integration.js';

// Signal provenance types (originating channel tracking & routing)
export type { SignalChannel, SignalMetadata } from './signal-channel.js';
export type { SignalIntent, RecentSignal, RecentSignalStatus } from './signal-intent.js';

// Channel Router types (HITL routing interface)
export type { ChannelHandler } from './channel-router.js';

// HITL Form types (human-in-the-loop structured input)
export type {
  HITLFormCallerType,
  HITLFormStatus,
  HITLFormStep,
  HITLFormRequestInput,
  HITLFormRequest,
  HITLFormRequestSummary,
} from './hitl-form.js';

// Knowledge Store types (semantic search and retrieval)
export type {
  KnowledgeSourceType,
  KnowledgeChunk,
  KnowledgeSearchResult,
  KnowledgeStoreStats,
  KnowledgeStoreSettings,
  KnowledgeSearchOptions,
  RetrievalMode,
} from './knowledge.js';

// Trajectory types (execution learning flywheel)
export type {
  TrajectoryFact,
  TrajectoryFactCategory,
  VerifiedTrajectory,
  TrajectoryDomain,
} from './trajectory.js';

// Automation types (trigger-based automation definitions and run records)
export type {
  CronTrigger,
  EventTrigger,
  WebhookTrigger,
  AutomationTrigger,
  AutomationRunStatus,
  AutomationRunRecord,
  Automation,
} from './automation.js';

// Sensor framework types (sensor registry, readings, and presence detection)
export type {
  SensorId,
  SensorState,
  UserPresenceState,
  SensorConfig,
  SensorReading,
} from './sensor.js';

// PenFile types (vector graphics format v2.8)
export type {
  PenColor,
  PenVector,
  PenBounds,
  PenTransform,
  PenSolidFill,
  PenGradientStop,
  PenGradientFill,
  PenImageFill,
  PenFill,
  PenStroke,
  PenDropShadowEffect,
  PenInnerShadowEffect,
  PenBlurEffect,
  PenEffect,
  PenVariable,
  PenTheme,
  PenNodeBase,
  PenFrame,
  PenGroup,
  PenRectangle,
  PenEllipse,
  PenLine,
  PenPolygon,
  PenPath,
  PenText,
  PenIconFont,
  PenRef,
  PenImage,
  PenVectorGraphic,
  PenInstance,
  PenNode,
  PenDocument,
} from './pen.js';
