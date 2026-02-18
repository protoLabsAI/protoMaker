/**
 * Idea Flow Edge Types Registry
 *
 * Barrel export + React Flow edgeTypes map for the idea pipeline.
 */

import type { EdgeTypes } from '@xyflow/react';

// Placeholder edge component — will be implemented in future features
const PipelineEdge = () => null;

export const edgeTypes: EdgeTypes = {
  pipeline: PipelineEdge,
};
