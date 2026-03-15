// Graph builder and factory functions
export {
  GraphBuilder,
  createLinearGraph,
  createLoopGraph,
  createBranchingGraph,
  createToolNode,
  END,
  START,
} from './builder.js';
export type { GraphBuilderConfig, NodeFunction, Checkpointer } from './builder.js';

// Routers
export {
  createBinaryRouter,
  createValueRouter,
  createSequentialRouter,
  createParallelRouter,
  createFieldRouter,
  createEndRouter,
  combineRoutersAnd,
  combineRoutersOr,
  createRouteMapRouter,
} from './routers.js';
export type { NodeName, ConditionalEdgeFunction, RouteMap } from './routers.js';

// Reducers
export {
  fileReducer,
  todoReducer,
  appendReducer,
  replaceReducer,
  setUnionReducer,
  mapMergeReducer,
  counterReducer,
  maxReducer,
  minReducer,
  idDedupAppendReducer,
  createLruReducer,
} from './reducers.js';
export type { FileOperation, TodoItem } from './reducers.js';

// State utilities
export {
  createStateAnnotation,
  validateState,
  createStateUpdater,
  mergeState,
  deepMergeState,
  isValidStateUpdate,
} from './state-utils.js';

// State transforms
export {
  createSubgraphBridge,
  createFieldMapper,
  createIdentityTransformer,
} from './state-transforms.js';
export type { CompiledSubgraph, StateTransformer, FieldMapping } from './state-transforms.js';

// XML parser (zero-dep utility)
export {
  extractTag,
  extractRequiredTag,
  extractOptionalTag,
  extractAllTags,
  extractTaggedJSON,
  extractRequiredInt,
  extractClampedInt,
  extractOptionalInt,
  extractBoolean,
  isXML,
  extractRequiredEnum,
  extractOptionalEnum,
} from './xml-parser.js';
