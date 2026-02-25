/**
 * Ceremony Types - Types for milestone completion updates and project retrospectives
 *
 * Ceremonies are structured team events that occur at key project milestones:
 * - Milestone Updates: Celebrate milestone completion, share learnings, plan next steps
 * - Project Retrospectives: Review project success, capture insights, identify improvements
 */

/**
 * CeremonyType - Type of ceremony event
 *
 * - milestone_completed: Milestone completion update ceremony
 * - project_completed: Project retrospective ceremony
 */
export type CeremonyType = 'milestone_completed' | 'project_completed';

/**
 * MilestoneUpdateData - Data captured during a milestone completion update ceremony
 *
 * Structured information shared when a milestone is completed:
 * - What was accomplished
 * - Key learnings and insights
 * - Challenges encountered and how they were resolved
 * - Next steps and upcoming milestones
 */
export interface MilestoneUpdateData {
  /** ID of the milestone that was completed */
  milestoneId: string;
  /** Name of the completed milestone */
  milestoneName: string;
  /** ID of the project this milestone belongs to */
  projectId: string;
  /** Project name for context */
  projectName: string;
  /** ISO timestamp when the milestone was completed */
  completedAt: string;
  /** Summary of what was accomplished in this milestone */
  accomplishments: string[];
  /** Key learnings or insights gained during the milestone */
  learnings: string[];
  /** Challenges encountered and how they were resolved */
  challenges?: Array<{
    /** Description of the challenge */
    challenge: string;
    /** How it was resolved */
    resolution: string;
  }>;
  /** Next steps or upcoming work */
  nextSteps?: string[];
  /** Team members who contributed to this milestone */
  contributors?: string[];
  /** Metrics or stats (e.g., features completed, PRs merged) */
  metrics?: Record<string, number | string>;
}

/**
 * ProjectRetroData - Data captured during a project retrospective ceremony
 *
 * Comprehensive review of a completed project:
 * - Overall project outcomes and success metrics
 * - What went well and what could be improved
 * - Key learnings for future projects
 * - Recommendations for process improvements
 */
/**
 * CeremonyAuditType - All ceremony event types fired by CeremonyService
 */
export type CeremonyAuditType =
  | 'epic_kickoff'
  | 'standup'
  | 'milestone_retro'
  | 'epic_delivery'
  | 'content_brief'
  | 'project_retro'
  | 'post_project_docs';

/**
 * CeremonyDeliveryStatus - Delivery state of a ceremony event
 */
export type CeremonyDeliveryStatus = 'pending' | 'delivered' | 'failed' | 'skipped';

/**
 * CeremonyAuditEntry - A single ceremony event in the audit log
 */
export interface CeremonyAuditEntry {
  /** Unique ID for this audit entry (also used as correlationId for Discord delivery) */
  id: string;
  /** ISO timestamp when the ceremony fired */
  timestamp: string;
  /** Type of ceremony */
  ceremonyType: CeremonyAuditType;
  /** Project path */
  projectPath: string;
  /** Project slug */
  projectSlug?: string;
  /** Milestone slug (if applicable) */
  milestoneSlug?: string;
  /** Feature ID (if applicable) */
  featureId?: string;
  /** Discord channel ID that was targeted */
  discordChannelId?: string;
  /** Discord message ID after delivery */
  discordMessageId?: string;
  /** Current delivery status */
  deliveryStatus: CeremonyDeliveryStatus;
  /** Error message if delivery failed */
  errorMessage?: string;
  /** Summary payload */
  payload: {
    title: string;
    summary?: string;
  };
}

export interface ProjectRetroData {
  /** ID of the completed project */
  projectId: string;
  /** Project name */
  projectName: string;
  /** ISO timestamp when the project was completed */
  completedAt: string;
  /** Project duration in days */
  durationDays?: number;
  /** Summary of overall project success and outcomes */
  outcomes: string[];
  /** What went well during the project */
  wentWell: string[];
  /** What could be improved for future projects */
  couldImprove: string[];
  /** Key learnings and insights from the project */
  learnings: string[];
  /** Recommendations for future projects or process improvements */
  recommendations?: string[];
  /** Team members who contributed to the project */
  contributors?: string[];
  /** Project metrics (e.g., total features, PRs merged, lines of code) */
  metrics?: Record<string, number | string>;
  /** Impact or value delivered by the project */
  impact?: string;
}
