/**
 * Unit tests for the A2A agent-card skill allowlist.
 *
 * Guards Ava against answering skills she never declared. Context: on
 * protoWorkstacean#104 the upstream router silently defaulted to Ava for
 * pr_review (because no agent claimed it), and her LLM narrated an answer
 * despite having no such skill. The handler now rejects skillHints that
 * aren't in DECLARED_SKILL_IDS with a JSON-RPC -32601 error.
 */

import { describe, it, expect } from 'vitest';
import { DECLARED_SKILL_IDS } from '@/routes/a2a/index.js';

describe('A2A declared skill allowlist', () => {
  it('contains every skill Ava claims to execute', () => {
    // If you add a skill to DECLARED_SKILLS in routes/a2a/index.ts, add it
    // here too — this test locks the public surface so accidental removals
    // (or accidental additions without a handler branch) are caught.
    const expected = [
      'sitrep',
      'manage_feature',
      'auto_mode',
      'board_health',
      'bug_triage',
      'onboard_project',
      'provision_discord',
      'plan',
      'plan_resume',
    ];
    for (const id of expected) {
      expect(DECLARED_SKILL_IDS.has(id), `missing declared skill: ${id}`).toBe(true);
    }
    expect(DECLARED_SKILL_IDS.size).toBe(expected.length);
  });

  it('rejects skills Ava does not claim', () => {
    // pr_review is the concrete case that motivated the guard.
    expect(DECLARED_SKILL_IDS.has('pr_review')).toBe(false);
    // security_triage and chat belong to Quinn — Ava should not shadow them.
    expect(DECLARED_SKILL_IDS.has('security_triage')).toBe(false);
    expect(DECLARED_SKILL_IDS.has('chat')).toBe(false);
  });
});
