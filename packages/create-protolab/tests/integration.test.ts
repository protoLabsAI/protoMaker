import { describe, it, expect } from 'vitest';
import { analyzeGaps, generateProposal } from '../src/index.js';
import { getPackageManagerVars, interpolateTemplate } from '../src/templates.js';
import {
  validateProjectPath,
  hasPackageJson,
  detectMonorepo,
  checkEnvironment,
} from '../src/lib/validators.js';
import type { RepoResearchResult, GapAnalysisReport } from '../src/types.js';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createMockResearch(overrides: Partial<RepoResearchResult> = {}): RepoResearchResult {
  return {
    projectPath: '/tmp/test-project',
    projectName: 'test-project',
    git: { isRepo: true, defaultBranch: 'main', provider: 'github' },
    monorepo: {
      isMonorepo: false,
      packageManager: 'npm',
      packages: [],
    },
    frontend: {
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
    ...overrides,
  } as RepoResearchResult;
}

describe('Gap Analysis', () => {
  it('should return a report with score and gaps', () => {
    const research = createMockResearch();
    const report = analyzeGaps(research);

    expect(report).toBeDefined();
    expect(typeof report.overallScore).toBe('number');
    expect(report.overallScore).toBeGreaterThanOrEqual(0);
    expect(report.overallScore).toBeLessThanOrEqual(100);
    expect(Array.isArray(report.compliant)).toBe(true);
    expect(Array.isArray(report.gaps)).toBe(true);
  });

  it('should score higher when more items are compliant', () => {
    const bare = createMockResearch();
    const equipped = createMockResearch({
      automation: {
        hasAutomaker: true,
        hasBeads: true,
        hasDiscordIntegration: true,
        hasProtolabConfig: true,
        hasAnalytics: true,
        analyticsProvider: 'umami',
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
        workflows: ['build.yml', 'test.yml', 'format.yml', 'audit.yml'],
        hasBuildCheck: true,
        hasTestCheck: true,
        hasFormatCheck: true,
        hasSecurityAudit: true,
        hasCodeRabbit: true,
        hasBranchProtection: true,
      },
      frontend: {
        framework: 'react',
        hasShadcn: true,
        hasStorybook: true,
        hasTailwind: true,
        hasRadix: true,
      },
    });

    const bareReport = analyzeGaps(bare);
    const equippedReport = analyzeGaps(equipped);

    expect(equippedReport.overallScore).toBeGreaterThan(bareReport.overallScore);
    expect(equippedReport.compliant.length).toBeGreaterThan(bareReport.compliant.length);
  });

  it('should categorize gaps by severity', () => {
    const research = createMockResearch();
    const report = analyzeGaps(research);

    const severities = report.gaps.map((g) => g.severity);
    const validSeverities = ['critical', 'recommended', 'optional'];
    severities.forEach((s) => {
      expect(validSeverities).toContain(s);
    });
  });
});

describe('Alignment Proposal', () => {
  it('should generate milestones from gap analysis', () => {
    const research = createMockResearch();
    const gapReport = analyzeGaps(research);
    const proposal = generateProposal(gapReport);

    expect(proposal).toBeDefined();
    expect(Array.isArray(proposal.milestones)).toBe(true);
  });

  it('should produce empty milestones when fully compliant', () => {
    const fullyCompliant = {
      projectPath: '/tmp/test',
      analyzedAt: new Date().toISOString(),
      overallScore: 100,
      compliant: [{ category: 'automation' as const, title: 'everything', detail: 'all good' }],
      gaps: [],
      summary: { critical: 0, recommended: 0, optional: 0 },
    } satisfies GapAnalysisReport;
    const proposal = generateProposal(fullyCompliant);

    expect(proposal.milestones.length).toBe(0);
  });
});

describe('Template Interpolation', () => {
  it('should replace {{variable}} placeholders', () => {
    const template = 'Hello {{name}}, welcome to {{project}}!';
    const result = interpolateTemplate(template, { name: 'Alice', project: 'ProtoLab' });
    expect(result).toBe('Hello Alice, welcome to ProtoLab!');
  });

  it('should handle multiple occurrences of same variable', () => {
    const template = '{{x}} and {{x}} again';
    const result = interpolateTemplate(template, { x: 'foo' });
    expect(result).toBe('foo and foo again');
  });

  it('should leave unknown placeholders untouched', () => {
    const template = '{{known}} and {{unknown}}';
    const result = interpolateTemplate(template, { known: 'yes' });
    expect(result).toBe('yes and {{unknown}}');
  });
});

describe('Package Manager Variables', () => {
  it('should return npm vars by default', () => {
    const vars = getPackageManagerVars();
    expect(vars.packageManager).toBe('npm');
    expect(vars.installCommand).toBe('npm install');
    expect(vars.runCommand).toBe('npm run');
  });

  it('should return pnpm vars', () => {
    const vars = getPackageManagerVars('pnpm');
    expect(vars.packageManager).toBe('pnpm');
    expect(vars.installCommand).toBe('pnpm install');
  });

  it('should return yarn vars', () => {
    const vars = getPackageManagerVars('yarn');
    expect(vars.packageManager).toBe('yarn');
    expect(vars.installCommand).toBe('yarn install');
  });

  it('should return bun vars', () => {
    const vars = getPackageManagerVars('bun');
    expect(vars.packageManager).toBe('bun');
    expect(vars.installCommand).toBe('bun install');
  });
});

describe('Validators', () => {
  it('should validate existing project paths', () => {
    const fixturePath = path.join(__dirname, 'fixtures', 'simple-node');
    const result = validateProjectPath(fixturePath);
    expect(result.valid).toBe(true);
  });

  it('should reject non-existent paths', () => {
    const result = validateProjectPath('/tmp/does-not-exist-12345');
    expect(result.valid).toBe(false);
  });

  it('should detect package.json in fixtures', () => {
    const fixturePath = path.join(__dirname, 'fixtures', 'simple-node');
    expect(hasPackageJson(fixturePath)).toBe(true);
  });

  it('should detect monorepo structure', () => {
    const fixturePath = path.join(__dirname, 'fixtures', 'monorepo-pnpm');
    const mono = detectMonorepo(fixturePath);
    expect(mono.isMonorepo).toBe(true);
  });

  it('should detect non-monorepo', () => {
    const fixturePath = path.join(__dirname, 'fixtures', 'simple-node');
    const mono = detectMonorepo(fixturePath);
    expect(mono.isMonorepo).toBe(false);
  });

  it('should check environment tools', { timeout: 30000 }, () => {
    const checks = checkEnvironment();
    expect(Array.isArray(checks)).toBe(true);
    checks.forEach((check) => {
      expect(check).toHaveProperty('name');
      expect(check).toHaveProperty('available');
      expect(typeof check.available).toBe('boolean');
    });
  });
});

describe('Fixture Validation', () => {
  const fixtures = [
    { name: 'simple-node', expectedFiles: ['package.json', 'index.js'] },
    { name: 'monorepo-pnpm', expectedFiles: ['package.json', 'pnpm-workspace.yaml'] },
    {
      name: 'typescript-project',
      expectedFiles: ['package.json', 'tsconfig.json', 'src/index.ts'],
    },
    { name: 'nextjs-app', expectedFiles: ['package.json', 'next.config.js', 'app/page.tsx'] },
  ];

  fixtures.forEach(({ name, expectedFiles }) => {
    it(`should have all required files in ${name} fixture`, () => {
      const fs = require('fs');
      const fixturePath = path.join(__dirname, 'fixtures', name);
      expectedFiles.forEach((file) => {
        const filePath = path.join(fixturePath, file);
        expect(fs.existsSync(filePath)).toBe(true);
      });
    });
  });
});
