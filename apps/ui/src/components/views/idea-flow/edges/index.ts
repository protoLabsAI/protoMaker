/**
 * Idea Flow Edge Types
 *
 * Barrel export + React Flow edgeTypes map for idea flow visualization.
 */

import type { EdgeTypes } from '@xyflow/react';
import { PipelineEdge } from './pipeline-edge';

export { PipelineEdge } from './pipeline-edge';

export const edgeTypes: EdgeTypes = {
  pipeline: PipelineEdge,
};
