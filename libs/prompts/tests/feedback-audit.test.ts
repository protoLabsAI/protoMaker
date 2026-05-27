import { describe, it, expect } from 'vitest';
import {
  buildFeedbackAuditPrompt,
  parseFeedbackAuditVerdict,
} from '../src/feedback-audit-prompt.js';

describe('parseFeedbackAuditVerdict', () => {
  it('parses VALID with rationale', () => {
    const r = parseFeedbackAuditVerdict('VALID: the endpoint is missing input validation.');
    expect(r.verdict).toBe('VALID');
    expect(r.rationale).toBe('the endpoint is missing input validation.');
  });

  it('parses INVALID with rationale', () => {
    const r = parseFeedbackAuditVerdict(
      'INVALID: the shallow clone still includes the committed lockfile, so the premise is wrong.'
    );
    expect(r.verdict).toBe('INVALID');
    expect(r.rationale).toContain('committed lockfile');
  });

  it('parses UNCERTAIN with rationale', () => {
    const r = parseFeedbackAuditVerdict('UNCERTAIN: needs context outside the diff.');
    expect(r.verdict).toBe('UNCERTAIN');
  });

  it('is case-insensitive on the verdict keyword', () => {
    expect(parseFeedbackAuditVerdict('invalid: stale').verdict).toBe('INVALID');
    expect(parseFeedbackAuditVerdict('Valid - real bug').verdict).toBe('VALID');
  });

  it('defaults to UNCERTAIN (escalate) when the response is unparseable', () => {
    const r = parseFeedbackAuditVerdict('I think this is probably fine but not sure.');
    expect(r.verdict).toBe('UNCERTAIN');
    expect(r.rationale).toContain('could not be parsed');
  });

  it('does not confuse INVALID for VALID (prefix order)', () => {
    // "INVALID" starts with "I" not "V"; ensure VALID check does not match it.
    expect(parseFeedbackAuditVerdict('INVALID: x').verdict).toBe('INVALID');
  });
});

describe('buildFeedbackAuditPrompt', () => {
  it('includes feedback, trajectory, diff, and CI status', () => {
    const prompt = buildFeedbackAuditPrompt({
      reviewFeedback: 'frozen-lockfile deadlock',
      reviewers: ['protoquinn[bot]'],
      featureTitle: 'Install rh',
      featureDescription: 'Add the rh CLI to the image',
      acceptanceCriteria: ['rh --version works'],
      trajectorySummaries: ['Plan: clone + build\nExecution: built dist/index.js'],
      prDiff: 'diff --git a/Dockerfile b/Dockerfile',
      ciStatus: 'All 3 checks non-failing.',
    });
    expect(prompt).toContain('frozen-lockfile deadlock');
    expect(prompt).toContain('protoquinn[bot]');
    expect(prompt).toContain('rh --version works');
    expect(prompt).toContain('built dist/index.js');
    expect(prompt).toContain('All 3 checks non-failing.');
    expect(prompt).toContain('diff --git a/Dockerfile');
  });

  it('handles missing trajectory and criteria gracefully', () => {
    const prompt = buildFeedbackAuditPrompt({
      reviewFeedback: 'x',
      reviewers: [],
      featureTitle: 'T',
      featureDescription: 'D',
      prDiff: 'd',
    });
    expect(prompt).toContain('No recorded trajectory');
    expect(prompt).toContain('No explicit criteria');
  });
});
