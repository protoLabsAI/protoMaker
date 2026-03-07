/**
 * Gap Analysis Service
 *
 * Compares a RepoResearchResult against the ProtoLabs gold standard.
 * Produces a structured report of gaps, compliance, and an alignment score.
 */

import { createLogger } from '@protolabsai/utils';
import type {
  RepoResearchResult,
  GapAnalysisReport,
  GapItem,
  ComplianceItem,
} from '@protolabsai/types';

const logger = createLogger('gap-analysis');

/** Weight for score calculation: critical=3, required=2 */
const SEVERITY_WEIGHTS = { critical: 3, required: 2 } as const;

/**
 * Run gap analysis against the ProtoLabs gold standard.
 * Returns a structured report with gaps, compliant items, and an overall score.
 */
export function analyzeGaps(
  research: RepoResearchResult,
  skipChecks: string[] = []
): GapAnalysisReport {
  logger.info('Running gap analysis', { projectPath: research.projectPath });

  const gaps: GapItem[] = [];
  const compliant: ComplianceItem[] = [];

  const skip = new Set(skipChecks.map((s) => s.toLowerCase()));

  // Helper to add a gap if not skipped
  function addGap(item: GapItem) {
    if (!skip.has(item.id)) gaps.push(item);
  }

  function addCompliant(item: ComplianceItem) {
    compliant.push(item);
  }

  // ===================== CRITICAL GAPS =====================

  // --- Automaker ---
  if (!research.automation.hasAutomaker) {
    addGap({
      id: 'automaker-init',
      category: 'automation',
      severity: 'critical',
      title: 'Missing .automaker/ directory',
      current: 'No Automaker initialization',
      target: '.automaker/ with context files, spec, and settings',
      effort: 'small',
      featureDescription:
        'Initialize the .automaker/ directory structure with context files (CLAUDE.md, coding-rules.md), spec.md with project overview, and default settings. This is required for AI agents to work on the project.',
    });
  } else {
    addCompliant({
      category: 'automation',
      title: 'Automaker initialized',
      detail: '.automaker/ directory exists',
    });
  }

  // --- TypeScript ---
  if (!research.codeQuality.hasTypeScript) {
    addGap({
      id: 'typescript-setup',
      category: 'quality',
      severity: 'critical',
      title: 'Missing TypeScript',
      current: 'No TypeScript configured',
      target: 'TypeScript 5.5+ with strict mode and composite configs',
      effort: 'large',
      featureDescription:
        'Add TypeScript to the project with strict mode enabled. Create tsconfig.json at root with composite: true and references. Create per-package tsconfig.json files. Install typescript@latest as devDependency.',
    });
  } else if (!research.codeQuality.tsStrict) {
    addGap({
      id: 'typescript-strict',
      category: 'quality',
      severity: 'critical',
      title: 'TypeScript strict mode not enabled',
      current: `TypeScript ${research.codeQuality.tsVersion || 'installed'}, strict: false`,
      target: 'TypeScript strict mode enabled',
      effort: 'medium',
      featureDescription:
        'Enable strict mode in tsconfig.json by setting "strict": true in compilerOptions. Fix any resulting type errors. This catches bugs at compile time and improves code quality.',
    });
  } else {
    addCompliant({
      category: 'quality',
      title: 'TypeScript strict mode',
      detail: `TypeScript ${research.codeQuality.tsVersion || ''} with strict: true`,
    });
  }

  if (
    research.codeQuality.hasTypeScript &&
    !research.codeQuality.hasCompositeConfig &&
    research.monorepo.isMonorepo
  ) {
    addGap({
      id: 'typescript-composite',
      category: 'quality',
      severity: 'critical',
      title: 'Missing composite TypeScript config',
      current: 'No composite/project references in tsconfig.json',
      target: 'Composite tsconfig per package with project references',
      effort: 'medium',
      featureDescription:
        'Set up composite TypeScript configuration. Add "composite": true to root tsconfig.json and add "references" array pointing to each package. Create per-package tsconfig.json files. This enables incremental builds and proper cross-package type checking.',
    });
  }

  // --- Testing Framework ---
  if (!research.testing.hasVitest && !research.testing.hasJest) {
    addGap({
      id: 'testing-framework',
      category: 'testing',
      severity: 'critical',
      title: 'No testing framework',
      current: 'No test framework detected',
      target: 'Vitest for unit/integration tests',
      effort: 'medium',
      featureDescription:
        'Set up Vitest as the testing framework. Install vitest and create vitest.config.ts with TypeScript support. Add test scripts to package.json. Create initial test files with example tests to establish patterns.',
    });
  } else if (research.testing.hasJest && !research.testing.hasVitest) {
    addGap({
      id: 'testing-migrate-jest',
      category: 'testing',
      severity: 'critical',
      title: 'Using Jest instead of Vitest',
      current: 'Jest configured',
      target: 'Vitest (faster, native ESM/TS support)',
      effort: 'medium',
      featureDescription:
        'Migrate from Jest to Vitest. Install vitest, update test config, migrate test files (most Jest APIs are compatible). Vitest provides faster execution, native TypeScript support, and ESM compatibility.',
    });
  } else {
    addCompliant({
      category: 'testing',
      title: 'Vitest configured',
      detail: `Vitest ${research.testing.vitestVersion || ''} detected`,
    });
  }

  // --- CI Pipeline ---
  if (!research.ci.hasCI) {
    addGap({
      id: 'ci-pipeline',
      category: 'ci',
      severity: 'critical',
      title: 'No CI/CD pipeline',
      current: 'No CI configuration detected',
      target: 'GitHub Actions with build, test, format, and audit checks',
      effort: 'medium',
      featureDescription:
        'Set up GitHub Actions CI/CD pipeline. Create workflow files for: build (compile TypeScript), test (run Vitest), format check (Prettier), and security audit. Each should run on pull requests and pushes to main.',
    });
  } else {
    if (!research.ci.hasBuildCheck) {
      addGap({
        id: 'ci-build-check',
        category: 'ci',
        severity: 'critical',
        title: 'CI missing build check',
        current: 'No build step in CI',
        target: 'CI build check that compiles TypeScript',
        effort: 'small',
        featureDescription:
          'Add a build check to the CI pipeline that compiles TypeScript and verifies the project builds without errors.',
      });
    }
    if (!research.ci.hasTestCheck) {
      addGap({
        id: 'ci-test-check',
        category: 'ci',
        severity: 'critical',
        title: 'CI missing test check',
        current: 'No test step in CI',
        target: 'CI test check that runs Vitest',
        effort: 'small',
        featureDescription:
          'Add a test check to the CI pipeline that runs the Vitest test suite and reports results.',
      });
    }
    if (!research.ci.hasFormatCheck) {
      addGap({
        id: 'ci-format-check',
        category: 'ci',
        severity: 'critical',
        title: 'CI missing format check',
        current: 'No format check in CI',
        target: 'Prettier format check in CI',
        effort: 'small',
        featureDescription:
          'Add a formatting check to the CI pipeline using Prettier --check to ensure consistent code style.',
      });
    }
    if (!research.ci.hasSecurityAudit) {
      addGap({
        id: 'ci-security-audit',
        category: 'ci',
        severity: 'critical',
        title: 'CI missing security audit',
        current: 'No security audit in CI',
        target: 'npm/pnpm audit step in CI',
        effort: 'small',
        featureDescription:
          'Add a security audit step to CI that runs package manager audit to detect vulnerable dependencies.',
      });
    }
    if (
      research.ci.hasBuildCheck &&
      research.ci.hasTestCheck &&
      research.ci.hasFormatCheck &&
      research.ci.hasSecurityAudit
    ) {
      addCompliant({
        category: 'ci',
        title: 'CI pipeline complete',
        detail: 'Build, test, format, and audit checks present',
      });
    }
  }

  // --- Branch Protection ---
  if (research.git.provider === 'github' && !research.ci.hasBranchProtection) {
    addGap({
      id: 'branch-protection',
      category: 'ci',
      severity: 'critical',
      title: 'No branch protection',
      current: 'Main branch unprotected',
      target: 'Squash-only merges, required status checks, no bypass, thread resolution required',
      effort: 'small',
      featureDescription:
        'Configure branch protection for the main branch. Require pull requests with squash-only merges, required status checks (build, test, format, audit), required_review_thread_resolution (CodeRabbit threads must be resolved before merge), and dismiss stale reviews. Use gh CLI or rulesets API to apply settings.',
    });
  } else if (research.ci.hasBranchProtection) {
    addCompliant({
      category: 'ci',
      title: 'Branch protection enabled',
      detail: 'Main branch has protection rules',
    });
  }

  // --- Package Manager ---
  if (research.monorepo.packageManager !== 'pnpm') {
    addGap({
      id: 'package-manager',
      category: 'monorepo',
      severity: 'critical',
      title: `Using ${research.monorepo.packageManager} instead of pnpm`,
      current: `Package manager: ${research.monorepo.packageManager}`,
      target: 'pnpm (strict dependency resolution, workspace protocol)',
      effort: 'medium',
      featureDescription: `Migrate from ${research.monorepo.packageManager} to pnpm. Install pnpm globally, create pnpm-workspace.yaml if monorepo, run pnpm import to convert lockfile, update CI scripts, and remove old lockfile. pnpm provides stricter dependency resolution and better disk efficiency.`,
    });
  } else {
    addCompliant({ category: 'monorepo', title: 'pnpm', detail: 'Using pnpm as package manager' });
  }

  // ===================== REQUIRED GAPS =====================

  // --- Turborepo ---
  if (research.monorepo.isMonorepo && research.monorepo.tool !== 'turbo') {
    addGap({
      id: 'turborepo',
      category: 'monorepo',
      severity: 'required',
      title: 'Missing Turborepo',
      current: research.monorepo.tool
        ? `Using ${research.monorepo.tool}`
        : 'No monorepo orchestration',
      target: 'Turborepo for cached, parallel builds',
      effort: 'medium',
      featureDescription:
        'Add Turborepo for monorepo task orchestration. Install turbo, create turbo.json with pipeline configuration for build, test, lint tasks. Configure caching and task dependencies for parallel execution.',
    });
  } else if (research.monorepo.tool === 'turbo') {
    addCompliant({
      category: 'monorepo',
      title: 'Turborepo',
      detail: 'Turbo configured for task orchestration',
    });
  }

  // --- Prettier ---
  if (!research.codeQuality.hasPrettier) {
    addGap({
      id: 'prettier',
      category: 'quality',
      severity: 'required',
      title: 'Missing Prettier',
      current: 'No code formatter configured',
      target: 'Prettier with consistent configuration',
      effort: 'small',
      featureDescription:
        'Add Prettier for consistent code formatting. Install prettier, create .prettierrc with standard config, add format and format:check scripts. Configure to work with ESLint if present.',
    });
  } else {
    addCompliant({ category: 'quality', title: 'Prettier', detail: 'Code formatting configured' });
  }

  // --- Storybook ---
  if (research.frontend.framework === 'react' && !research.frontend.hasStorybook) {
    addGap({
      id: 'storybook',
      category: 'frontend',
      severity: 'required',
      title: 'Missing Storybook',
      current: 'No component development environment',
      target: 'Storybook 10+ with nextjs-vite adapter',
      effort: 'medium',
      featureDescription:
        'Set up Storybook for component development and documentation. Install Storybook with the nextjs-vite adapter, configure for React 19, add initial stories for key components. Use subpath aliases for clean imports.',
    });
  } else if (research.frontend.hasStorybook) {
    addCompliant({
      category: 'frontend',
      title: 'Storybook',
      detail: `Storybook ${research.frontend.storybookVersion || ''} configured`,
    });
  }

  // --- shadcn/ui ---
  if (research.frontend.framework === 'react' && !research.frontend.hasShadcn) {
    addGap({
      id: 'shadcn',
      category: 'frontend',
      severity: 'required',
      title: 'Missing shadcn/ui',
      current: 'No component library',
      target: 'shadcn/ui with Radix primitives',
      effort: 'medium',
      featureDescription:
        'Initialize shadcn/ui component library. Run npx shadcn-ui@latest init, configure components.json, add base components (Button, Card, Dialog, etc.). Requires Tailwind CSS.',
    });
  } else if (research.frontend.hasShadcn) {
    addCompliant({
      category: 'frontend',
      title: 'shadcn/ui',
      detail: 'Component library configured',
    });
  }

  // --- Tailwind CSS ---
  if (research.frontend.framework === 'react' && !research.frontend.hasTailwind) {
    addGap({
      id: 'tailwind',
      category: 'frontend',
      severity: 'required',
      title: 'Missing Tailwind CSS',
      current: 'No utility-first CSS framework',
      target: 'Tailwind CSS 4',
      effort: 'medium',
      featureDescription:
        'Add Tailwind CSS 4 for utility-first styling. Install tailwindcss, create tailwind.config.ts, configure PostCSS, add base styles. Tailwind 4 provides significant performance improvements.',
    });
  } else if (research.frontend.hasTailwind) {
    addCompliant({
      category: 'frontend',
      title: 'Tailwind CSS',
      detail: `Tailwind ${research.frontend.tailwindVersion || ''} configured`,
    });
  }

  // --- Playwright ---
  if (!research.testing.hasPlaywright) {
    addGap({
      id: 'playwright',
      category: 'testing',
      severity: 'required',
      title: 'Missing Playwright E2E tests',
      current: 'No E2E testing framework',
      target: 'Playwright for end-to-end testing',
      effort: 'medium',
      featureDescription:
        'Set up Playwright for E2E testing. Install @playwright/test, create playwright.config.ts, add initial E2E tests for critical user flows. Configure for headless CI and headed local development.',
    });
  } else {
    addCompliant({
      category: 'testing',
      title: 'Playwright',
      detail: `Playwright ${research.testing.playwrightVersion || ''} for E2E tests`,
    });
  }

  // --- ESLint v9 ---
  if (!research.codeQuality.hasESLint) {
    addGap({
      id: 'eslint',
      category: 'quality',
      severity: 'required',
      title: 'Missing ESLint',
      current: 'No linter configured',
      target: 'ESLint 9 with flat config and typescript-eslint strict',
      effort: 'medium',
      featureDescription:
        'Add ESLint 9 with flat config format. Install eslint and typescript-eslint, create eslint.config.js with strict TypeScript rules. Configure for the project tech stack.',
    });
  } else {
    const majorVersion = research.codeQuality.eslintVersion
      ? parseInt(research.codeQuality.eslintVersion.split('.')[0], 10)
      : 0;
    if (majorVersion < 9) {
      addGap({
        id: 'eslint-v9',
        category: 'quality',
        severity: 'required',
        title: 'ESLint needs upgrade to v9 flat config',
        current: `ESLint ${research.codeQuality.eslintVersion} (legacy config)`,
        target: 'ESLint 9 with flat config',
        effort: 'medium',
        featureDescription:
          'Upgrade ESLint from legacy .eslintrc to v9 flat config format. Install eslint@latest, migrate rules to eslint.config.js, update typescript-eslint to latest. The flat config format is simpler and more performant.',
      });
    } else {
      addCompliant({ category: 'quality', title: 'ESLint 9', detail: 'ESLint v9 flat config' });
    }
  }

  // --- Pre-commit Hooks ---
  if (!research.codeQuality.hasHusky || !research.codeQuality.hasLintStaged) {
    addGap({
      id: 'pre-commit-hooks',
      category: 'quality',
      severity: 'required',
      title: 'Missing pre-commit hooks',
      current: research.codeQuality.hasHusky
        ? 'Husky installed but no lint-staged'
        : 'No pre-commit hooks',
      target: 'Husky + lint-staged for pre-commit formatting and linting',
      effort: 'small',
      featureDescription:
        'Set up Husky pre-commit hooks with lint-staged. Install husky and lint-staged, configure to run Prettier and ESLint on staged files before commit. This catches issues before they reach CI.',
    });
  } else {
    addCompliant({
      category: 'quality',
      title: 'Pre-commit hooks',
      detail: 'Husky + lint-staged configured',
    });
  }

  // --- Discord ---
  if (!research.automation.hasDiscordIntegration) {
    addGap({
      id: 'discord',
      category: 'automation',
      severity: 'required',
      title: 'No Discord project channels',
      current: 'No Discord integration',
      target: 'Discord category with #general, #updates, #dev channels',
      effort: 'small',
      featureDescription:
        'Create a Discord category for the project with #general, #updates, and #dev channels. Set up a webhook on #updates for automated notifications. Store channel IDs in protolab.config.',
    });
  } else {
    addCompliant({
      category: 'automation',
      title: 'Discord integration',
      detail: 'Project channels configured',
    });
  }

  // --- CodeRabbit ---
  if (!research.ci.hasCodeRabbit) {
    addGap({
      id: 'coderabbit',
      category: 'ci',
      severity: 'required',
      title: 'Missing CodeRabbit AI review',
      current: 'No AI code review',
      target: 'CodeRabbit as required CI check',
      effort: 'small',
      featureDescription:
        'Set up CodeRabbit for AI-powered code review. Create .coderabbit.yaml configuration file with strict profile (NOT chill). Configure as a required check in branch protection so PRs cannot merge without review.',
    });
  } else {
    addCompliant({ category: 'ci', title: 'CodeRabbit', detail: 'AI code review configured' });
  }

  // --- Analytics ---
  if (!research.automation.hasAnalytics) {
    addGap({
      id: 'analytics',
      category: 'automation',
      severity: 'required',
      title: 'No privacy-friendly analytics',
      current: 'No analytics tracking',
      target: 'Umami analytics (self-hosted or cloud)',
      effort: 'small',
      featureDescription:
        'Set up Umami analytics for privacy-friendly traffic tracking. Create an Analytics component that loads the Umami script via environment variables (NEXT_PUBLIC_UMAMI_URL, NEXT_PUBLIC_UMAMI_WEBSITE_ID). Add to root layout. Register website in Umami dashboard at umami.proto-labs.ai.',
    });
  } else {
    addCompliant({
      category: 'automation',
      title: 'Analytics',
      detail: `${research.automation.analyticsProvider || 'Unknown'} analytics configured`,
    });
  }

  // ===================== REQUIRED GAPS (continued) =====================

  // --- Payload CMS ---
  if (
    research.backend.database &&
    research.backend.database !== 'none' &&
    !research.backend.hasPayload
  ) {
    addGap({
      id: 'payload',
      category: 'backend',
      severity: 'required',
      title: 'No CMS for database-backed project',
      current: `Database: ${research.backend.database}, no CMS`,
      target: 'Payload CMS 3.x for content management',
      effort: 'large',
      featureDescription:
        'Add Payload CMS 3.x for headless content management. Install payload and configure with the existing database. Create initial collections and admin panel. Payload provides a typed API and admin UI.',
    });
  }

  // --- MCP Servers ---
  if (!research.agents.hasMCPServers) {
    addGap({
      id: 'mcp-servers',
      category: 'agents',
      severity: 'required',
      title: 'No MCP servers',
      current: 'No Model Context Protocol servers',
      target: 'Domain-specific MCP server in packages/',
      effort: 'large',
      featureDescription:
        'Create a domain-specific MCP server package. Set up @modelcontextprotocol/sdk, define tools for project-specific operations, configure stdio transport. Place in packages/mcp-server/.',
    });
  } else {
    addCompliant({
      category: 'agents',
      title: 'MCP servers',
      detail: `${research.agents.mcpPackages.length} MCP packages found`,
    });
  }

  // --- Agent SDK ---
  if (!research.agents.hasClaudeSDK && !research.agents.hasLangGraph) {
    addGap({
      id: 'agent-sdk',
      category: 'agents',
      severity: 'required',
      title: 'No agent framework',
      current: 'No Claude SDK or LangGraph',
      target: 'Claude Agent SDK or LangGraph integration',
      effort: 'large',
      featureDescription:
        'Add AI agent capability with Claude Agent SDK (@anthropic-ai/claude-code) or LangGraph (@langchain/langgraph). Create a dedicated agent package/app with tool definitions and conversation management.',
    });
  } else {
    addCompliant({
      category: 'agents',
      title: 'Agent framework',
      detail: research.agents.hasClaudeSDK ? 'Claude SDK' : 'LangGraph',
    });
  }

  // --- Python: Ruff ---
  if (research.python?.hasPythonServices && !research.python.hasRuff) {
    addGap({
      id: 'python-ruff',
      category: 'python',
      severity: 'required',
      title: 'Python services missing Ruff linter',
      current: research.python.hasBlack ? 'Using Black (formatter only)' : 'No Python linter',
      target: 'Ruff for fast Python linting and formatting',
      effort: 'small',
      featureDescription:
        'Add Ruff for Python linting and formatting. Install ruff, create ruff.toml with standard rules. Ruff is 10-100x faster than alternatives and replaces both Black and isort.',
    });
  }

  // --- Python: pytest ---
  if (research.python?.hasPythonServices && !research.python.hasPytest) {
    addGap({
      id: 'python-pytest',
      category: 'python',
      severity: 'required',
      title: 'Python services missing pytest',
      current: 'No Python test framework',
      target: 'pytest with coverage',
      effort: 'small',
      featureDescription:
        'Add pytest for Python service testing. Install pytest and pytest-cov, create initial test files, add test configuration to pyproject.toml.',
    });
  }

  // ===================== CALCULATE SCORE =====================

  // Score = (total possible weight - gap weight) / total possible weight * 100
  const totalChecks = gaps.length + compliant.length;
  if (totalChecks === 0) {
    return {
      projectPath: research.projectPath,
      analyzedAt: new Date().toISOString(),
      overallScore: 100,
      gaps: [],
      compliant,
      summary: { critical: 0, required: 0, compliant: compliant.length },
    };
  }

  let totalWeight = 0;
  let gapWeight = 0;
  for (const g of gaps) {
    const w = SEVERITY_WEIGHTS[g.severity];
    totalWeight += w;
    gapWeight += w;
  }
  for (const _c of compliant) {
    // Compliant items all get weight 2 (recommended equivalent)
    totalWeight += 2;
  }

  const overallScore =
    totalWeight > 0 ? Math.round(((totalWeight - gapWeight) / totalWeight) * 100) : 100;

  const summary = {
    critical: gaps.filter((g) => g.severity === 'critical').length,
    required: gaps.filter((g) => g.severity === 'required').length,
    compliant: compliant.length,
  };

  logger.info('Gap analysis complete', {
    projectPath: research.projectPath,
    overallScore,
    gaps: gaps.length,
    compliant: compliant.length,
  });

  return {
    projectPath: research.projectPath,
    analyzedAt: new Date().toISOString(),
    overallScore,
    gaps,
    compliant,
    summary,
  };
}
