/**
 * Idea Flow Node Types
 *
 * Barrel export + React Flow nodeTypes map for idea flow visualization.
 */

import type { NodeTypes } from '@xyflow/react';
import { IntakeNode } from './intake-node';
import { PipelineStepNode } from './pipeline-step-node';
import { TerminalNode } from './terminal-node';

export { IntakeNode } from './intake-node';
export { PipelineStepNode } from './pipeline-step-node';
export { TerminalNode } from './terminal-node';

export const ideaFlowNodeTypes: NodeTypes = {
  intake: IntakeNode,
  pipelineStep: PipelineStepNode,
  terminal: TerminalNode,
};
