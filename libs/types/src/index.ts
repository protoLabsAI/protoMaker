/**
 * @automaker/types
 * Shared type definitions for AutoMaker
 */

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

// Project orchestration types
export type {
  PhaseComplexity,
  ProjectStatus,
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
} from './project.js';

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
  // Graphite CLI types
  GraphiteSettings,
  // Discord integration types
  DiscordSettings,
  DiscordUserDMConfig,
  // Ceremony types
  CeremonySettings,
  // Project integration types
  LinearIntegrationConfig,
  DiscordIntegrationConfig,
  ProjectIntegrations,
  IntegrationEventMapping,
  // Crew loop types
  CrewMemberConfig,
  CrewLoopSettings,
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
  // Claude API profile types (deprecated)
  ClaudeApiProfile,
  ClaudeApiProfileTemplate,
} from './settings.js';
export {
  DEFAULT_KEYBOARD_SHORTCUTS,
  DEFAULT_PHASE_MODELS,
  DEFAULT_GLOBAL_SETTINGS,
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
  // Graphite CLI defaults
  DEFAULT_GRAPHITE_SETTINGS,
  // Discord integration defaults
  DEFAULT_DISCORD_SETTINGS,
  // Ceremony defaults
  DEFAULT_CEREMONY_SETTINGS,
  // Crew loop defaults
  DEFAULT_CREW_LOOP_SETTINGS,
  // Trust boundary defaults
  DEFAULT_TRUST_BOUNDARY_CONFIG,
  // Integration config defaults
  DEFAULT_LINEAR_INTEGRATION,
  DEFAULT_DISCORD_INTEGRATION,
  // Claude-compatible provider templates (new)
  CLAUDE_PROVIDER_TEMPLATES,
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
  FeatureStatusWithPipeline,
} from './pipeline.js';

// Port configuration
export { STATIC_PORT, SERVER_PORT, RESERVED_PORTS } from './ports.js';

// Editor types
export type { EditorInfo } from './editor.js';

// Ideation types
export type {
  IdeaCategory,
  IdeaStatus,
  ImpactLevel,
  EffortLevel,
  IdeaAttachment,
  Idea,
  IdeationSessionStatus,
  IdeationSession,
  IdeationMessage,
  IdeationSessionWithMessages,
  PromptCategory,
  IdeationPrompt,
  AnalysisFileInfo,
  AnalysisSuggestion,
  ProjectAnalysisResult,
  StartSessionOptions,
  SendMessageOptions,
  CreateIdeaInput,
  UpdateIdeaInput,
  ConvertToFeatureOptions,
  IdeationEventType,
  IdeationStreamEvent,
  IdeationAnalysisEvent,
} from './ideation.js';

// Notification types
export type { NotificationType, Notification, NotificationsFile } from './notification.js';
export { NOTIFICATIONS_VERSION, DEFAULT_NOTIFICATIONS_FILE } from './notification.js';

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
// Ralph mode types (persistent retry loops with external verification)
// Note: FailureCategory and FailureAnalysis are exported from ./failure.js
// Ralph has its own RalphFailureCategory and RalphFailureAnalysis with different shapes
export type {
  CompletionCriteriaType,
  CompletionCriterion,
  CriterionCheckResult,
  VerificationResult,
  RalphFailureCategory,
  RalphFailureAnalysis,
  RalphIteration,
  RalphLoopStatus,
  RalphLoopConfig,
  RalphLoopState,
  FeatureRalphConfig,
  RalphEventType,
  RalphEventPayload,
} from './ralph.js';
export { DEFAULT_COMPLETION_CRITERIA, DEFAULT_RALPH_CONFIG } from './ralph.js';

// CodeRabbit feedback types
export type {
  CodeRabbitCommentLocation,
  CodeRabbitSeverity,
  CodeRabbitComment,
  CodeRabbitReview,
  FeatureBranchLink,
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
  LinearMonitorConfig,
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

// Policy engine types (used by @automaker/policy-engine)
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

// Beads task management types
export type {
  BeadsTask,
  CreateBeadsTaskOptions,
  UpdateBeadsTaskOptions,
  ListBeadsTasksOptions,
  BeadsOperationResult,
} from './beads.js';

// Ceremony types (milestone updates and project retrospectives)
export type { CeremonyType, MilestoneUpdateData, ProjectRetroData } from './ceremony.js';

// Linear sync types (bidirectional sync metadata and payloads)
export type {
  LinearSyncMetadata,
  LinearIssueSnapshot,
  FeatureSnapshot,
  LinearIssuePayload,
  LinearProjectPayload,
  LinearApprovalPayload,
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
  BeadsSetupResult,
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
} from './agent-templates.js';

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
