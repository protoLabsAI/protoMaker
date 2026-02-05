import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as secureFs from '@/lib/secure-fs.js';
import {
  CompletionVerifierService,
  getCompletionVerifierService,
  type CompletionCriterion,
} from '@/services/completion-verifier.js';

// Store the mock execAsync function that we'll control in tests
let mockExecAsyncImpl: (
  cmd: string,
  opts: Record<string, unknown>
) => Promise<{ stdout: string; stderr: string }>;

// Mock child_process with custom promisify support while preserving other exports
vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  const customPromisifySymbol = Symbol.for('nodejs.util.promisify.custom');

  // Create a mock exec function with custom promisify support
  const mockExec = Object.assign(
    vi.fn((cmd: string, options: Record<string, unknown>, callback?: Function) => {
      // This path is for callback-style usage
      if (callback) {
        mockExecAsyncImpl(cmd, options)
          .then((result) => callback(null, result.stdout, result.stderr))
          .catch((err) => callback(err, err.stdout || '', err.stderr || ''));
      }
      return {} as any;
    }),
    {
      // Custom promisify implementation - this is what promisify(exec) uses
      [customPromisifySymbol]: (cmd: string, options: Record<string, unknown> = {}) => {
        return mockExecAsyncImpl(cmd, options);
      },
    }
  );

  return {
    ...actual,
    exec: mockExec,
  };
});

// Mock secure-fs
vi.mock('@/lib/secure-fs.js');

// Helper to create a mock implementation for exec that works with promisify
function mockExecSuccess(stdout: string, stderr = '') {
  mockExecAsyncImpl = vi.fn().mockResolvedValue({ stdout, stderr });
}

function mockExecFailure(
  errorMessage: string,
  stdout = '',
  stderr = '',
  extraProps: Record<string, unknown> = {}
) {
  mockExecAsyncImpl = vi.fn().mockImplementation(() => {
    const error = Object.assign(new Error(errorMessage), { stdout, stderr, ...extraProps });
    return Promise.reject(error);
  });
}

describe('completion-verifier.ts', () => {
  let service: CompletionVerifierService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new CompletionVerifierService();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('CompletionVerifierService', () => {
    describe('tests_pass criterion', () => {
      it('should pass when test command succeeds', async () => {
        mockExecSuccess('All tests passed');

        const result = await service.checkCriterion(
          { type: 'tests_pass', command: 'npm test' },
          '/project'
        );

        expect(result.passed).toBe(true);
        expect(result.output).toBe('All tests passed');
        expect(result.error).toBeUndefined();
      });

      it('should fail when test command fails', async () => {
        mockExecFailure('Tests failed', 'Some tests failed', 'Error output');

        const result = await service.checkCriterion(
          { type: 'tests_pass', command: 'npm test' },
          '/project'
        );

        expect(result.passed).toBe(false);
        expect(result.error).toBe('Tests failed');
      });

      it('should handle timeout gracefully', async () => {
        mockExecFailure('Command timed out', 'Partial output', '', {
          killed: true,
          signal: 'SIGTERM',
        });

        const result = await service.checkCriterion(
          { type: 'tests_pass', command: 'npm test', timeout: 5000 },
          '/project'
        );

        expect(result.passed).toBe(false);
        expect(result.error).toContain('timed out');
      });
    });

    describe('build_succeeds criterion', () => {
      it('should pass when build command succeeds', async () => {
        mockExecSuccess('Build completed successfully');

        const result = await service.checkCriterion(
          { type: 'build_succeeds', command: 'npm run build' },
          '/project'
        );

        expect(result.passed).toBe(true);
        expect(result.output).toContain('Build completed');
      });

      it('should fail when build command fails', async () => {
        mockExecFailure('Build failed', '', 'Type error in main.ts');

        const result = await service.checkCriterion(
          { type: 'build_succeeds', command: 'npm run build' },
          '/project'
        );

        expect(result.passed).toBe(false);
      });
    });

    describe('lint_clean criterion', () => {
      it('should pass when lint returns no errors', async () => {
        mockExecSuccess('');

        const result = await service.checkCriterion(
          { type: 'lint_clean', command: 'npm run lint' },
          '/project'
        );

        expect(result.passed).toBe(true);
      });
    });

    describe('file_exists criterion', () => {
      it('should pass when file exists', async () => {
        vi.mocked(secureFs.access).mockResolvedValue(undefined);

        const result = await service.checkCriterion(
          { type: 'file_exists', path: 'src/index.ts' },
          '/project'
        );

        expect(result.passed).toBe(true);
        expect(result.output).toContain('File exists');
      });

      it('should fail when file does not exist', async () => {
        vi.mocked(secureFs.access).mockRejectedValue(new Error('ENOENT'));

        const result = await service.checkCriterion(
          { type: 'file_exists', path: 'src/missing.ts' },
          '/project'
        );

        expect(result.passed).toBe(false);
        expect(result.error).toContain('does not exist');
      });

      it('should handle absolute paths', async () => {
        vi.mocked(secureFs.access).mockResolvedValue(undefined);

        const result = await service.checkCriterion(
          { type: 'file_exists', path: '/absolute/path/file.ts' },
          '/project'
        );

        expect(result.passed).toBe(true);
        expect(secureFs.access).toHaveBeenCalledWith('/absolute/path/file.ts');
      });
    });

    describe('file_contains criterion', () => {
      it('should pass when file contains pattern', async () => {
        vi.mocked(secureFs.access).mockResolvedValue(undefined);
        vi.mocked(secureFs.readFile).mockResolvedValue('export function main() { return true; }');

        const result = await service.checkCriterion(
          { type: 'file_contains', path: 'src/index.ts', pattern: 'export function main' },
          '/project'
        );

        expect(result.passed).toBe(true);
        expect(result.output).toContain('Pattern');
        expect(result.output).toContain('found');
      });

      it('should fail when file does not contain pattern', async () => {
        vi.mocked(secureFs.access).mockResolvedValue(undefined);
        vi.mocked(secureFs.readFile).mockResolvedValue('const x = 1;');

        const result = await service.checkCriterion(
          { type: 'file_contains', path: 'src/index.ts', pattern: 'export function main' },
          '/project'
        );

        expect(result.passed).toBe(false);
        expect(result.error).toContain('not found');
      });

      it('should support regex patterns', async () => {
        vi.mocked(secureFs.access).mockResolvedValue(undefined);
        vi.mocked(secureFs.readFile).mockResolvedValue('const VERSION = "1.2.3";');

        const result = await service.checkCriterion(
          { type: 'file_contains', path: 'version.ts', pattern: 'VERSION\\s*=\\s*"\\d+\\.\\d+\\.\\d+"' },
          '/project'
        );

        expect(result.passed).toBe(true);
      });

      it('should fail when file does not exist', async () => {
        vi.mocked(secureFs.access).mockRejectedValue(new Error('ENOENT'));

        const result = await service.checkCriterion(
          { type: 'file_contains', path: 'missing.ts', pattern: 'anything' },
          '/project'
        );

        expect(result.passed).toBe(false);
        expect(result.error).toContain('Error checking file');
      });
    });

    describe('custom_script criterion', () => {
      it('should pass with default exit code 0', async () => {
        mockExecSuccess('Script output');

        const result = await service.checkCriterion(
          { type: 'custom_script', command: './check.sh' },
          '/project'
        );

        expect(result.passed).toBe(true);
      });

      it('should pass with custom success exit code', async () => {
        mockExecFailure('exited with code 42', 'Expected failure output', '', { code: 42 });

        const result = await service.checkCriterion(
          { type: 'custom_script', command: './check.sh', successExitCode: 42 },
          '/project'
        );

        expect(result.passed).toBe(true);
      });

      it('should fail with unexpected exit code', async () => {
        mockExecFailure('exited with code 1', '', 'Script error', { code: 1 });

        const result = await service.checkCriterion(
          { type: 'custom_script', command: './check.sh' },
          '/project'
        );

        expect(result.passed).toBe(false);
      });
    });

    describe('verifyCompletion', () => {
      it('should return allPassed true when all criteria pass', async () => {
        mockExecSuccess('Success');

        const criteria: CompletionCriterion[] = [
          { type: 'tests_pass', command: 'npm test' },
          { type: 'build_succeeds', command: 'npm run build' },
        ];

        const result = await service.verifyCompletion('/project', criteria);

        expect(result.allPassed).toBe(true);
        expect(result.results).toHaveLength(2);
        expect(result.results.every((r) => r.passed)).toBe(true);
      });

      it('should return allPassed false when any criterion fails', async () => {
        let callCount = 0;
        mockExecAsyncImpl = vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return Promise.resolve({ stdout: 'Tests passed', stderr: '' });
          } else {
            const error = Object.assign(new Error('Build failed'), {
              stdout: '',
              stderr: 'Build error',
            });
            return Promise.reject(error);
          }
        });

        const criteria: CompletionCriterion[] = [
          { type: 'tests_pass', command: 'npm test' },
          { type: 'build_succeeds', command: 'npm run build' },
        ];

        const result = await service.verifyCompletion('/project', criteria);

        expect(result.allPassed).toBe(false);
        expect(result.results[0].passed).toBe(true);
        expect(result.results[1].passed).toBe(false);
      });

      it('should stop on first failure when option is set', async () => {
        mockExecFailure('Failed', '', '');

        const criteria: CompletionCriterion[] = [
          { type: 'tests_pass', command: 'npm test' },
          { type: 'build_succeeds', command: 'npm run build' },
          { type: 'lint_clean', command: 'npm run lint' },
        ];

        const result = await service.verifyCompletion('/project', criteria, {
          stopOnFirstFailure: true,
        });

        expect(result.allPassed).toBe(false);
        expect(result.results).toHaveLength(1);
      });

      it('should use workDir option when provided', async () => {
        mockExecAsyncImpl = vi.fn().mockImplementation((_cmd: string, options: { cwd?: string }) => {
          expect(options.cwd).toBe('/custom/workdir');
          return Promise.resolve({ stdout: 'Success', stderr: '' });
        });

        const criteria: CompletionCriterion[] = [{ type: 'tests_pass', command: 'npm test' }];

        await service.verifyCompletion('/project', criteria, {
          workDir: '/custom/workdir',
        });

        expect(mockExecAsyncImpl).toHaveBeenCalled();
      });

      it('should include custom env variables', async () => {
        mockExecAsyncImpl = vi.fn().mockImplementation((_cmd: string, options: { env?: Record<string, string> }) => {
          expect(options.env?.CUSTOM_VAR).toBe('custom_value');
          return Promise.resolve({ stdout: 'Success', stderr: '' });
        });

        const criteria: CompletionCriterion[] = [{ type: 'tests_pass', command: 'npm test' }];

        await service.verifyCompletion('/project', criteria, {
          env: { CUSTOM_VAR: 'custom_value' },
        });

        expect(mockExecAsyncImpl).toHaveBeenCalled();
      });

      it('should generate a summary', async () => {
        mockExecSuccess('Success');

        const criteria: CompletionCriterion[] = [{ type: 'tests_pass', command: 'npm test' }];

        const result = await service.verifyCompletion('/project', criteria);

        expect(result.summary).toContain('PASSED');
        expect(result.summary).toContain('1/1');
        expect(result.timestamp).toBeDefined();
        expect(result.totalDuration).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('getCompletionVerifierService', () => {
    it('should return singleton instance', () => {
      const instance1 = getCompletionVerifierService();
      const instance2 = getCompletionVerifierService();

      expect(instance1).toBe(instance2);
    });
  });
});
