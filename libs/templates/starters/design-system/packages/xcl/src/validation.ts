/**
 * validation.ts
 *
 * Round-trip fidelity validation and token reduction estimation.
 *
 * Round-trip: ComponentDef → XCL → ComponentDef' → assert(def ≅ def')
 */

import { serialize } from './serializer.js';
import { deserialize } from './deserializer.js';
import type { ComponentDef, RoundTripResult, XCLMetrics } from './types.js';

// ============================================================================
// Deep equality helpers
// ============================================================================

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, b[i]));
  }

  if (typeof a === 'object' && typeof b === 'object') {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const aKeys = Object.keys(aObj).filter((k) => aObj[k] !== undefined);
    const bKeys = Object.keys(bObj).filter((k) => bObj[k] !== undefined);

    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((k) => deepEqual(aObj[k], bObj[k]));
  }

  return false;
}

function diffPath(
  a: unknown,
  b: unknown,
  path: string
): string[] {
  if (deepEqual(a, b)) return [];

  const diffs: string[] = [];

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      diffs.push(`${path}: array length ${a.length} vs ${b.length}`);
      return diffs;
    }
    for (let i = 0; i < a.length; i++) {
      diffs.push(...diffPath(a[i], b[i], `${path}[${i}]`));
    }
    return diffs;
  }

  if (
    typeof a === 'object' &&
    typeof b === 'object' &&
    a !== null &&
    b !== null
  ) {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const keys = new Set([...Object.keys(aObj), ...Object.keys(bObj)]);
    for (const k of Array.from(keys)) {
      const av = aObj[k];
      const bv = bObj[k];
      if (av !== undefined || bv !== undefined) {
        diffs.push(...diffPath(av, bv, `${path}.${k}`));
      }
    }
    return diffs;
  }

  diffs.push(`${path}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`);
  return diffs;
}

// ============================================================================
// Token estimation
// ============================================================================

/** Rough token count heuristic: ~4 chars per token (GPT-style BPE average). */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Validate that a ComponentDef survives a serialize → deserialize round-trip
 * with 100% fidelity.
 *
 * @param def   The ComponentDef to validate.
 * @returns     { fidelity: true } or { fidelity: false, diff: '...' }
 */
export function validateRoundTrip(def: ComponentDef): RoundTripResult {
  const xcl = serialize(def);
  let roundTripped: ComponentDef;

  try {
    const defs = deserialize(xcl);
    if (defs.length === 0) {
      return {
        fidelity: false,
        diff: 'Deserializer produced no components from the serialized XCL',
      };
    }
    roundTripped = defs[0]!;
  } catch (err) {
    return {
      fidelity: false,
      diff: `Deserialization error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const diffs = diffPath(def, roundTripped, 'ComponentDef');

  if (diffs.length === 0) {
    return { fidelity: true };
  }

  return {
    fidelity: false,
    diff: diffs.join('\n'),
  };
}

/**
 * Estimate the XCL token reduction for a given TSX source string.
 *
 * Converts TSX → ComponentDef via a minimal parse (heuristic) or you can
 * pass a pre-built ComponentDef to get an accurate XCL size.
 *
 * @param tsxSource   Original TSX source.
 * @param def         Pre-built ComponentDef (if available, more accurate).
 */
export function estimateReduction(
  tsxSource: string,
  def: ComponentDef
): XCLMetrics {
  const xcl = serialize(def);
  const tsxTokens = estimateTokens(tsxSource);
  const xclTokens = estimateTokens(xcl);
  const reductionPercent = Math.max(
    0,
    Math.round((1 - xclTokens / Math.max(tsxTokens, 1)) * 100)
  );
  return { tsxTokens, xclTokens, reductionPercent };
}
