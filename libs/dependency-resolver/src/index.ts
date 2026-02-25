/**
 * @protolabs-ai/dependency-resolver
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
  type DependencySatisfactionOptions,
  type AncestorContext,
  type BlockingInfo,
} from './resolver.js';
