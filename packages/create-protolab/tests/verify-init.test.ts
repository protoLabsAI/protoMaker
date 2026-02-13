/**
 * Verification test for init phase implementation
 * This is a temporary test to verify the feature works correctly.
 */

import { test, expect } from 'vitest';
import { init } from './src/phases/init.js';
import type { RepoResearchResult } from '@automaker/types';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import os from 'node:os';

test('init phase scaffolds .automaker directory structure', async () => {
  // Create a temporary directory for testing
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'protolab-test-'));

  try {
    // Create mock research data
    const research: RepoResearchResult = {
      projectPath: tempDir,
      projectName: 'test-project',
      git: {
        isRepo: true,
        remoteUrl: 'https://github.com/test/test-project',
        defaultBranch: 'main',
        provider: 'github',
      },
      monorepo: {
        isMonorepo: true,
        tool: 'npm-workspaces',
        packageManager: 'npm',
        workspaceGlobs: ['packages/*', 'apps/*'],
        packages: [
          { name: '@test/lib', path: 'packages/lib', type: 'package' },
          { name: '@test/app', path: 'apps/app', type: 'app' },
        ],
      },
      frontend: {
        framework: 'react',
        reactVersion: '18.0.0',
        metaFramework: 'vite',
        metaFrameworkVersion: '5.0.0',
        hasShadcn: true,
        hasStorybook: false,
        hasTailwind: true,
        tailwindVersion: '3.0.0',
        hasRadix: true,
      },
      backend: {
        hasPayload: false,
        database: 'postgres',
        hasExpress: true,
        hasFastAPI: false,
      },
      agents: {
        hasMCPServers: false,
        mcpPackages: [],
        hasLangGraph: false,
        hasClaudeSDK: false,
        hasAgentFolder: false,
      },
      testing: {
        hasVitest: true,
        vitestVersion: '4.0.0',
        hasPlaywright: true,
        playwrightVersion: '1.40.0',
        hasJest: false,
        hasPytest: false,
        testDirs: ['tests', 'test'],
      },
      codeQuality: {
        hasESLint: true,
        eslintVersion: '9.0.0',
        hasPrettier: true,
        hasTypeScript: true,
        tsVersion: '5.7.0',
        tsStrict: true,
        hasCompositeConfig: true,
        hasHusky: true,
        hasLintStaged: true,
      },
      ci: {
        hasCI: true,
        provider: 'github-actions',
        workflows: ['.github/workflows/ci.yml'],
        hasBuildCheck: true,
        hasTestCheck: true,
        hasFormatCheck: true,
        hasSecurityAudit: false,
        hasCodeRabbit: false,
        hasBranchProtection: true,
      },
      automation: {
        hasAutomaker: false,
        hasBeads: false,
        hasDiscordIntegration: false,
        hasProtolabConfig: false,
        hasAnalytics: false,
      },
      python: {
        hasPythonServices: false,
        services: [],
        hasRuff: false,
        hasBlack: false,
        hasPytest: false,
        hasPoetry: false,
        hasPyproject: false,
      },
      structure: {
        topDirs: ['apps', 'packages', 'libs'],
        configFiles: ['package.json', 'tsconfig.json'],
        entryPoints: ['apps/app/src/main.tsx'],
      },
    };

    // Run init
    const result = await init({
      projectPath: tempDir,
      research,
    });

    // Verify result
    expect(result.success).toBe(true);
    expect(result.filesCreated).toContain('.automaker/');
    expect(result.filesCreated).toContain('.automaker/features/');
    expect(result.filesCreated).toContain('.automaker/context/');
    expect(result.filesCreated).toContain('.automaker/memory/');
    expect(result.filesCreated).toContain('.automaker/skills/');
    expect(result.filesCreated).toContain('.automaker/context/CLAUDE.md');
    expect(result.filesCreated).toContain('.automaker/context/coding-rules.md');
    expect(result.filesCreated).toContain('.automaker/context/spec.md');
    expect(result.filesCreated).toContain('protolab.config');

    // Verify directories exist
    const automakerDir = path.join(tempDir, '.automaker');
    expect(await dirExists(automakerDir)).toBe(true);
    expect(await dirExists(path.join(automakerDir, 'features'))).toBe(true);
    expect(await dirExists(path.join(automakerDir, 'context'))).toBe(true);
    expect(await dirExists(path.join(automakerDir, 'memory'))).toBe(true);
    expect(await dirExists(path.join(automakerDir, 'skills'))).toBe(true);

    // Verify files exist and contain expected content
    const claudeMdPath = path.join(automakerDir, 'context', 'CLAUDE.md');
    const claudeMdContent = await fs.readFile(claudeMdPath, 'utf-8');
    expect(claudeMdContent).toContain('# test-project');
    expect(claudeMdContent).toContain('TypeScript');
    expect(claudeMdContent).toContain('React');
    expect(claudeMdContent).toContain('Monorepo Structure');

    const codingRulesPath = path.join(automakerDir, 'context', 'coding-rules.md');
    const codingRulesContent = await fs.readFile(codingRulesPath, 'utf-8');
    expect(codingRulesContent).toContain('# Coding Rules');
    expect(codingRulesContent).toContain('Type Safety');
    expect(codingRulesContent).toContain('React Components');

    const specMdPath = path.join(automakerDir, 'context', 'spec.md');
    const specMdContent = await fs.readFile(specMdPath, 'utf-8');
    expect(specMdContent).toContain('# test-project — Project Specification');
    expect(specMdContent).toContain('Tech Stack');

    const configPath = path.join(tempDir, 'protolab.config');
    const configContent = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(configContent);
    expect(config.name).toBe('test-project');
    expect(config.version).toBe('0.1.0');
    expect(config.protolab.enabled).toBe(true);
    expect(config.techStack.language).toBe('typescript');
    expect(config.techStack.framework).toBe('vite');
    expect(config.techStack.packageManager).toBe('npm');
    expect(config.commands.build).toBe('npm run build');
    expect(config.commands.test).toBe('npm run test');
    expect(config.standard.skip).toEqual([]);

    // Test idempotency - run again and verify files are skipped
    const result2 = await init({
      projectPath: tempDir,
      research,
    });

    expect(result2.success).toBe(true);
    expect(result2.filesCreated.some((f) => f.includes('already exists'))).toBe(true);
  } finally {
    // Cleanup
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
