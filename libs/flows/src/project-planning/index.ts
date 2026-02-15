/**
 * @automaker/flows - Project Planning
 *
 * LangGraph flow for Linear-native project planning.
 * Drives the full workflow from project creation through milestone definition,
 * with HITL checkpoints at each stage.
 */

// Main graph
export { createProjectPlanningFlow, type ProjectPlanningFlowConfig } from './graph.js';

// Types and state annotations
export {
  ProjectPlanningStateAnnotation,
  type ProjectPlanningState,
  type ProjectPlanningStateType,
  type PlanningStage,
  type ProjectInput,
  type ResearchFinding,
  type ResearchReport,
  type SPARCSection,
  type PlannedPhase,
  type PlannedMilestone,
  type HITLResponse,
  type PlanningArtifact,
} from './types.js';

// Node factory exports (for server-side dependency injection)
export { createResearchNode, type ResearchExecutor } from './nodes/research.js';
export { createPlanningDocNode, type PlanningDocGenerator } from './nodes/create-planning-doc.js';
export { createDeepResearchNode, type DeepResearchExecutor } from './nodes/deep-research.js';
export { createGeneratePRDNode, type PRDGenerator } from './nodes/generate-prd.js';
export { createPlanMilestonesNode, type MilestonePlanner } from './nodes/plan-milestones.js';
export { createIssueCreationNode, type IssueCreator } from './nodes/create-issues.js';
export { createHitlRouter, createHitlProcessorNode } from './nodes/hitl-checkpoint.js';
