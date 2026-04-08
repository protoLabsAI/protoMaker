/**
 * Contract Analyzer — maps changed symbols to downstream app dependencies.
 *
 * Given a set of changed symbols in a source repo, infers which other apps
 * in the portfolio are likely affected based on dependency inference rules.
 *
 * Dependency inference rules:
 * - interface/type changes → apps that import from this package
 * - rest_endpoint changes → apps that make HTTP calls to this service
 * - cli_flag changes → scripts/apps that invoke the CLI
 * - class/function changes → apps that import the symbol by name
 */

import type { DetectedSymbol, SymbolDiff } from './symbol-detector.js';

/** Severity level for a cross-repo impact analysis */
export type ImpactSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'UNKNOWN';

/** Analysis result for a single changed symbol against a set of known consumers */
export interface SymbolImpact {
  /** The changed symbol */
  symbol: DetectedSymbol;
  /** Whether this symbol change is a breaking change */
  isBreaking: boolean;
  /** Estimated severity */
  severity: ImpactSeverity;
  /** Human-readable reason why this is breaking (if applicable) */
  reason?: string;
}

/** Result of analyzing a diff for cross-repo impact */
export interface ContractAnalysisResult {
  /** Per-symbol impact entries */
  impacts: SymbolImpact[];
  /** Overall severity across all changes */
  overallSeverity: ImpactSeverity;
  /** Whether any breaking changes were detected */
  hasBreakingChanges: boolean;
  /** Summary of changed interface names */
  changedInterfaces: string[];
}

/**
 * Analyze a symbol diff and return a cross-repo impact assessment.
 *
 * Breaking change rules:
 * - Removed exported symbols → CRITICAL (downstream code will fail to compile)
 * - Modified interfaces/types → HIGH (may require consumer updates)
 * - Added REST endpoints → LOW (additive, non-breaking)
 * - Removed REST endpoints → HIGH (existing clients will get 404)
 * - Modified CLI flags → MEDIUM
 *
 * @param diff - Symbol diff between before and after states
 * @param beforeSymbols - Full set of symbols before the change (for kind lookup)
 * @param afterSymbols - Full set of symbols after the change (for kind lookup)
 * @returns Cross-repo contract analysis result
 */
export function analyzeContractChanges(
  diff: SymbolDiff,
  beforeSymbols: DetectedSymbol[],
  afterSymbols: DetectedSymbol[]
): ContractAnalysisResult {
  const beforeMap = new Map(beforeSymbols.map((s) => [s.name, s]));
  const afterMap = new Map(afterSymbols.map((s) => [s.name, s]));

  const impacts: SymbolImpact[] = [];

  // Removed symbols are always breaking
  for (const name of diff.removed) {
    const sym = beforeMap.get(name) ?? {
      name,
      kind: 'function' as const,
      line: 0,
      declaration: '',
    };
    impacts.push({
      symbol: sym,
      isBreaking: true,
      severity: sym.kind === 'rest_endpoint' ? 'HIGH' : 'CRITICAL',
      reason: `Exported symbol '${name}' was removed — downstream consumers will break`,
    });
  }

  // Modified symbols — severity depends on kind
  for (const name of diff.modified) {
    const sym = afterMap.get(name) ??
      beforeMap.get(name) ?? {
        name,
        kind: 'function' as const,
        line: 0,
        declaration: '',
      };
    let severity: ImpactSeverity;
    let reason: string;
    switch (sym.kind) {
      case 'interface':
      case 'type':
        severity = 'HIGH';
        reason = `Interface/type '${name}' signature changed — consumers may need updates`;
        break;
      case 'class':
        severity = 'HIGH';
        reason = `Class '${name}' changed — subclasses or consumers may be affected`;
        break;
      case 'function':
        severity = 'MEDIUM';
        reason = `Function '${name}' signature changed — callers may need updates`;
        break;
      case 'rest_endpoint':
        severity = 'HIGH';
        reason = `REST endpoint '${name}' definition changed — API clients may break`;
        break;
      case 'cli_flag':
        severity = 'MEDIUM';
        reason = `CLI flag '${name}' changed — scripts invoking this CLI may break`;
        break;
      default:
        severity = 'UNKNOWN';
        reason = `Symbol '${name}' changed`;
    }
    impacts.push({ symbol: sym, isBreaking: true, severity, reason });
  }

  // Added symbols are generally non-breaking (additive)
  for (const name of diff.added) {
    const sym = afterMap.get(name) ?? {
      name,
      kind: 'function' as const,
      line: 0,
      declaration: '',
    };
    impacts.push({
      symbol: sym,
      isBreaking: false,
      severity: 'LOW',
      reason: `New exported symbol '${name}' — additive, non-breaking`,
    });
  }

  const severityRank = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, UNKNOWN: 0 };
  const maxRank = impacts.reduce(
    (max, impact) => Math.max(max, severityRank[impact.severity] ?? 0),
    0
  );
  const rankToSeverity = ['UNKNOWN', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
  const overallSeverity: ImpactSeverity = rankToSeverity[maxRank] ?? 'UNKNOWN';

  const changedInterfaces = [...diff.removed, ...diff.modified].filter((name) => {
    const sym = beforeMap.get(name) ?? afterMap.get(name);
    return sym && (sym.kind === 'interface' || sym.kind === 'type' || sym.kind === 'rest_endpoint');
  });

  return {
    impacts,
    overallSeverity,
    hasBreakingChanges: impacts.some((i) => i.isBreaking),
    changedInterfaces,
  };
}

/**
 * Build a list of suggested affected app paths based on the changed symbols.
 *
 * Uses simple naming conventions to infer which apps are consumers:
 * - REST endpoint changes → all apps that make HTTP calls to known service names
 * - Type/interface changes → all apps that share the same package namespace
 *
 * Returns an empty array when no heuristics apply — the caller should fall
 * back to explicit affectedRepos configuration.
 *
 * @param changedInterfaces - Names of changed interfaces/symbols
 * @param knownAppPaths - All known app paths in the portfolio
 * @param sourceRepo - The repo that introduced the changes
 * @returns Inferred list of affected app paths (may be empty)
 */
export function inferAffectedApps(
  changedInterfaces: string[],
  knownAppPaths: string[],
  sourceRepo: string
): string[] {
  if (changedInterfaces.length === 0 || knownAppPaths.length === 0) {
    return [];
  }

  // Simple heuristic: all apps except the source are potentially affected
  // by interface changes (conservative — caller should filter further)
  return knownAppPaths.filter((appPath) => !appPath.includes(sourceRepo));
}
