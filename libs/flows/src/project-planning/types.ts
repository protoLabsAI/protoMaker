/**
 * Project Planning Flow Types
 *
 * State annotations and types for the Linear-native project planning workflow.
 *
 * Flow stages:
 *   receive → research → planning_doc → [HITL] → deep_research → research_doc → [HITL]
 *   → generate_prd → [HITL] → plan_milestones → [HITL] → create_issues → done
 *
 * Each HITL checkpoint pauses the flow and presents a document to the user
 * via the ConversationSurface. The user's response resumes the flow.
 */

import { Annotation } from '@langchain/langgraph';
import { appendReducer } from '../graphs/reducers.js';

// ─── Planning Stages ────────────────────────────────────────────────────────

/**
 * The stages of the planning flow.
 * Each stage maps to a HITL checkpoint or processing step.
 */
export type PlanningStage =
  | 'received'
  | 'researching'
  | 'planning_doc_review'
  | 'deep_researching'
  | 'research_doc_review'
  | 'prd_review'
  | 'milestone_review'
  | 'creating_issues'
  | 'completed'
  | 'error';

// ─── Project Input ──────────────────────────────────────────────────────────

export interface ProjectInput {
  /** Linear project ID */
  projectId: string;
  /** Project name from Linear */
  name: string;
  /** Project description from Linear */
  description: string;
  /** Linear team ID */
  teamId?: string;
  /** Linear team name */
  teamName?: string;
  /** Linear project URL */
  url?: string;
}

// ─── Research Types ─────────────────────────────────────────────────────────

export interface ResearchFinding {
  topic: string;
  summary: string;
  relevantFiles?: string[];
  patterns?: string[];
  risks?: string[];
}

export interface ResearchReport {
  projectName: string;
  findings: ResearchFinding[];
  codebaseContext: string;
  technicalConstraints: string[];
  existingPatterns: string[];
  suggestedApproach: string;
}

// ─── PRD Types ──────────────────────────────────────────────────────────────

export interface SPARCSection {
  situation: string;
  problem: string;
  approach: string;
  results: string;
  constraints: string[];
}

// ─── Milestone Types ────────────────────────────────────────────────────────

export interface PlannedPhase {
  title: string;
  description: string;
  filesToModify: string[];
  acceptanceCriteria: string[];
  complexity: 'small' | 'medium' | 'large';
}

export interface PlannedMilestone {
  title: string;
  description: string;
  phases: PlannedPhase[];
}

// ─── HITL Response ──────────────────────────────────────────────────────────

export interface HITLResponse {
  /** User's decision */
  decision: 'approve' | 'revise' | 'cancel';
  /** Feedback text (for revisions) */
  feedback?: string;
  /** Which checkpoint this response is for */
  checkpoint: string;
}

// ─── Document Artifacts ─────────────────────────────────────────────────────

export interface PlanningArtifact {
  /** Document ID (from ConversationSurface.createDocument) */
  documentId?: string;
  /** Document title */
  title: string;
  /** Document content (markdown) */
  content: string;
  /** When this artifact was created */
  createdAt: string;
}

// ─── State ──────────────────────────────────────────────────────────────────

export interface ProjectPlanningState {
  /** Current stage in the planning pipeline */
  stage: PlanningStage;

  /** The project input from Linear */
  projectInput: ProjectInput;

  /** Agent session ID (for ConversationSurface interactions) */
  sessionId: string;

  /** Path to the repository being planned */
  projectPath: string;

  // ─── Research Outputs ─────────────────────────────────────

  /** Initial research findings */
  researchReport?: ResearchReport;

  /** Planning document (initial high-level plan) */
  planningDoc?: PlanningArtifact;

  /** Deep research document (detailed implementation analysis) */
  researchDoc?: PlanningArtifact;

  // ─── PRD Outputs ──────────────────────────────────────────

  /** SPARC PRD sections */
  prd?: SPARCSection;

  /** PRD document artifact */
  prdDoc?: PlanningArtifact;

  // ─── Milestone Outputs ────────────────────────────────────

  /** Planned milestones with phases */
  milestones: PlannedMilestone[];

  /** Milestone document artifact */
  milestoneDoc?: PlanningArtifact;

  // ─── HITL State ───────────────────────────────────────────

  /** Accumulated HITL responses (append reducer for history) */
  hitlResponses: HITLResponse[];

  /** The latest HITL response (for routing decisions) */
  latestHitlResponse?: HITLResponse;

  /** Number of revision iterations per checkpoint */
  revisionCounts: Record<string, number>;

  // ─── Issue Creation ───────────────────────────────────────

  /** Linear issue IDs created from milestones */
  createdIssueIds: string[];

  /** Linear project ID for linking issues */
  linearProjectId?: string;

  // ─── Trust Boundary ──────────────────────────────────────

  /** Trust boundary evaluation result — determines if HITL gates auto-pass */
  trustBoundaryResult?: 'autoApprove' | 'requireReview';

  // ─── Errors ───────────────────────────────────────────────

  /** Error messages accumulated during the flow */
  errors: string[];
}

/**
 * LangGraph State Annotation for Project Planning
 */
export const ProjectPlanningStateAnnotation = Annotation.Root({
  stage: Annotation<PlanningStage>({
    reducer: (_, right) => right,
    default: () => 'received' as PlanningStage,
  }),

  projectInput: Annotation<ProjectInput>,
  sessionId: Annotation<string>,
  projectPath: Annotation<string>,

  // Research outputs
  researchReport: Annotation<ResearchReport | undefined>,
  planningDoc: Annotation<PlanningArtifact | undefined>,
  researchDoc: Annotation<PlanningArtifact | undefined>,

  // PRD outputs
  prd: Annotation<SPARCSection | undefined>,
  prdDoc: Annotation<PlanningArtifact | undefined>,

  // Milestone outputs
  milestones: Annotation<PlannedMilestone[]>({
    reducer: (_, right) => right ?? [],
    default: () => [],
  }),
  milestoneDoc: Annotation<PlanningArtifact | undefined>,

  // HITL state
  hitlResponses: Annotation<HITLResponse[]>({
    reducer: appendReducer,
    default: () => [],
  }),
  latestHitlResponse: Annotation<HITLResponse | undefined>,
  revisionCounts: Annotation<Record<string, number>>({
    reducer: (left, right) => ({ ...left, ...right }),
    default: () => ({}),
  }),

  // Issue creation
  createdIssueIds: Annotation<string[]>({
    reducer: appendReducer,
    default: () => [],
  }),
  linearProjectId: Annotation<string | undefined>,

  // Trust boundary
  trustBoundaryResult: Annotation<'autoApprove' | 'requireReview' | undefined>,

  // Errors
  errors: Annotation<string[]>({
    reducer: appendReducer,
    default: () => [],
  }),
});

export type ProjectPlanningStateType = typeof ProjectPlanningStateAnnotation.State;
