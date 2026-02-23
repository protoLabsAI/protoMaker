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

export type PipelineStatus = `pipeline_${string}`;

export type FeatureStatusWithPipeline =
  | 'backlog'
  | 'in_progress'
  | 'review'
  | 'blocked'
  | 'done'
  | 'verified'
  // Legacy statuses still used by UI components (auto-normalized on server read)
  | 'waiting_approval'
  | 'completed'
  | PipelineStatus;
