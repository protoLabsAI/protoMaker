/**
 * Google Workspace Integration Types
 *
 * Types for Google Calendar webhooks, Gmail HITL approval,
 * and Pub/Sub push notifications.
 */

// ============================================================================
// Google Workspace Integration Config (extends GoogleIntegrationConfig)
// ============================================================================

/**
 * GoogleWorkspaceConfig - Extended Google Workspace configuration
 *
 * Extends the base GoogleIntegrationConfig with Calendar webhook state,
 * Gmail Pub/Sub watch state, and Discord notification settings for HITL.
 */
export interface GoogleWorkspaceConfig {
  /** Calendar webhook state (push notifications) */
  calendarWatch?: CalendarWatchState;

  /** Gmail Pub/Sub watch state */
  gmailWatch?: GmailWatchState;

  /** Discord notification settings for HITL approval */
  discord?: GoogleWorkspaceDiscordConfig;
}

// ============================================================================
// Calendar Webhook State
// ============================================================================

/**
 * CalendarWatchState - Persisted state for a Google Calendar push notification channel.
 *
 * Google Calendar webhooks expire after 24 hours. The renewal service
 * uses this state to renew before expiry.
 */
export interface CalendarWatchState {
  /** Unique channel ID (UUID, generated per watch) */
  channelId: string;
  /** Google-assigned resource ID (returned from events.watch()) */
  resourceId: string;
  /** ISO 8601 timestamp when the watch expires */
  expiresAt: string;
  /** Secret token for verifying X-Goog-Channel-Token header */
  webhookSecret: string;
}

// ============================================================================
// Gmail Watch State
// ============================================================================

/**
 * GmailWatchState - Persisted state for Gmail Pub/Sub push notifications.
 *
 * Gmail watches expire after 7 days. The renewal service renews every 6 days.
 */
export interface GmailWatchState {
  /** Google's history ID for incremental sync */
  historyId: string;
  /** ISO 8601 timestamp when the watch expires */
  expiresAt: string;
  /** Full Pub/Sub topic name (e.g., 'projects/my-project/topics/automaker-gmail-push') */
  topicName: string;
}

// ============================================================================
// Discord Notification Config (for HITL approval)
// ============================================================================

/**
 * GoogleWorkspaceDiscordConfig - Discord channel/user config for Google Workspace HITL.
 */
export interface GoogleWorkspaceDiscordConfig {
  /** Discord channel ID for email approval requests */
  emailApprovalChannelId: string;
  /** Discord channel ID for calendar reminders */
  calendarReminderChannelId: string;
  /** Discord user IDs authorized to approve email sends */
  authorizedApproverIds: string[];
}

// ============================================================================
// Email Draft Approval
// ============================================================================

/**
 * EmailDraftApproval - In-memory tracking of a pending email draft approval.
 *
 * When an agent drafts an email, it's stored in Gmail as a draft and a Discord
 * message is posted for HITL approval. This tracks the mapping.
 */
export interface EmailDraftApproval {
  /** Gmail draft ID */
  draftId: string;
  /** Recipient email address */
  to: string;
  /** Email subject line */
  subject: string;
  /** Email body (plain text) */
  body: string;
  /** Context: why the agent drafted this email */
  context: string;
  /** When the approval request was created */
  createdAt: string;
  /** When the approval expires (auto-discard after this) */
  expiresAt: string;
  /** Discord message ID (used to correlate reactions) */
  discordMessageId: string;
}

// ============================================================================
// Calendar Event Reminder
// ============================================================================

/**
 * CalendarEventReminder - Tracks which events have had reminders sent.
 */
export interface CalendarEventReminder {
  /** Google Calendar event ID */
  eventId: string;
  /** Event title */
  summary: string;
  /** ISO 8601 start time */
  startTime: string;
  /** ISO 8601 timestamp when reminder was sent */
  reminderSentAt?: string;
}

// ============================================================================
// Google API Error Types
// ============================================================================

/**
 * GoogleAPIErrorType - Classification of Google API errors for retry logic.
 */
export type GoogleAPIErrorType =
  | 'token_expired'
  | 'rate_limited'
  | 'permission_denied'
  | 'not_found'
  | 'server_error'
  | 'unknown';
