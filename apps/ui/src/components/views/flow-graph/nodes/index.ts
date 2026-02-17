/**
 * Node Types Registry
 *
 * Barrel export + React Flow nodeTypes map.
 */

import type { NodeTypes } from '@xyflow/react';
import { OrchestratorNode } from './orchestrator-node';
import { CrewNode } from './crew-node';
import { ServiceNode } from './service-node';
import { IntegrationNode } from './integration-node';
import { FeatureNode } from './feature-node';
import { AgentNode } from './agent-node';

export { OrchestratorNode } from './orchestrator-node';
export { CrewNode } from './crew-node';
export { ServiceNode } from './service-node';
export { IntegrationNode } from './integration-node';
export { FeatureNode } from './feature-node';
export { AgentNode } from './agent-node';

export const nodeTypes: NodeTypes = {
  orchestrator: OrchestratorNode,
  crew: CrewNode,
  service: ServiceNode,
  integration: IntegrationNode,
  feature: FeatureNode,
  agent: AgentNode,
};
