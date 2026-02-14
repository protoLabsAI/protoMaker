/**
 * Risk Assessment Flow
 *
 * LangGraph flow for identifying project risks and providing actionable recommendations.
 *
 * Flow:
 * START -> checkBlockers -> analyzeVelocity -> assessRisks -> recommend ->
 * antagonisticReview -> [done | hitl_review]
 *
 * Nodes:
 * - checkBlockers: Identifies stuck features and blockers
 * - analyzeVelocity: Analyzes feature completion velocity and trends
 * - assessRisks: Consolidates findings into risk categories
 * - recommend: Generates actionable recommendations
 * - antagonisticReview: Critical review of recommendations
 *
 * Can be scheduled weekly or triggered on-demand via API.
 */

import { Annotation } from '@langchain/langgraph';
import { MemorySaver } from '@langchain/langgraph';
import { GraphBuilder } from '../graphs/builder.js';
import { appendReducer } from '../graphs/reducers.js';

/**
 * Feature summary for risk assessment
 */
export interface FeatureSummary {
  id: string;
  title: string;
  status: string;
  startedAt?: string;
  updatedAt?: string;
  dependencies?: string[];
  isBlocked?: boolean;
}

/**
 * Blocker finding
 */
export interface BlockerFinding {
  featureId: string;
  featureTitle: string;
  type: 'stuck' | 'dependency' | 'external';
  duration?: string; // e.g., "2h", "3d"
  reason?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Velocity metrics
 */
export interface VelocityMetrics {
  completedLastWeek: number;
  completedLastMonth: number;
  averageCompletionTime?: string; // e.g., "2.5 days"
  trend: 'increasing' | 'stable' | 'decreasing';
  capacityUtilization?: number; // 0-100%
}

/**
 * Risk category
 */
export interface RiskCategory {
  category: 'capacity' | 'delivery' | 'quality' | 'dependency' | 'external';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  affectedFeatures: string[];
}

/**
 * Recommendation
 */
export interface Recommendation {
  priority: 'low' | 'medium' | 'high' | 'critical';
  action: string;
  rationale: string;
  affectedFeatures?: string[];
  estimatedImpact?: string;
}

/**
 * Antagonistic review of recommendations
 */
export interface AntagonisticReview {
  reviewer: 'ava' | 'jon';
  overallVerdict: 'approve' | 'concern' | 'revise';
  concerns?: string[];
  suggestions?: string[];
  reviewedAt: string;
}

/**
 * Risk Assessment State
 */
export interface RiskAssessmentState {
  /** Input: Current features snapshot */
  features: FeatureSummary[];

  /** Timestamp when assessment was triggered */
  assessmentDate?: string;

  /** Blocker findings from checkBlockers node */
  blockers: BlockerFinding[];

  /** Velocity metrics from analyzeVelocity node */
  velocityMetrics?: VelocityMetrics;

  /** Risk categories from assessRisks node */
  risks: RiskCategory[];

  /** Recommendations from recommend node */
  recommendations: Recommendation[];

  /** Antagonistic reviews (append reducer for parallel collection) */
  antagonisticReviews: AntagonisticReview[];

  /** Final consolidated assessment */
  consolidatedAssessment?: {
    summary: string;
    criticalRisks: string[];
    topRecommendations: string[];
    requiresHumanReview: boolean;
  };

  /** HITL flag */
  hitlRequired?: boolean;

  /** Human feedback if HITL was triggered */
  hitlFeedback?: string;
}

/**
 * State annotation for LangGraph
 */
export const RiskAssessmentStateAnnotation = Annotation.Root({
  // Input
  features: Annotation<FeatureSummary[]>,
  assessmentDate: Annotation<string | undefined>,

  // Intermediate results
  blockers: Annotation<BlockerFinding[]>({
    reducer: appendReducer,
    default: () => [],
  }),
  velocityMetrics: Annotation<VelocityMetrics | undefined>,
  risks: Annotation<RiskCategory[]>({
    reducer: appendReducer,
    default: () => [],
  }),
  recommendations: Annotation<Recommendation[]>({
    reducer: appendReducer,
    default: () => [],
  }),

  // Antagonistic reviews (append for parallel collection)
  antagonisticReviews: Annotation<AntagonisticReview[]>({
    reducer: appendReducer,
    default: () => [],
  }),

  // Output
  consolidatedAssessment: Annotation<
    | {
        summary: string;
        criticalRisks: string[];
        topRecommendations: string[];
        requiresHumanReview: boolean;
      }
    | undefined
  >,
  hitlRequired: Annotation<boolean | undefined>,
  hitlFeedback: Annotation<string | undefined>,
});

/**
 * Node: Check for blockers
 * Identifies stuck features, dependency blockers, and external blockers
 */
async function checkBlockers(state: RiskAssessmentState): Promise<Partial<RiskAssessmentState>> {
  const now = new Date();
  const blockers: BlockerFinding[] = [];

  for (const feature of state.features) {
    // Check for stuck features (in_progress for > 2 hours)
    if (feature.status === 'in_progress' && feature.startedAt) {
      const startedAt = new Date(feature.startedAt);
      const hoursSinceStart = (now.getTime() - startedAt.getTime()) / (1000 * 60 * 60);

      if (hoursSinceStart > 2) {
        blockers.push({
          featureId: feature.id,
          featureTitle: feature.title,
          type: 'stuck',
          duration: `${Math.round(hoursSinceStart)}h`,
          severity: hoursSinceStart > 24 ? 'critical' : hoursSinceStart > 12 ? 'high' : 'medium',
          reason: 'Feature has been in progress for an extended period',
        });
      }
    }

    // Check for blocked features
    if (feature.isBlocked) {
      blockers.push({
        featureId: feature.id,
        featureTitle: feature.title,
        type: 'external',
        severity: 'high',
        reason: 'Feature is explicitly marked as blocked',
      });
    }

    // Check for dependency blockers
    if (feature.dependencies && feature.dependencies.length > 0) {
      const unblockedDeps = feature.dependencies.filter((depId) => {
        const dep = state.features.find((f) => f.id === depId);
        return dep && (dep.status === 'done' || dep.status === 'review');
      });

      if (unblockedDeps.length < feature.dependencies.length) {
        blockers.push({
          featureId: feature.id,
          featureTitle: feature.title,
          type: 'dependency',
          severity: 'medium',
          reason: `Waiting on ${feature.dependencies.length - unblockedDeps.length} dependencies`,
        });
      }
    }
  }

  return { blockers };
}

/**
 * Node: Analyze velocity
 * Calculates completion trends and capacity utilization
 */
async function analyzeVelocity(state: RiskAssessmentState): Promise<Partial<RiskAssessmentState>> {
  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Count completed features
  const completedFeatures = state.features.filter((f) => f.status === 'done');
  const completedLastWeek = completedFeatures.filter(
    (f) => f.updatedAt && new Date(f.updatedAt) >= oneWeekAgo
  ).length;
  const completedLastMonth = completedFeatures.filter(
    (f) => f.updatedAt && new Date(f.updatedAt) >= oneMonthAgo
  ).length;

  // Calculate trend (simple heuristic)
  let trend: 'increasing' | 'stable' | 'decreasing' = 'stable';
  if (completedLastWeek > completedLastMonth / 4) {
    trend = 'increasing';
  } else if (completedLastWeek < completedLastMonth / 6) {
    trend = 'decreasing';
  }

  // Calculate capacity utilization
  const inProgressCount = state.features.filter((f) => f.status === 'in_progress').length;
  const capacityUtilization = Math.min(100, (inProgressCount / 5) * 100); // Assume 5 parallel capacity

  const velocityMetrics: VelocityMetrics = {
    completedLastWeek,
    completedLastMonth,
    trend,
    capacityUtilization,
  };

  return { velocityMetrics };
}

/**
 * Node: Assess risks
 * Consolidates blockers and velocity into risk categories
 */
async function assessRisks(state: RiskAssessmentState): Promise<Partial<RiskAssessmentState>> {
  const risks: RiskCategory[] = [];

  // Capacity risk
  if (state.velocityMetrics && state.velocityMetrics.capacityUtilization) {
    const utilization = state.velocityMetrics.capacityUtilization;
    if (utilization > 90) {
      risks.push({
        category: 'capacity',
        severity: 'high',
        description: 'Capacity is near maximum, may cause bottlenecks',
        affectedFeatures: state.features.filter((f) => f.status === 'in_progress').map((f) => f.id),
      });
    } else if (utilization < 30) {
      risks.push({
        category: 'capacity',
        severity: 'low',
        description: 'Capacity is underutilized',
        affectedFeatures: [],
      });
    }
  }

  // Delivery risk from velocity trends
  if (state.velocityMetrics && state.velocityMetrics.trend === 'decreasing') {
    risks.push({
      category: 'delivery',
      severity: 'medium',
      description: 'Velocity is decreasing, may impact delivery timelines',
      affectedFeatures: state.features.filter((f) => f.status === 'backlog').map((f) => f.id),
    });
  }

  // Blocker risks
  const criticalBlockers = state.blockers.filter((b) => b.severity === 'critical');
  if (criticalBlockers.length > 0) {
    risks.push({
      category: 'dependency',
      severity: 'critical',
      description: `${criticalBlockers.length} critical blockers detected`,
      affectedFeatures: criticalBlockers.map((b) => b.featureId),
    });
  }

  return { risks };
}

/**
 * Node: Generate recommendations
 * Produces actionable recommendations based on risks
 */
async function recommend(state: RiskAssessmentState): Promise<Partial<RiskAssessmentState>> {
  const recommendations: Recommendation[] = [];

  // Recommendations for critical blockers
  const criticalBlockers = state.blockers.filter((b) => b.severity === 'critical');
  if (criticalBlockers.length > 0) {
    recommendations.push({
      priority: 'critical',
      action: 'Immediately investigate and resolve stuck features',
      rationale: `${criticalBlockers.length} features have been stuck for >24h`,
      affectedFeatures: criticalBlockers.map((b) => b.featureId),
    });
  }

  // Recommendations for capacity
  if (state.velocityMetrics && state.velocityMetrics.capacityUtilization) {
    if (state.velocityMetrics.capacityUtilization > 90) {
      recommendations.push({
        priority: 'high',
        action: 'Review capacity allocation and consider deferring lower-priority features',
        rationale: 'System is running at >90% capacity',
      });
    }
  }

  // Recommendations for velocity trends
  if (state.velocityMetrics && state.velocityMetrics.trend === 'decreasing') {
    recommendations.push({
      priority: 'medium',
      action: 'Investigate causes of velocity decrease and address systemic issues',
      rationale: 'Completion rate has decreased compared to previous period',
    });
  }

  // Recommendations for dependency blockers
  const depBlockers = state.blockers.filter((b) => b.type === 'dependency');
  if (depBlockers.length > 2) {
    recommendations.push({
      priority: 'medium',
      action: 'Review feature dependencies and consider reordering or parallelizing work',
      rationale: `${depBlockers.length} features are blocked by dependencies`,
      affectedFeatures: depBlockers.map((b) => b.featureId),
    });
  }

  return { recommendations };
}

/**
 * Node: Antagonistic review
 * Critical review of recommendations from multiple perspectives
 */
async function antagonisticReview(
  state: RiskAssessmentState
): Promise<Partial<RiskAssessmentState>> {
  const antagonisticReviews: AntagonisticReview[] = [];

  // Ava's review (operational perspective)
  antagonisticReviews.push({
    reviewer: 'ava',
    overallVerdict: 'approve',
    suggestions: [
      'Consider automating blocker detection',
      'Add velocity tracking dashboard for real-time monitoring',
    ],
    reviewedAt: new Date().toISOString(),
  });

  // Jon's review (critical perspective)
  const hasCriticalRisks = state.risks.some((r) => r.severity === 'critical');
  antagonisticReviews.push({
    reviewer: 'jon',
    overallVerdict: hasCriticalRisks ? 'concern' : 'approve',
    concerns: hasCriticalRisks
      ? ['Critical risks require immediate attention', 'Recommendations may be too conservative']
      : undefined,
    suggestions: ['Add more specific timelines to recommendations', 'Include ROI estimates'],
    reviewedAt: new Date().toISOString(),
  });

  // Consolidate assessment
  const criticalRisks = state.risks
    .filter((r) => r.severity === 'critical' || r.severity === 'high')
    .map((r) => r.description);

  const topRecommendations = state.recommendations
    .filter((r) => r.priority === 'critical' || r.priority === 'high')
    .map((r) => r.action);

  const requiresHumanReview =
    hasCriticalRisks || state.blockers.filter((b) => b.severity === 'critical').length > 0;

  const consolidatedAssessment = {
    summary: `Found ${state.blockers.length} blockers, ${state.risks.length} risks, generated ${state.recommendations.length} recommendations`,
    criticalRisks,
    topRecommendations,
    requiresHumanReview,
  };

  return {
    antagonisticReviews,
    consolidatedAssessment,
    hitlRequired: requiresHumanReview,
  };
}

/**
 * Routing function for HITL check
 */
function routeHitl(state: RiskAssessmentState): string {
  if (state.hitlRequired) {
    return 'hitl_review';
  }
  return 'done';
}

/**
 * HITL review node - paused for human intervention
 */
async function hitlReview(_state: RiskAssessmentState): Promise<Partial<RiskAssessmentState>> {
  return {};
}

/**
 * Creates the risk assessment graph
 *
 * @param enableCheckpointing - Whether to enable state persistence (default: true)
 * @returns Compiled LangGraph runnable
 */
export function createRiskAssessmentGraph(enableCheckpointing = true) {
  const checkpointer = enableCheckpointing ? new MemorySaver() : undefined;

  const builder = new GraphBuilder<RiskAssessmentState>({
    stateAnnotation: RiskAssessmentStateAnnotation,
    enableCheckpointing,
    checkpointer,
  });

  // Add all nodes
  builder
    .addNode('checkBlockers', checkBlockers)
    .addNode('analyzeVelocity', analyzeVelocity)
    .addNode('assessRisks', assessRisks)
    .addNode('recommend', recommend)
    .addNode('antagonisticReview', antagonisticReview)
    .addNode('hitl_review', hitlReview)
    .addNode('done', async () => ({}));

  // Wire the flow
  builder
    .setEntryPoint('checkBlockers')
    .addEdge('checkBlockers', 'analyzeVelocity')
    .addEdge('analyzeVelocity', 'assessRisks')
    .addEdge('assessRisks', 'recommend')
    .addEdge('recommend', 'antagonisticReview');

  // Conditional: hitlRequired -> hitl_review (interrupt), otherwise -> done
  builder.addConditionalEdge('antagonisticReview', routeHitl, {
    hitl_review: 'hitl_review',
    done: 'done',
  });

  // HITL review flows to done
  builder.addEdge('hitl_review', 'done');

  // Done is the finish point
  builder.setFinishPoint('done');

  // Compile with interruptBefore to pause at hitl_review for HITL
  const graph = builder.getGraph();
  return graph.compile({
    checkpointer,
    interruptBefore: ['hitl_review'] as any,
  });
}

/**
 * Default graph instance with checkpointing enabled
 */
export const riskAssessmentGraph = createRiskAssessmentGraph();
