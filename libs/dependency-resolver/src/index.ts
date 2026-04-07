/**
 * @protolabsai/dependency-resolver
 * Feature dependency resolution for AutoMaker
 */

export {
  resolveDependencies,
  areDependenciesSatisfied,
  getBlockingDependencies,
  createFeatureMap,
  getBlockingDependenciesFromMap,
  getBlockingInfo,
  wouldCreateCircularDependency,
  dependencyExists,
  getAncestors,
  formatAncestorContextForPrompt,
  checkExternalDependencies,
  invalidateExternalDepCache,
  type DependencyResolutionResult,
  type AncestorContext,
  type BlockingInfo,
  type ExternalDependencyCheckResult,
} from './resolver.js';

export {
  detectExportedSymbols,
  diffSymbols,
  type DetectedSymbol,
  type SymbolKind,
  type SymbolDiff,
} from './symbol-detector.js';

export {
  analyzeContractChanges,
  inferAffectedApps,
  type SymbolImpact,
  type ContractAnalysisResult,
  type ImpactSeverity,
} from './contract-analyzer.js';

export {
  detectCrossRepoCycles,
  computeCriticalPath,
  buildCrossRepoDependencyGraph,
  type CrossRepoDependencyEdge,
  type CrossRepoDependencyNode,
  type CycleDetectionResult,
  type CrossRepoDependencyGraph,
} from './cycle-detector.js';
