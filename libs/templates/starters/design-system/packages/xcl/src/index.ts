/**
 * XCL (XML Component Language) — public API
 *
 * Provides 80–96% token reduction for LLM React component operations.
 *
 * Usage:
 *   import { serialize, deserialize, xclToTSX, validateRoundTrip } from '@@PROJECT_NAME-xcl';
 */

export type {
  PropDef,
  PropType,
  ClassCondition,
  RenderNode,
  ComputedVar,
  ComponentDef,
  XCLDocument,
  XCLMetrics,
  RoundTripResult,
} from './types.js';

export { serialize, serializeDocument, serializeWithMetrics } from './serializer.js';

export { deserialize, deserializeDocument } from './deserializer.js';

export { xclToTSX, componentDefToTSX } from './xcl-to-tsx.js';

export { validateRoundTrip, estimateReduction } from './validation.js';
