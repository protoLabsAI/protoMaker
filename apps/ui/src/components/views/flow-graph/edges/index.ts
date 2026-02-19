/**
 * Edge Types Registry
 */

import type { EdgeTypes } from '@xyflow/react';
import { DelegationEdge } from './delegation-edge';
import { WorkflowEdge } from './workflow-edge';
import { IntegrationEdge } from './integration-edge';
import { PipelineEdge } from './pipeline-edge';
import { FlowEdge } from './flow-edge';

export { DelegationEdge } from './delegation-edge';
export { WorkflowEdge } from './workflow-edge';
export { IntegrationEdge } from './integration-edge';
export { PipelineEdge } from './pipeline-edge';
export { FlowEdge } from './flow-edge';

export const edgeTypes: EdgeTypes = {
  delegation: DelegationEdge,
  workflow: WorkflowEdge,
  integration: IntegrationEdge,
  pipeline: PipelineEdge,
  'flow-edge': FlowEdge,
};
