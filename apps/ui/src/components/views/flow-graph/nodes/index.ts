/**
 * Node Types Registry
 *
 * Barrel export + React Flow nodeTypes map.
 */

import type { NodeTypes } from '@xyflow/react';
import { OrchestratorNode } from './orchestrator-node';
import { ServiceNode } from './service-node';
import { EngineServiceNode } from './engine-service-node';
import { IntegrationNode } from './integration-node';
import { FeatureNode } from './feature-node';
import { AgentNode } from './agent-node';
import { PipelineStageNode } from './pipeline-stage-node';

export { OrchestratorNode } from './orchestrator-node';
export { ServiceNode } from './service-node';
export { EngineServiceNode } from './engine-service-node';
export { IntegrationNode } from './integration-node';
export { FeatureNode } from './feature-node';
export { AgentNode } from './agent-node';
export { PipelineStageNode } from './pipeline-stage-node';

export const nodeTypes: NodeTypes = {
  orchestrator: OrchestratorNode,
  service: ServiceNode,
  'engine-service': EngineServiceNode,
  integration: IntegrationNode,
  feature: FeatureNode,
  agent: AgentNode,
  'pipeline-stage': PipelineStageNode,
};
