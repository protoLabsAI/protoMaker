import { describe, it, expect } from 'vitest';
import { analyzeGaps } from './analyze';
import type { RepoResearchResult } from '../types';

describe('analyzeGaps', () => {
  it('should return a valid GapAnalysisReport', () => {
    const mockResearch: RepoResearchResult = {
      projectPath: '/test/project',
      projectName: 'test-project',
      git: {
        isRepo: true,
        provider: 'github',
      },
      monorepo: {
        isMonorepo: false,
        packageManager: 'npm',
        packages: [],
      },
      frontend: {
        framework: 'react',
        hasShadcn: false,
        hasStorybook: false,
        hasTailwind: false,
        hasRadix: false,
      },
      backend: {
        hasPayload: false,
        hasExpress: false,
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
        hasVitest: false,
        hasPlaywright: false,
        hasJest: false,
        hasPytest: false,
        testDirs: [],
      },
      codeQuality: {
        hasESLint: false,
        hasPrettier: false,
        hasTypeScript: false,
        tsStrict: false,
        hasCompositeConfig: false,
        hasHusky: false,
        hasLintStaged: false,
      },
      ci: {
        hasCI: false,
        workflows: [],
        hasBuildCheck: false,
        hasTestCheck: false,
        hasFormatCheck: false,
        hasSecurityAudit: false,
        hasCodeRabbit: false,
        hasBranchProtection: false,
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
        topDirs: [],
        configFiles: [],
        entryPoints: [],
      },
    };

    const report = analyzeGaps(mockResearch);

    expect(report).toBeDefined();
    expect(report.projectPath).toBe('/test/project');
    expect(report.overallScore).toBeGreaterThanOrEqual(0);
    expect(report.overallScore).toBeLessThanOrEqual(100);
    expect(report.gaps).toBeInstanceOf(Array);
    expect(report.compliant).toBeInstanceOf(Array);
    expect(report.summary).toBeDefined();
    expect(report.summary.critical).toBeGreaterThan(0); // Should have critical gaps for this minimal setup
  });

  it('should skip checks when skipChecks is provided', () => {
    const mockResearch: RepoResearchResult = {
      projectPath: '/test/project',
      projectName: 'test-project',
      git: {
        isRepo: true,
        provider: 'github',
      },
      monorepo: {
        isMonorepo: false,
        packageManager: 'npm',
        packages: [],
      },
      frontend: {
        framework: 'react',
        hasShadcn: false,
        hasStorybook: false,
        hasTailwind: false,
        hasRadix: false,
      },
      backend: {
        hasPayload: false,
        hasExpress: false,
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
        hasVitest: false,
        hasPlaywright: false,
        hasJest: false,
        hasPytest: false,
        testDirs: [],
      },
      codeQuality: {
        hasESLint: false,
        hasPrettier: false,
        hasTypeScript: false,
        tsStrict: false,
        hasCompositeConfig: false,
        hasHusky: false,
        hasLintStaged: false,
      },
      ci: {
        hasCI: false,
        workflows: [],
        hasBuildCheck: false,
        hasTestCheck: false,
        hasFormatCheck: false,
        hasSecurityAudit: false,
        hasCodeRabbit: false,
        hasBranchProtection: false,
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
        topDirs: [],
        configFiles: [],
        entryPoints: [],
      },
    };

    const reportWithoutSkip = analyzeGaps(mockResearch);
    const reportWithSkip = analyzeGaps(mockResearch, ['typescript-setup']);

    expect(reportWithSkip.gaps.length).toBeLessThan(reportWithoutSkip.gaps.length);
    expect(reportWithSkip.gaps.find((g) => g.id === 'typescript-setup')).toBeUndefined();
  });

  it('should return 100 score for fully compliant project', () => {
    const mockResearch: RepoResearchResult = {
      projectPath: '/test/project',
      projectName: 'test-project',
      git: {
        isRepo: true,
        provider: 'github',
      },
      monorepo: {
        isMonorepo: false,
        packageManager: 'pnpm',
        packages: [],
      },
      frontend: {
        framework: 'react',
        hasShadcn: true,
        hasStorybook: true,
        storybookVersion: '10.0.0',
        hasTailwind: true,
        tailwindVersion: '4.0.0',
        hasRadix: true,
      },
      backend: {
        hasPayload: false,
        hasExpress: false,
        hasFastAPI: false,
      },
      agents: {
        hasMCPServers: true,
        mcpPackages: ['mcp-server'],
        hasLangGraph: false,
        hasClaudeSDK: true,
        hasAgentFolder: true,
      },
      testing: {
        hasVitest: true,
        vitestVersion: '4.0.0',
        hasPlaywright: true,
        playwrightVersion: '1.40.0',
        hasJest: false,
        hasPytest: false,
        testDirs: ['tests'],
      },
      codeQuality: {
        hasESLint: true,
        eslintVersion: '9.0.0',
        hasPrettier: true,
        hasTypeScript: true,
        tsVersion: '5.5.0',
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
        hasSecurityAudit: true,
        hasCodeRabbit: true,
        hasBranchProtection: true,
      },
      automation: {
        hasAutomaker: true,
        hasBeads: true,
        hasDiscordIntegration: true,
        hasProtolabConfig: true,
        hasAnalytics: true,
        analyticsProvider: 'umami',
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
        topDirs: ['src', 'tests'],
        configFiles: ['tsconfig.json', 'package.json'],
        entryPoints: ['src/index.ts'],
      },
    };

    const report = analyzeGaps(mockResearch);

    expect(report.overallScore).toBe(100);
    expect(report.gaps.length).toBe(0);
    expect(report.compliant.length).toBeGreaterThan(0);
  });
});
