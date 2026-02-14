/**
 * Project Management Flow Types
 *
 * State annotations and types for LangGraph project management flows:
 * - Project Status Report: Collects metrics and generates formatted status updates
 * - Milestone Summary: Summarizes milestone completion with deliverables
 * - Risk Assessment: Identifies and scores project risks
 */

import { Annotation } from '@langchain/langgraph';
import { z } from 'zod';
import { appendReducer } from '../graphs/reducers.js';

// ─── Metric Types ──────────────────────────────────────────────────────────

export interface BoardMetrics {
  totalFeatures: number;
  byStatus: Record<string, number>;
  completionPercentage: number;
  blockedFeatures: string[];
  staleFeatures: string[];
  recentlyCompleted: Array<{
    id: string;
    title: string;
    completedAt: string;
    costUsd?: number;
  }>;
}

export interface PRMetrics {
  openPRs: number;
  mergedToday: number;
  conflicting: number;
  pendingReview: number;
  avgMergeTimeHours?: number;
  prDetails: Array<{
    number: number;
    title: string;
    state: string;
    mergeable: string;
    branch: string;
  }>;
}

export interface DependencyMetrics {
  totalDependencies: number;
  satisfiedDependencies: number;
  blockingChains: Array<{
    blocked: string;
    blockedBy: string[];
  }>;
  criticalPath: string[];
}

export interface AgentMetrics {
  runningAgents: number;
  totalCostUsd: number;
  avgExecutionTimeMs: number;
  failureRate: number;
  agentDetails: Array<{
    featureId: string;
    title: string;
    model: string;
    startTime: number;
    costUsd?: number;
  }>;
}

// ─── Analysis Types ────────────────────────────────────────────────────────

export type HealthStatus = 'on-track' | 'at-risk' | 'behind';

export interface ProgressAnalysis {
  health: HealthStatus;
  velocity: number; // features per hour
  estimatedCompletion?: string;
  bottlenecks: string[];
  highlights: string[];
}

export interface RiskFactor {
  id: string;
  category: 'technical' | 'resource' | 'dependency' | 'timeline' | 'quality';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  mitigation?: string;
  affectedFeatures?: string[];
}

export interface MilestoneSummary {
  name: string;
  status: 'not-started' | 'in-progress' | 'completed';
  completionPercentage: number;
  features: Array<{
    id: string;
    title: string;
    status: string;
  }>;
  deliverables: string[];
  blockers: string[];
}

// ─── Report Types ──────────────────────────────────────────────────────────

export interface StatusReport {
  generatedAt: string;
  projectPath: string;
  projectSlug?: string;
  health: HealthStatus;
  summary: string;
  metrics: {
    board: BoardMetrics;
    prs: PRMetrics;
    dependencies: DependencyMetrics;
    agents: AgentMetrics;
  };
  analysis: ProgressAnalysis;
  risks: RiskFactor[];
  milestones: MilestoneSummary[];
  recommendations: string[];
}

// ─── Zod Schemas ───────────────────────────────────────────────────────────

export const ProjectStatusStateSchema = z.object({
  projectPath: z.string(),
  projectSlug: z.string().optional(),

  boardMetrics: z.custom<BoardMetrics>().optional(),
  prMetrics: z.custom<PRMetrics>().optional(),
  dependencyMetrics: z.custom<DependencyMetrics>().optional(),
  agentMetrics: z.custom<AgentMetrics>().optional(),

  progressAnalysis: z.custom<ProgressAnalysis>().optional(),
  risks: z.array(z.custom<RiskFactor>()).default([]),
  milestones: z.array(z.custom<MilestoneSummary>()).default([]),

  statusReport: z.custom<StatusReport>().optional(),

  reviewVerdict: z.enum(['approve', 'revise']).optional(),
  reviewFeedback: z.string().optional(),
  revisionCount: z.number().default(0),

  formattedReport: z.string().optional(),
  error: z.string().optional(),
});

// ─── State Annotation ──────────────────────────────────────────────────────

/**
 * Project Status Report State
 *
 * Flow: gather_metrics -> analyze_progress -> assess_risks -> generate_report
 *       -> review_quality -> [format_output | revise] -> done
 */
export interface ProjectStatusState {
  /** Input: path to the project */
  projectPath: string;

  /** Optional project slug for project-plan-specific reporting */
  projectSlug?: string;

  /** Board feature metrics */
  boardMetrics?: BoardMetrics;

  /** Pull request metrics */
  prMetrics?: PRMetrics;

  /** Dependency graph metrics */
  dependencyMetrics?: DependencyMetrics;

  /** Agent execution metrics */
  agentMetrics?: AgentMetrics;

  /** Progress analysis result */
  progressAnalysis?: ProgressAnalysis;

  /** Identified risk factors (append reducer for parallel collection) */
  risks: RiskFactor[];

  /** Milestone summaries (append reducer for parallel collection) */
  milestones: MilestoneSummary[];

  /** Generated status report */
  statusReport?: StatusReport;

  /** Quality review verdict */
  reviewVerdict?: 'approve' | 'revise';

  /** Review feedback for revision */
  reviewFeedback?: string;

  /** Number of revision iterations */
  revisionCount: number;

  /** Final formatted output (markdown) */
  formattedReport?: string;

  /** Error message if flow fails */
  error?: string;
}

/**
 * LangGraph State Annotation for Project Status Report
 */
export const ProjectStatusStateAnnotation = Annotation.Root({
  projectPath: Annotation<string>,
  projectSlug: Annotation<string | undefined>,

  boardMetrics: Annotation<BoardMetrics | undefined>,
  prMetrics: Annotation<PRMetrics | undefined>,
  dependencyMetrics: Annotation<DependencyMetrics | undefined>,
  agentMetrics: Annotation<AgentMetrics | undefined>,

  progressAnalysis: Annotation<ProgressAnalysis | undefined>,

  risks: Annotation<RiskFactor[]>({
    reducer: appendReducer,
    default: () => [],
  }),

  milestones: Annotation<MilestoneSummary[]>({
    reducer: appendReducer,
    default: () => [],
  }),

  statusReport: Annotation<StatusReport | undefined>,

  reviewVerdict: Annotation<'approve' | 'revise' | undefined>,
  reviewFeedback: Annotation<string | undefined>,
  revisionCount: Annotation<number>({
    reducer: (left, right) => right ?? left ?? 0,
    default: () => 0,
  }),

  formattedReport: Annotation<string | undefined>,
  error: Annotation<string | undefined>,
});

export type ProjectStatusStateType = typeof ProjectStatusStateAnnotation.State;

// ─── Milestone Summary Types ───────────────────────────────────────────────

export interface Achievement {
  featureId: string;
  title: string;
  description: string;
  prNumber?: number;
  mergedAt: string;
  costUsd?: number;
  linesChanged?: { added: number; deleted: number };
}

export interface LessonLearned {
  category: 'technical' | 'process' | 'collaboration' | 'quality';
  insight: string;
  impact: 'positive' | 'negative' | 'neutral';
  actionItems?: string[];
}

export interface NextMilestonePreview {
  milestoneName: string;
  description: string;
  keyFeatures: string[];
  estimatedDuration?: string;
  dependencies?: string[];
}

export interface MilestoneReport {
  milestoneName: string;
  completedAt: string;
  totalFeatures: number;
  totalCostUsd: number;
  achievements: Achievement[];
  lessonsLearned: LessonLearned[];
  nextMilestone?: NextMilestonePreview;
  summary: string;
}

// ─── Milestone Summary State ───────────────────────────────────────────────

export const MilestoneSummaryStateSchema = z.object({
  projectPath: z.string(),
  milestoneName: z.string(),

  achievements: z.array(z.custom<Achievement>()).default([]),
  lessonsLearned: z.array(z.custom<LessonLearned>()).default([]),
  nextMilestonePreview: z.custom<NextMilestonePreview>().optional(),

  draftSummary: z.string().optional(),

  reviewVerdict: z.enum(['approve', 'revise']).optional(),
  reviewFeedback: z.string().optional(),
  revisionCount: z.number().default(0),

  milestoneReport: z.custom<MilestoneReport>().optional(),
  formattedReport: z.string().optional(),
  error: z.string().optional(),
});

export interface MilestoneSummaryState {
  /** Input: path to the project */
  projectPath: string;

  /** Input: milestone name to summarize */
  milestoneName: string;

  /** Collected achievements from completed features */
  achievements: Achievement[];

  /** Lessons learned during milestone execution */
  lessonsLearned: LessonLearned[];

  /** Preview of next milestone (if available) */
  nextMilestonePreview?: NextMilestonePreview;

  /** Draft summary text */
  draftSummary?: string;

  /** Quality review verdict */
  reviewVerdict?: 'approve' | 'revise';

  /** Review feedback for revision */
  reviewFeedback?: string;

  /** Number of revision iterations */
  revisionCount: number;

  /** Generated milestone report */
  milestoneReport?: MilestoneReport;

  /** Final formatted output (markdown) */
  formattedReport?: string;

  /** Error message if flow fails */
  error?: string;
}

export const MilestoneSummaryStateAnnotation = Annotation.Root({
  projectPath: Annotation<string>,
  milestoneName: Annotation<string>,

  achievements: Annotation<Achievement[]>({
    reducer: appendReducer,
    default: () => [],
  }),

  lessonsLearned: Annotation<LessonLearned[]>({
    reducer: appendReducer,
    default: () => [],
  }),

  nextMilestonePreview: Annotation<NextMilestonePreview | undefined>,
  draftSummary: Annotation<string | undefined>,

  reviewVerdict: Annotation<'approve' | 'revise' | undefined>,
  reviewFeedback: Annotation<string | undefined>,
  revisionCount: Annotation<number>({
    reducer: (left, right) => right ?? left ?? 0,
    default: () => 0,
  }),

  milestoneReport: Annotation<MilestoneReport | undefined>,
  formattedReport: Annotation<string | undefined>,
  error: Annotation<string | undefined>,
});

export type MilestoneSummaryStateType = typeof MilestoneSummaryStateAnnotation.State;
