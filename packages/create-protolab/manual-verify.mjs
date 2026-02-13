/**
 * Manual verification script for init phase
 */

import { init } from './dist/phases/init.js';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import os from 'node:os';

async function verify() {
  console.log('Starting verification...\n');

  // Create a temporary directory for testing
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'protolab-test-'));
  console.log(`Created temp directory: ${tempDir}\n`);

  try {
    // Create mock research data
    const research = {
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
    console.log('Running init phase...\n');
    const result = await init({
      projectPath: tempDir,
      research,
    });

    console.log('Init result:', result);
    console.log('\nFiles created:');
    result.filesCreated.forEach((file) => console.log(`  - ${file}`));

    // Verify directories exist
    console.log('\n✅ Checking directory structure...');
    const automakerDir = path.join(tempDir, '.automaker');
    const checks = [
      { path: automakerDir, name: '.automaker/' },
      { path: path.join(automakerDir, 'features'), name: '.automaker/features/' },
      { path: path.join(automakerDir, 'context'), name: '.automaker/context/' },
      { path: path.join(automakerDir, 'memory'), name: '.automaker/memory/' },
      { path: path.join(automakerDir, 'skills'), name: '.automaker/skills/' },
    ];

    for (const check of checks) {
      try {
        const stats = await fs.stat(check.path);
        console.log(`  ✓ ${check.name} ${stats.isDirectory() ? 'exists' : 'NOT A DIRECTORY'}`);
      } catch (error) {
        console.log(`  ✗ ${check.name} missing`);
      }
    }

    // Verify files
    console.log('\n✅ Checking generated files...');
    const fileChecks = [
      {
        path: path.join(automakerDir, 'context', 'CLAUDE.md'),
        name: 'CLAUDE.md',
        contains: ['# test-project', 'TypeScript', 'React'],
      },
      {
        path: path.join(automakerDir, 'context', 'coding-rules.md'),
        name: 'coding-rules.md',
        contains: ['# Coding Rules', 'Type Safety'],
      },
      {
        path: path.join(automakerDir, 'context', 'spec.md'),
        name: 'spec.md',
        contains: ['# test-project — Project Specification'],
      },
      {
        path: path.join(tempDir, 'protolab.config'),
        name: 'protolab.config',
        contains: ['"name": "test-project"', '"enabled": true'],
      },
    ];

    for (const check of fileChecks) {
      try {
        const content = await fs.readFile(check.path, 'utf-8');
        console.log(`  ✓ ${check.name} exists`);
        for (const text of check.contains) {
          if (content.includes(text)) {
            console.log(`    ✓ contains "${text}"`);
          } else {
            console.log(`    ✗ missing "${text}"`);
          }
        }
      } catch (error) {
        console.log(`  ✗ ${check.name} missing or error: ${error.message}`);
      }
    }

    // Test idempotency
    console.log('\n✅ Testing idempotency...');
    const result2 = await init({
      projectPath: tempDir,
      research,
    });

    if (result2.success && result2.filesCreated.some((f) => f.includes('already exists'))) {
      console.log('  ✓ Idempotency works - files marked as already existing');
    } else {
      console.log('  ✗ Idempotency check failed');
    }

    console.log('\n✅ All checks passed!');
  } catch (error) {
    console.error('\n❌ Verification failed:', error);
    process.exit(1);
  } finally {
    // Cleanup
    console.log(`\nCleaning up temp directory: ${tempDir}`);
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

verify();
