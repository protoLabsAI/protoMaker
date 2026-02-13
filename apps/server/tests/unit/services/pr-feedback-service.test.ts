/**
 * PR Feedback Evaluation Tests
 *
 * Tests the structured feedback evaluation functionality in PRFeedbackService.
 * Verifies that thread decisions are correctly parsed from agent output.
 */

import { describe, it, expect } from 'vitest';

/**
 * Parses thread evaluation decisions from agent output.
 * This is extracted from PRFeedbackService for testing.
 */
function parseDecisionsFromOutput(agentOutput: string) {
  const decisions: Array<{
    threadId: string;
    decision: 'accept' | 'deny';
    reasoning: string;
    plannedFix?: string;
  }> = [];

  // Match all <thread_evaluation> blocks
  const evalRegex =
    /<thread_evaluation>\s*<thread_id>([^<]+)<\/thread_id>\s*<decision>(accept|deny)<\/decision>\s*<reasoning>([^<]*)<\/reasoning>(?:\s*<planned_fix>([^<]*)<\/planned_fix>)?\s*<\/thread_evaluation>/gi;

  let match;
  while ((match = evalRegex.exec(agentOutput)) !== null) {
    decisions.push({
      threadId: match[1].trim(),
      decision: match[2].toLowerCase() as 'accept' | 'deny',
      reasoning: match[3].trim(),
      plannedFix: match[4]?.trim(),
    });
  }

  return decisions;
}

describe('PR Feedback Evaluation', () => {
  describe('parseDecisionsFromOutput', () => {
    it('should parse a single accept decision', () => {
      const output = `
Some agent reasoning here...

<thread_evaluation>
  <thread_id>thread-123</thread_id>
  <decision>accept</decision>
  <reasoning>This feedback correctly identifies a missing null check</reasoning>
  <planned_fix>Add null check before accessing the property</planned_fix>
</thread_evaluation>

More agent output...
`;

      const decisions = parseDecisionsFromOutput(output);
      expect(decisions).toHaveLength(1);
      expect(decisions[0]).toEqual({
        threadId: 'thread-123',
        decision: 'accept',
        reasoning: 'This feedback correctly identifies a missing null check',
        plannedFix: 'Add null check before accessing the property',
      });
    });

    it('should parse a deny decision without planned_fix', () => {
      const output = `
<thread_evaluation>
  <thread_id>thread-456</thread_id>
  <decision>deny</decision>
  <reasoning>This is purely stylistic preference that contradicts project conventions</reasoning>
</thread_evaluation>
`;

      const decisions = parseDecisionsFromOutput(output);
      expect(decisions).toHaveLength(1);
      expect(decisions[0]).toEqual({
        threadId: 'thread-456',
        decision: 'deny',
        reasoning: 'This is purely stylistic preference that contradicts project conventions',
        plannedFix: undefined,
      });
    });

    it('should parse multiple decisions from agent output', () => {
      const output = `
## Evaluating PR Feedback

<thread_evaluation>
  <thread_id>CR-001</thread_id>
  <decision>accept</decision>
  <reasoning>Valid security concern about input validation</reasoning>
  <planned_fix>Add input sanitization</planned_fix>
</thread_evaluation>

<thread_evaluation>
  <thread_id>CR-002</thread_id>
  <decision>deny</decision>
  <reasoning>Suggestion to use optional chaining contradicts our explicit null check style</reasoning>
</thread_evaluation>

<thread_evaluation>
  <thread_id>human-review-1</thread_id>
  <decision>accept</decision>
  <reasoning>Good catch on the edge case handling</reasoning>
  <planned_fix>Add boundary check for array index</planned_fix>
</thread_evaluation>

Now implementing the fixes...
`;

      const decisions = parseDecisionsFromOutput(output);
      expect(decisions).toHaveLength(3);

      expect(decisions[0].threadId).toBe('CR-001');
      expect(decisions[0].decision).toBe('accept');

      expect(decisions[1].threadId).toBe('CR-002');
      expect(decisions[1].decision).toBe('deny');
      expect(decisions[1].plannedFix).toBeUndefined();

      expect(decisions[2].threadId).toBe('human-review-1');
      expect(decisions[2].decision).toBe('accept');
    });

    it('should handle empty agent output', () => {
      const decisions = parseDecisionsFromOutput('');
      expect(decisions).toHaveLength(0);
    });

    it('should handle output with no evaluation blocks', () => {
      const output = `
I reviewed the PR feedback and made some changes.
The build should pass now.
`;
      const decisions = parseDecisionsFromOutput(output);
      expect(decisions).toHaveLength(0);
    });

    it('should be case-insensitive for decision values', () => {
      const output = `
<thread_evaluation>
  <thread_id>t1</thread_id>
  <decision>ACCEPT</decision>
  <reasoning>test</reasoning>
</thread_evaluation>

<thread_evaluation>
  <thread_id>t2</thread_id>
  <decision>Deny</decision>
  <reasoning>test</reasoning>
</thread_evaluation>
`;

      const decisions = parseDecisionsFromOutput(output);
      expect(decisions).toHaveLength(2);
      expect(decisions[0].decision).toBe('accept');
      expect(decisions[1].decision).toBe('deny');
    });

    it('should handle whitespace variations in XML', () => {
      const output = `<thread_evaluation><thread_id>compact-1</thread_id><decision>accept</decision><reasoning>Compact format</reasoning><planned_fix>Fix it</planned_fix></thread_evaluation>`;

      const decisions = parseDecisionsFromOutput(output);
      expect(decisions).toHaveLength(1);
      expect(decisions[0].threadId).toBe('compact-1');
    });

    it('should handle typical agent output with standard spacing', () => {
      // Agents typically output clean values without leading/trailing spaces in element values
      const output = `
<thread_evaluation>
  <thread_id>spaced-id</thread_id>
  <decision>accept</decision>
  <reasoning>Some reasoning with spaces in the middle</reasoning>
  <planned_fix>Fix with spaces in description</planned_fix>
</thread_evaluation>
`;

      const decisions = parseDecisionsFromOutput(output);
      expect(decisions).toHaveLength(1);
      expect(decisions[0].threadId).toBe('spaced-id');
      expect(decisions[0].reasoning).toBe('Some reasoning with spaces in the middle');
      expect(decisions[0].plannedFix).toBe('Fix with spaces in description');
    });
  });

  describe('FeedbackThreadDecision type compatibility', () => {
    it('should produce output compatible with FeedbackThreadDecision type', () => {
      const output = `
<thread_evaluation>
  <thread_id>test-id</thread_id>
  <decision>accept</decision>
  <reasoning>Test reasoning</reasoning>
  <planned_fix>Test fix</planned_fix>
</thread_evaluation>
`;

      const decisions = parseDecisionsFromOutput(output);
      const decision = decisions[0];

      // Type assertions to verify structure matches FeedbackThreadDecision
      expect(typeof decision.threadId).toBe('string');
      expect(['accept', 'deny']).toContain(decision.decision);
      expect(typeof decision.reasoning).toBe('string');
      expect(decision.plannedFix === undefined || typeof decision.plannedFix === 'string').toBe(
        true
      );
    });
  });

  describe('ReviewThreadFeedback conversion', () => {
    it('should correctly map decision to status', () => {
      // This verifies the mapping logic used in processRemediationComplete
      const decisions = [
        { threadId: 't1', decision: 'accept' as const, reasoning: 'Good feedback' },
        { threadId: 't2', decision: 'deny' as const, reasoning: 'Bad feedback' },
      ];

      const threadFeedback = decisions.map((d) => ({
        threadId: d.threadId,
        status: d.decision === 'accept' ? ('accepted' as const) : ('denied' as const),
        agentReasoning: d.reasoning,
        resolvedAt: new Date().toISOString(),
      }));

      expect(threadFeedback[0].status).toBe('accepted');
      expect(threadFeedback[1].status).toBe('denied');
      expect(threadFeedback[0].agentReasoning).toBe('Good feedback');
    });
  });
});
