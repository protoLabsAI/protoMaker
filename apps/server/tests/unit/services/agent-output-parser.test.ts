import {
  extractNeedsHuman,
  extractPRReferences,
  extractCompletionSignal,
  parseAgentOutput,
  buildDoneReason,
} from '../../../src/services/agent-output-parser';

// Fixtures based on observed blocked features (2026-04-15, ava board)

const fixture_already_done_prs = `
## Summary
Implementation complete — verified by CI in PRs #3390-3392

### PR Status
- PR #3390: MERGED
- PR #3391: MERGED
- PR #3392: MERGED

### Changes Made
- Added new feature implementation
- All tests passing
`;

const fixture_done_in_other_repo = `
## Summary
Fix merged in protoWorkstacean PR #167

### PR Status
The fix was completed in the protoWorkstacean repository.
See PR #167 for details.

### Changes Made
- The required changes were already implemented in the upstream repository.
`;

const fixture_needs_human_status_checks = `
## Summary
Feature implementation complete. However, the following requires human action:

### Needs Human Input
Add required_status_checks rule to ruleset ID 14991173 once CI is configured.
This must be done by a repo admin with ruleset management permissions.

### Changes Made
- Branch protection rules updated programmatically where possible
- Manual ruleset configuration required for final step
`;

const fixture_hard_blocker_missing_cred = `
## Summary
Unable to proceed due to missing credentials.

### Risks/Blockers Encountered
HARD BLOCKER: GH_TOKEN missing workflow scope. There is no technical workaround.
The token must be regenerated with the 'workflows' scope by a repo admin.

### Changes Made
- Attempted to update branch protection rules
- Failed due to insufficient token permissions
`;

const fixture_needs_human_required_checks = `
## Summary
Implementation merged but requires post-merge configuration.

### Needs Human Input
Required status checks must be configured by a repo admin after merging.
Navigate to Settings → Branches → Branch protection rules and add the CI check.

### Changes Made
- Code changes merged successfully
- Post-merge configuration requires admin access
`;

const fixture_ready_to_pr = `
## Summary
Feature implementation complete. Ready for review.

### Changes Made
- Implemented core functionality
- Added tests
- Updated documentation

### PR Status
PR is ready to be opened.
`;

const fixture_empty_output = '';

const fixture_no_signals = `
## Summary
Work in progress. Some changes made but not yet complete.

### Changes Made
- Started implementation
- Partial tests written
`;

describe('agent-output-parser', () => {
  describe('extractNeedsHuman', () => {
    it('extracts non-empty Needs Human Input section', () => {
      const result = extractNeedsHuman(fixture_needs_human_status_checks);
      expect(result).not.toBeNull();
      expect(result).toContain('required_status_checks');
      expect(result).toContain('ruleset ID 14991173');
    });

    it('extracts Needs Human Input for required checks fixture', () => {
      const result = extractNeedsHuman(fixture_needs_human_required_checks);
      expect(result).not.toBeNull();
      expect(result).toContain('Required status checks');
      expect(result).toContain('repo admin');
    });

    it('returns null when no Needs Human Input section', () => {
      expect(extractNeedsHuman(fixture_already_done_prs)).toBeNull();
      expect(extractNeedsHuman(fixture_ready_to_pr)).toBeNull();
      expect(extractNeedsHuman(fixture_empty_output)).toBeNull();
    });

    it('returns null for empty Needs Human Input section', () => {
      const output = '### Needs Human Input\n\n';
      expect(extractNeedsHuman(output)).toBeNull();
    });
  });

  describe('extractPRReferences', () => {
    it('extracts multiple PR numbers from "PRs #3390-3392" style', () => {
      const refs = extractPRReferences(fixture_already_done_prs);
      expect(refs).toHaveLength(3);
      expect(refs.some((r) => r.prNumber === 3390)).toBe(true);
      expect(refs.some((r) => r.prNumber === 3391)).toBe(true);
      expect(refs.some((r) => r.prNumber === 3392)).toBe(true);
    });

    it('marks PRs as merged from MERGED keyword in PR Status section', () => {
      const refs = extractPRReferences(fixture_already_done_prs);
      const mergedRefs = refs.filter((r) => r.merged);
      console.log('All refs:', JSON.stringify(refs, null, 2));
      expect(mergedRefs.length).toBeGreaterThan(0);
    });

    it('extracts external repo PR reference', () => {
      const refs = extractPRReferences(fixture_done_in_other_repo);
      expect(refs.some((r) => r.prNumber === 167 && r.repo === 'protoWorkstacean')).toBe(true);
      expect(refs.some((r) => r.merged)).toBe(true);
    });

    it('returns empty array when no PR references', () => {
      expect(extractPRReferences(fixture_needs_human_status_checks)).toHaveLength(0);
      expect(extractPRReferences(fixture_empty_output)).toHaveLength(0);
      expect(extractPRReferences(fixture_no_signals)).toHaveLength(0);
    });
  });

  describe('extractCompletionSignal', () => {
    it('returns needs_human for "Needs Human Input" fixture (ruleset)', () => {
      expect(extractCompletionSignal(fixture_needs_human_status_checks)).toBe('needs_human');
    });

    it('returns needs_human for "Needs Human Input" fixture (required checks)', () => {
      expect(extractCompletionSignal(fixture_needs_human_required_checks)).toBe('needs_human');
    });

    it('returns already_done for merged PRs in same repo', () => {
      expect(extractCompletionSignal(fixture_already_done_prs)).toBe('already_done');
    });

    it('returns already_done for merged PR in external repo', () => {
      expect(extractCompletionSignal(fixture_done_in_other_repo)).toBe('already_done');
    });

    it('returns failed for hard blocker', () => {
      expect(extractCompletionSignal(fixture_hard_blocker_missing_cred)).toBe('failed');
    });

    it('returns ready_to_pr for normal completion', () => {
      expect(extractCompletionSignal(fixture_ready_to_pr)).toBe('ready_to_pr');
    });

    it('returns ready_to_pr for empty output', () => {
      expect(extractCompletionSignal(fixture_empty_output)).toBe('ready_to_pr');
    });

    it('returns ready_to_pr for output with no signals', () => {
      expect(extractCompletionSignal(fixture_no_signals)).toBe('ready_to_pr');
    });

    it('prioritizes needs_human over merged PRs when both present', () => {
      const mixed = `
### Needs Human Input
Please approve the deployment.

### PR Status
- PR #123: MERGED
`;
      expect(extractCompletionSignal(mixed)).toBe('needs_human');
    });
  });

  describe('parseAgentOutput', () => {
    it('returns full structured result for needs_human', () => {
      const result = parseAgentOutput(fixture_needs_human_status_checks);
      expect(result.signal).toBe('needs_human');
      expect(result.needsHumanAction).not.toBeNull();
      expect(result.prReferences).toHaveLength(0);
    });

    it('returns full structured result for already_done', () => {
      const result = parseAgentOutput(fixture_already_done_prs);
      expect(result.signal).toBe('already_done');
      expect(result.needsHumanAction).toBeNull();
      expect(result.prReferences.length).toBeGreaterThan(0);
    });

    it('returns full structured result for failed', () => {
      const result = parseAgentOutput(fixture_hard_blocker_missing_cred);
      expect(result.signal).toBe('failed');
      expect(result.needsHumanAction).toBeNull();
    });
  });

  describe('buildDoneReason', () => {
    it('builds "reconciled from PR #N" for same-repo merged PRs', () => {
      const refs = extractPRReferences(fixture_already_done_prs);
      const reason = buildDoneReason(refs);
      expect(reason).toContain('reconciled from PR');
      expect(reason).toContain('#3390');
    });

    it('builds "completed in <repo> #N" for external repo PRs', () => {
      const refs = extractPRReferences(fixture_done_in_other_repo);
      const reason = buildDoneReason(refs);
      expect(reason).toContain('completed in protoWorkstacean #167');
    });

    it('returns null for no merged references', () => {
      expect(buildDoneReason([])).toBeNull();
      expect(buildDoneReason([{ prNumber: 123 }])).toBeNull(); // not marked as merged
    });
  });
});
