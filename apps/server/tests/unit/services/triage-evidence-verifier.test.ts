/**
 * Triage Evidence Verifier regression tests (#3972)
 *
 * Asserts that closure-equivalent classifications are refused when their cited
 * file paths do not exist — the exact failure mode from the #3970/#3971
 * incident, where a triage marked an issue `already_fixed` citing files
 * (`packages/epic-manager/src/base-resolver.ts`, ...) that never existed.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import {
  verifyTriageEvidence,
  isClosureEquivalent,
  CLOSURE_EQUIVALENT_CLASSIFICATIONS,
} from '../../../src/services/triage-evidence-verifier.js';

// The literal fabricated paths cited in the #3971 false `already_fixed` triage.
const FABRICATED_PATHS = [
  'packages/epic-manager/src/base-resolver.ts',
  'src/board/dep-gate.ts',
  'src/orchestration/dep-gate.ts',
  'src/board/reconciliation.ts',
];

// A path that genuinely exists at HEAD in this repo (committed, not just in the
// working tree — the verifier checks paths at the git ref).
const REAL_PATH = 'CLAUDE.md';

describe('triage-evidence-verifier (#3972)', () => {
  let repoRoot: string;

  beforeAll(() => {
    repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf-8',
    }).trim();
  });

  describe('isClosureEquivalent', () => {
    it('matches all known closure-equivalent classifications', () => {
      for (const c of CLOSURE_EQUIVALENT_CLASSIFICATIONS) {
        expect(isClosureEquivalent(c)).toBe(true);
      }
    });

    it('normalizes case and separators', () => {
      expect(isClosureEquivalent('already-fixed')).toBe(true);
      expect(isClosureEquivalent('Already Fixed')).toBe(true);
      expect(isClosureEquivalent('NOT_A_BUG')).toBe(true);
    });

    it('does not match investigative classifications', () => {
      expect(isClosureEquivalent('needs_investigation')).toBe(false);
      expect(isClosureEquivalent('confirmed')).toBe(false);
      expect(isClosureEquivalent(undefined)).toBe(false);
      expect(isClosureEquivalent('')).toBe(false);
    });
  });

  it('REFUSES already_fixed when the cited evidence does not exist (the #3971 regression)', async () => {
    const result = await verifyTriageEvidence({
      projectPath: repoRoot,
      classification: 'already_fixed',
      citedPaths: FABRICATED_PATHS,
    });

    expect(result.classificationAllowed).toBe(false);
    expect(result.isClosureEquivalent).toBe(true);
    expect(result.missingPaths).toEqual(expect.arrayContaining(FABRICATED_PATHS));
    expect(result.existingPaths).toEqual([]);
    expect(result.recommendation).toMatch(/REJECT/);
  });

  it('allows already_fixed when every cited path exists', async () => {
    const result = await verifyTriageEvidence({
      projectPath: repoRoot,
      classification: 'already_fixed',
      citedPaths: [REAL_PATH],
    });

    expect(result.classificationAllowed).toBe(true);
    expect(result.missingPaths).toEqual([]);
    expect(result.existingPaths).toEqual([REAL_PATH]);
  });

  it('refuses a closure-equivalent classification that cites no evidence at all', async () => {
    const result = await verifyTriageEvidence({
      projectPath: repoRoot,
      classification: 'duplicate',
      citedPaths: [],
    });

    expect(result.classificationAllowed).toBe(false);
    expect(result.recommendation).toMatch(/require verified/i);
  });

  it('mixed existing + missing paths still rejects a closure verdict', async () => {
    const result = await verifyTriageEvidence({
      projectPath: repoRoot,
      classification: 'already_fixed',
      citedPaths: [REAL_PATH, FABRICATED_PATHS[0]],
    });

    expect(result.classificationAllowed).toBe(false);
    expect(result.existingPaths).toEqual([REAL_PATH]);
    expect(result.missingPaths).toEqual([FABRICATED_PATHS[0]]);
  });

  it('allows a non-closure classification even with missing paths, but surfaces a warning', async () => {
    const result = await verifyTriageEvidence({
      projectPath: repoRoot,
      classification: 'needs_investigation',
      citedPaths: FABRICATED_PATHS,
    });

    expect(result.classificationAllowed).toBe(true);
    expect(result.isClosureEquivalent).toBe(false);
    expect(result.missingPaths.length).toBe(FABRICATED_PATHS.length);
    expect(result.recommendation).toMatch(/WARNING/);
  });

  it('defaults the ref to HEAD', async () => {
    const result = await verifyTriageEvidence({
      projectPath: repoRoot,
      citedPaths: [REAL_PATH],
    });
    expect(result.ref).toBe('HEAD');
    expect(result.refResolved).toBe(true);
  });

  it('refuses a closure verdict when the ref cannot be resolved (no false-missing)', async () => {
    const result = await verifyTriageEvidence({
      projectPath: repoRoot,
      classification: 'already_fixed',
      citedPaths: [REAL_PATH],
      ref: 'this-ref-does-not-exist-deadbeef',
    });

    expect(result.refResolved).toBe(false);
    expect(result.classificationAllowed).toBe(false);
    expect(result.recommendation).toMatch(/Could not resolve git ref/);
  });

  it('reports a non-closure check against an unresolvable ref without throwing', async () => {
    const result = await verifyTriageEvidence({
      projectPath: repoRoot,
      classification: 'needs_investigation',
      citedPaths: [REAL_PATH],
      ref: 'nope-not-a-real-ref',
    });

    expect(result.refResolved).toBe(false);
    // Non-closure classifications are not blocked, but the unresolved ref is surfaced.
    expect(result.classificationAllowed).toBe(true);
  });
});
