/**
 * ConversationSurface — Platform-Agnostic Agent Interaction Interface
 *
 * Defines a standard interface for multi-turn agent conversations that works
 * across Linear (primary), Discord, Slack, email, and any future platform.
 *
 * The interface maps directly to Linear's Agent Activity Protocol but is
 * expressed generically so implementations can adapt to each platform's
 * native capabilities.
 *
 * Lifecycle:
 *   acknowledge → showProgress → (askQuestion ↔ handleResponse)* → sendResponse | reportError
 */

/**
 * Supported conversation platforms
 */
export type ConversationPlatform =
  | 'linear'
  | 'discord'
  | 'slack'
  | 'email'
  | 'telegram'
  | 'whatsapp';

/**
 * Declares what a platform supports.
 * Consumers can check capabilities before calling optional methods.
 */
export interface SurfaceCapabilities {
  /** Can present structured choices to the user (Linear select signal, Discord buttons) */
  structuredChoices: boolean;
  /** Can create/update persistent documents (Linear Documents, Slack Canvas) */
  documents: boolean;
  /** Can show ephemeral progress indicators (Linear thought activities, Discord typing) */
  ephemeralProgress: boolean;
  /** Can show a step-by-step plan (Linear agent plans) */
  plans: boolean;
  /** Can do multi-turn conversations (elicitation → response → continue) */
  multiTurn: boolean;
  /** Maximum message length (0 = unlimited) */
  maxMessageLength: number;
}

/**
 * A choice option for structured questions
 */
export interface SurfaceChoiceOption {
  label: string;
  description?: string;
  value: string;
}

/**
 * A plan step for tracking agent progress
 */
export interface SurfacePlanStep {
  content: string;
  status: 'pending' | 'inProgress' | 'completed' | 'canceled';
}

/**
 * A document reference
 */
export interface SurfaceDocument {
  id: string;
  title: string;
  content?: string;
  url?: string;
}

/**
 * A message in the conversation history.
 * Normalized across all platforms.
 */
export interface SurfaceMessage {
  id: string;
  role: 'agent' | 'user' | 'system';
  type: 'thought' | 'action' | 'question' | 'response' | 'error' | 'message';
  content: string;
  /** Additional structured data (action name, parameter, etc.) */
  metadata?: Record<string, unknown>;
  timestamp: string;
}

/**
 * Session context — tracks the state of a conversation
 */
export interface SurfaceSession {
  sessionId: string;
  platform: ConversationPlatform;
  /** Platform-specific reference (issue ID for Linear, channel+thread for Discord) */
  externalRef: string;
  /** Agent type handling this session */
  agentType: string;
  /** ISO timestamp */
  createdAt: string;
}

/**
 * ConversationSurface — The core interface every platform implements.
 *
 * Methods are ordered by lifecycle:
 * 1. acknowledge — immediate response (< 10s for Linear)
 * 2. showProgress — ongoing status updates
 * 3. askQuestion — elicitation (multi-turn)
 * 4. sendResponse — final answer (closes session)
 * 5. reportError — error state (closes session)
 */
export interface ConversationSurface {
  /** Which platform this surface represents */
  readonly platform: ConversationPlatform;

  /** What this platform supports */
  readonly capabilities: SurfaceCapabilities;

  // ─── Lifecycle Methods ───────────────────────────────────────

  /**
   * Acknowledge receipt of a message. Must be fast (< 10s for Linear).
   * Shows the user that the agent is alive and processing.
   */
  acknowledge(sessionId: string, message: string): Promise<void>;

  /**
   * Show what the agent is currently doing.
   * Maps to: Linear thought/action activity, Discord typing indicator + embed.
   */
  showProgress(sessionId: string, action: string, detail?: string): Promise<void>;

  /**
   * Ask the user a question. Optionally present structured choices.
   * The session enters an "awaiting input" state until the user responds.
   * Returns the message/activity ID for tracking.
   */
  askQuestion(
    sessionId: string,
    question: string,
    options?: SurfaceChoiceOption[]
  ): Promise<string>;

  /**
   * Send the final response. Session is complete after this.
   * Returns the message/activity ID.
   */
  sendResponse(sessionId: string, body: string): Promise<string>;

  /**
   * Report an error. Session enters error state after this.
   * Returns the message/activity ID.
   */
  reportError(sessionId: string, error: string): Promise<string>;

  // ─── Context Methods ─────────────────────────────────────────

  /**
   * Get conversation history for multi-turn context reconstruction.
   * Returns normalized messages across all platforms.
   */
  getHistory(sessionId: string): Promise<SurfaceMessage[]>;

  // ─── Optional: Documents ─────────────────────────────────────

  /**
   * Create a persistent document linked to the conversation context.
   * Only available when capabilities.documents === true.
   */
  createDocument?(sessionId: string, title: string, content: string): Promise<SurfaceDocument>;

  /**
   * Update an existing document.
   */
  updateDocument?(documentId: string, content: string, title?: string): Promise<boolean>;

  /**
   * Retrieve a document by ID.
   */
  getDocument?(documentId: string): Promise<SurfaceDocument | null>;

  // ─── Optional: Plans ─────────────────────────────────────────

  /**
   * Update the plan/checklist for a session.
   * Only available when capabilities.plans === true.
   */
  updatePlan?(sessionId: string, steps: SurfacePlanStep[]): Promise<void>;
}
