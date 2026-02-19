/**
 * Escalation types for AutoMaker escalation router
 * Defines core types for routing critical signals to appropriate channels
 */

/**
 * Escalation severity levels
 * Determines urgency and routing strategy for signals
 */
export enum EscalationSeverity {
  /** Critical emergency requiring immediate DM notification */
  emergency = 'emergency',
  /** Critical issue requiring urgent attention */
  critical = 'critical',
  /** High priority issue */
  high = 'high',
  /** Medium priority issue */
  medium = 'medium',
  /** Low priority issue */
  low = 'low',
}

/**
 * Source of escalation signal
 * Identifies where the signal originated
 */
export enum EscalationSource {
  /** PR feedback requiring attention */
  pr_feedback = 'pr_feedback',
  /** Agent execution failure */
  agent_failure = 'agent_failure',
  /** CI/CD pipeline failure */
  ci_failure = 'ci_failure',
  /** Health check failure or degradation */
  health_check = 'health_check',
  /** Lead Engineer escalation */
  lead_engineer_escalation = 'lead_engineer_escalation',
  /** SLA breach detected */
  sla_breach = 'sla_breach',
  /** Board state anomaly detected */
  board_anomaly = 'board_anomaly',
  /** Human explicitly mentioned in a comment */
  human_mention = 'human_mention',
  /** Agent needs human input (elicitation) */
  agent_needs_input = 'agent_needs_input',
}

/**
 * Escalation signal metadata
 * Contains all information needed to route and process an escalation
 */
export interface EscalationSignal {
  /** Source of the escalation */
  source: EscalationSource;
  /** Severity level determining urgency */
  severity: EscalationSeverity;
  /** Type identifier for the signal */
  type: string;
  /** Additional context data for the signal */
  context: Record<string, unknown>;
  /** Key for deduplication to prevent spam */
  deduplicationKey: string;
  /** Timestamp when signal was created */
  timestamp?: string;
}

/**
 * Escalation channel interface
 * Implemented by all output channels (Discord DM, channel, Linear, etc.)
 */
export interface EscalationChannel {
  /** Unique name for this channel */
  name: string;

  /**
   * Determines if this channel can handle the given signal
   * @param signal The escalation signal to check
   * @returns true if this channel should process the signal
   */
  canHandle(signal: EscalationSignal): boolean;

  /**
   * Sends the escalation signal through this channel
   * @param signal The escalation signal to send
   * @returns Promise resolving when send is complete
   */
  send(signal: EscalationSignal): Promise<void>;

  /**
   * Rate limiting configuration for this channel
   * @returns Rate limit configuration or undefined if no limit
   */
  rateLimit?: {
    /** Maximum number of signals within the window */
    maxSignals: number;
    /** Time window in milliseconds */
    windowMs: number;
  };
}
