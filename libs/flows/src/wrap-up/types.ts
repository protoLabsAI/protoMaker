/**
 * Project Wrap-Up Flow Types
 *
 * State annotations and types for the post-completion knowledge loop.
 *
 * Flow stages:
 *   gather_metrics → generate_retro → extract_learnings → update_memory
 *   → generate_content_brief → propose_improvements → [HITL] → route_improvements → done
 *
 * The HITL checkpoint pauses for human review of proposed improvements.
 * Trust boundary auto-pass skips the HITL gate when configured.
 */

import { Annotation } from '@langchain/langgraph';
import { appendReducer } from '../graphs/reducers.js';

// ─── Stages ──────────────────────────────────────────────────────────────────

export type WrapUpStage =
  | 'gathering_metrics'
  | 'generating_retro'
  | 'extracting_learnings'
  | 'updating_memory'
  | 'generating_content'
  | 'proposing_improvements'
  | 'improvement_review'
  | 'routing_improvements'
  | 'completed'
  | 'error';

// ─── Input Types ─────────────────────────────────────────────────────────────

export interface WrapUpInput {
  projectPath: string;
  projectTitle: string;
  projectSlug: string;
  totalMilestones: number;
  totalFeatures: number;
  totalCostUsd: number;
  failureCount: number;
  milestoneSummaries: MilestoneSummary[];
}

export interface MilestoneSummary {
  milestoneTitle: string;
  featureCount: number;
  costUsd: number;
}

// ─── Metrics ─────────────────────────────────────────────────────────────────

export interface ProjectMetrics {
  totalFeatures: number;
  shippedFeatures: number;
  failedFeatures: number;
  totalCostUsd: number;
  totalMilestones: number;
  milestoneBreakdown: MilestoneSummary[];
  prUrls: string[];
  dataSummary: string;
}

// ─── Memory Types ────────────────────────────────────────────────────────────

export interface MemoryFileEntry {
  filename: string;
  content: string;
}

export interface StructuredLearning {
  heading: string;
  content: string;
  type: 'pattern' | 'gotcha' | 'learning' | 'decision';
  category: string;
}

// ─── Improvement Types ───────────────────────────────────────────────────────

export interface ImprovementItem {
  title: string;
  description: string;
  /** "operational" → Beads task, "code" → Automaker feature, "strategic" → PRD pipeline */
  type: 'operational' | 'code' | 'strategic';
  priority: 1 | 2 | 3;
  category?: string;
}

// ─── HITL Types ──────────────────────────────────────────────────────────────

export interface WrapUpHITLResponse {
  decision: 'approve' | 'revise' | 'cancel';
  feedback?: string;
}

// ─── State ───────────────────────────────────────────────────────────────────

export interface WrapUpState {
  stage: WrapUpStage;

  /** Input from CompletionDetectorService */
  input: WrapUpInput;

  // ─── Metrics ──────────────────────────────────────
  metrics?: ProjectMetrics;

  // ─── Retro Output ────────────────────────────────
  retrospective?: string;
  impactReport?: string;

  // ─── Learning Extraction ─────────────────────────
  memoryEntries: MemoryFileEntry[];
  learningSummary?: string;
  learnings: StructuredLearning[];

  // ─── Content Brief ───────────────────────────────
  contentBrief?: string;

  // ─── Improvements ────────────────────────────────
  improvements: ImprovementItem[];

  // ─── HITL ────────────────────────────────────────
  hitlResponse?: WrapUpHITLResponse;

  /** Trust boundary — auto-pass HITL when 'autoApprove' */
  trustBoundaryResult?: 'autoApprove' | 'requireReview';

  // ─── Routing Results ─────────────────────────────
  createdBeadsIds: string[];
  createdFeatureIds: string[];
  createdPrdIds: string[];

  // ─── Errors ──────────────────────────────────────
  errors: string[];
}

/**
 * LangGraph State Annotation for Project Wrap-Up
 */
export const WrapUpStateAnnotation = Annotation.Root({
  stage: Annotation<WrapUpStage>({
    reducer: (_, right) => right,
    default: () => 'gathering_metrics' as WrapUpStage,
  }),

  input: Annotation<WrapUpInput>,

  // Metrics
  metrics: Annotation<ProjectMetrics | undefined>,

  // Retro
  retrospective: Annotation<string | undefined>,
  impactReport: Annotation<string | undefined>,

  // Learnings
  memoryEntries: Annotation<MemoryFileEntry[]>({
    reducer: (_, right) => right ?? [],
    default: () => [],
  }),
  learningSummary: Annotation<string | undefined>,
  learnings: Annotation<StructuredLearning[]>({
    reducer: (_, right) => right ?? [],
    default: () => [],
  }),

  // Content brief
  contentBrief: Annotation<string | undefined>,

  // Improvements
  improvements: Annotation<ImprovementItem[]>({
    reducer: (_, right) => right ?? [],
    default: () => [],
  }),

  // HITL
  hitlResponse: Annotation<WrapUpHITLResponse | undefined>,
  trustBoundaryResult: Annotation<'autoApprove' | 'requireReview' | undefined>,

  // Routing results
  createdBeadsIds: Annotation<string[]>({
    reducer: appendReducer,
    default: () => [],
  }),
  createdFeatureIds: Annotation<string[]>({
    reducer: appendReducer,
    default: () => [],
  }),
  createdPrdIds: Annotation<string[]>({
    reducer: appendReducer,
    default: () => [],
  }),

  // Errors
  errors: Annotation<string[]>({
    reducer: appendReducer,
    default: () => [],
  }),
});

export type WrapUpStateType = typeof WrapUpStateAnnotation.State;
