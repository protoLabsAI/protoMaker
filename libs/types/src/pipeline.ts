/**
 * Pipeline types for AutoMaker custom workflow steps
 */

export interface PipelineStep {
  id: string;
  name: string;
  order: number;
  instructions: string;
  colorClass: string;
  createdAt: string;
  updatedAt: string;
}

export interface PipelineConfig {
  version: 1;
  steps: PipelineStep[];
}

/**
 * Summary captured from a single pipeline step execution.
 * Accumulated on the feature to provide phase-structured output history.
 */
export interface PipelineSummary {
  stepId: string;
  stepName: string;
  summary: string;
  completedAt: string;
}

export type PipelineStatus = `pipeline_${string}`;

export type FeatureStatusWithPipeline =
  | 'backlog'
  | 'in_progress'
  | 'review'
  | 'blocked'
  | 'done'
  | 'verified'
  | 'interrupted' // Server shut down while feature was running
  | 'ready' // Dependencies satisfied, ready for execution
  // Legacy statuses still used by UI components (auto-normalized on server read)
  | 'waiting_approval'
  | 'completed'
  | PipelineStatus;
