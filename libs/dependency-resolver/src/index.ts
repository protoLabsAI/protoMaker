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
  type DependencyResolutionResult,
  type AncestorContext,
  type BlockingInfo,
} from './resolver.js';

export {
  checkExternalDependencies,
  buildLocalForeignFeatureFetcher,
  type ForeignFeatureFetcher,
  type ForeignFeatureResult,
  type ExternalDepCheckResult,
  type ExternalDepsCheckResult,
} from './cross-repo-resolver.js';
