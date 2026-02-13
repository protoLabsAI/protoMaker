/**
 * Type definitions for create-protolab package
 * Extracted from @automaker/types to avoid dependencies
 */

export type GapSeverity = 'critical' | 'recommended' | 'optional';

export type GapEffort = 'small' | 'medium' | 'large';

export type GapCategory = string;

export interface GapItem {
  id: string;
  category: GapCategory;
  severity: GapSeverity;
  title: string;
  current: string;
  target: string;
  effort: GapEffort;
  featureDescription: string;
}

export interface ComplianceItem {
  category: string;
  title: string;
  detail: string;
}

export interface GapAnalysisReport {
  projectPath: string;
  analyzedAt: string;
  overallScore: number;

  gaps: GapItem[];
  compliant: ComplianceItem[];

  summary: {
    critical: number;
    recommended: number;
    optional: number;
    compliant: number;
  };
}

export interface AlignmentFeature {
  title: string;
  description: string;
  complexity: GapEffort;
  priority: number;
  gapId: string;
  /** Index of the milestone this feature depends on (features in later milestones depend on earlier ones) */
  dependsOnMilestone?: number;
}

export interface AlignmentMilestone {
  title: string;
  features: AlignmentFeature[];
  /** 0-based index of this milestone in execution order */
  order: number;
  /** Indices of milestones that must complete before this one */
  dependsOn: number[];
}

export interface AlignmentProposal {
  projectPath: string;
  milestones: AlignmentMilestone[];
  totalFeatures: number;
  estimatedEffort: { small: number; medium: number; large: number };
  /** Milestone execution order (indices into milestones array) */
  dependencyOrder: number[];
}
