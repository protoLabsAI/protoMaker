/**
 * Verification test for CI phase implementation
 * This is a temporary test to verify the feature works correctly.
 */

import { test, expect } from 'vitest';
import { setupCI } from '../src/phases/ci.js';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import os from 'node:os';

test('setupCI creates .github/workflows directory and writes workflow files', async () => {
  // Create a temporary directory for testing
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'protolab-ci-test-'));

  try {
    // Run setupCI with npm package manager
    const result = await setupCI({
      projectPath: tempDir,
      packageManager: 'npm',
    });

    // Verify result
    expect(result.success).toBe(true);
    expect(result.filesCreated).toContain('.github/workflows/');
    expect(result.filesCreated).toContain('.github/workflows/build.yml');
    expect(result.filesCreated).toContain('.github/workflows/test.yml');
    expect(result.filesCreated).toContain('.github/workflows/format-check.yml');
    expect(result.filesCreated).toContain('.github/workflows/security-audit.yml');

    // Verify directories exist
    const workflowsDir = path.join(tempDir, '.github', 'workflows');
    expect(await dirExists(workflowsDir)).toBe(true);

    // Verify workflow files exist and contain expected content
    const buildYmlPath = path.join(workflowsDir, 'build.yml');
    const buildYmlContent = await fs.readFile(buildYmlPath, 'utf-8');
    expect(buildYmlContent).toContain('name: Build');
    expect(buildYmlContent).toContain("cache: 'npm'");
    expect(buildYmlContent).toContain('npm install');
    expect(buildYmlContent).toContain('npm run build');
    expect(buildYmlContent).not.toContain('{{packageManager}}');
    expect(buildYmlContent).not.toContain('{{packageManagerSetup}}');

    const testYmlPath = path.join(workflowsDir, 'test.yml');
    const testYmlContent = await fs.readFile(testYmlPath, 'utf-8');
    expect(testYmlContent).toContain('name: Test');
    expect(testYmlContent).toContain('npm test');

    const formatCheckYmlPath = path.join(workflowsDir, 'format-check.yml');
    const formatCheckYmlContent = await fs.readFile(formatCheckYmlPath, 'utf-8');
    expect(formatCheckYmlContent).toContain('name: Format Check');
    expect(formatCheckYmlContent).toContain('npm run format:check');

    const securityAuditYmlPath = path.join(workflowsDir, 'security-audit.yml');
    const securityAuditYmlContent = await fs.readFile(securityAuditYmlPath, 'utf-8');
    expect(securityAuditYmlContent).toContain('name: Security Audit');
    expect(securityAuditYmlContent).toContain('npm audit');

    // Test idempotency - run again and verify files are skipped
    const result2 = await setupCI({
      projectPath: tempDir,
      packageManager: 'npm',
    });

    expect(result2.success).toBe(true);
    expect(
      result2.filesCreated.every((f) => f.includes('already exists') || f === '.github/workflows/')
    ).toBe(true);
  } finally {
    // Cleanup
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('setupCI handles pnpm package manager correctly', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'protolab-ci-pnpm-test-'));

  try {
    const result = await setupCI({
      projectPath: tempDir,
      packageManager: 'pnpm',
    });

    expect(result.success).toBe(true);

    const buildYmlPath = path.join(tempDir, '.github', 'workflows', 'build.yml');
    const buildYmlContent = await fs.readFile(buildYmlPath, 'utf-8');

    expect(buildYmlContent).toContain("cache: 'pnpm'");
    expect(buildYmlContent).toContain('pnpm/action-setup@v4');
    expect(buildYmlContent).toContain('pnpm install');
    expect(buildYmlContent).toContain('pnpm build');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('setupCI handles yarn package manager correctly', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'protolab-ci-yarn-test-'));

  try {
    const result = await setupCI({
      projectPath: tempDir,
      packageManager: 'yarn',
    });

    expect(result.success).toBe(true);

    const buildYmlPath = path.join(tempDir, '.github', 'workflows', 'build.yml');
    const buildYmlContent = await fs.readFile(buildYmlPath, 'utf-8');

    expect(buildYmlContent).toContain("cache: 'yarn'");
    expect(buildYmlContent).toContain('yarn install');
    expect(buildYmlContent).toContain('yarn build');
    expect(buildYmlContent).not.toContain('pnpm/action-setup');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('setupCI handles bun package manager correctly', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'protolab-ci-bun-test-'));

  try {
    const result = await setupCI({
      projectPath: tempDir,
      packageManager: 'bun',
    });

    expect(result.success).toBe(true);

    const buildYmlPath = path.join(tempDir, '.github', 'workflows', 'build.yml');
    const buildYmlContent = await fs.readFile(buildYmlPath, 'utf-8');

    expect(buildYmlContent).toContain("cache: 'bun'");
    expect(buildYmlContent).toContain('oven-sh/setup-bun@v2');
    expect(buildYmlContent).toContain('bun install');
    expect(buildYmlContent).toContain('bun run build');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

async function dirExists(dirPath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(dirPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}
