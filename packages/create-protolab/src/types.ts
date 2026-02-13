/**
 * Types for create-protolab CLI
 * Copied from @automaker/types to avoid external dependencies
 */

// ========== Phase 1: Repo Research ==========

export interface RepoResearchResult {
  projectPath: string;
  projectName: string;

  git: {
    isRepo: boolean;
    remoteUrl?: string;
    defaultBranch?: string;
    provider?: 'github' | 'gitlab' | 'bitbucket';
  };

  monorepo: {
    isMonorepo: boolean;
    tool?: 'turbo' | 'nx' | 'lerna' | 'npm-workspaces' | 'pnpm-workspaces';
    packageManager: 'pnpm' | 'npm' | 'yarn' | 'bun' | 'unknown';
    workspaceGlobs?: string[];
    packages: { name: string; path: string; type: 'app' | 'package' }[];
  };

  frontend: {
    framework?: 'react' | 'vue' | 'svelte' | 'none';
    reactVersion?: string;
    metaFramework?: 'nextjs' | 'remix' | 'vite' | 'none';
    metaFrameworkVersion?: string;
    hasShadcn: boolean;
    hasStorybook: boolean;
    storybookVersion?: string;
    hasTailwind: boolean;
    tailwindVersion?: string;
    hasRadix: boolean;
  };

  backend: {
    hasPayload: boolean;
    payloadVersion?: string;
    database?: 'postgres' | 'neo4j' | 'sqlite' | 'mongodb' | 'none';
    hasExpress: boolean;
    hasFastAPI: boolean;
  };

  agents: {
    hasMCPServers: boolean;
    mcpPackages: string[];
    hasLangGraph: boolean;
    hasClaudeSDK: boolean;
    hasAgentFolder: boolean;
  };

  testing: {
    hasVitest: boolean;
    vitestVersion?: string;
    hasPlaywright: boolean;
    playwrightVersion?: string;
    hasJest: boolean;
    hasPytest: boolean;
    testDirs: string[];
  };

  codeQuality: {
    hasESLint: boolean;
    eslintVersion?: string;
    hasPrettier: boolean;
    hasTypeScript: boolean;
    tsVersion?: string;
    tsStrict: boolean;
    hasCompositeConfig: boolean;
    hasHusky: boolean;
    hasLintStaged: boolean;
  };

  ci: {
    hasCI: boolean;
    provider?: 'github-actions' | 'gitlab-ci' | 'circleci';
    workflows: string[];
    hasBuildCheck: boolean;
    hasTestCheck: boolean;
    hasFormatCheck: boolean;
    hasSecurityAudit: boolean;
    hasCodeRabbit: boolean;
    hasBranchProtection: boolean;
  };

  automation: {
    hasAutomaker: boolean;
    hasBeads: boolean;
    hasDiscordIntegration: boolean;
    hasProtolabConfig: boolean;
    hasAnalytics: boolean;
    analyticsProvider?: 'umami' | 'plausible' | 'google-analytics' | 'other';
  };

  python: {
    hasPythonServices: boolean;
    services: { name: string; path: string; framework?: string }[];
    hasRuff: boolean;
    hasBlack: boolean;
    hasPytest: boolean;
    hasPoetry: boolean;
    hasPyproject: boolean;
  };

  structure: {
    topDirs: string[];
    configFiles: string[];
    entryPoints: string[];
  };
}

// ========== Phase 2: Gap Analysis ==========

export type GapCategory =
  | 'monorepo'
  | 'frontend'
  | 'backend'
  | 'testing'
  | 'ci'
  | 'quality'
  | 'automation'
  | 'agents'
  | 'python';

export type GapSeverity = 'critical' | 'recommended' | 'optional';

export type GapEffort = 'small' | 'medium' | 'large';

export interface GapItem {
  id: string;
  category: GapCategory;
  severity: GapSeverity;
  title: string;
  current: string;
  target: string;
  effort: GapEffort;
  featureDescription: string;
}

export interface ComplianceItem {
  category: string;
  title: string;
  detail: string;
}

export interface GapAnalysisReport {
  projectPath: string;
  analyzedAt: string;
  overallScore: number;

  gaps: GapItem[];
  compliant: ComplianceItem[];

  summary: {
    critical: number;
    recommended: number;
    optional: number;
    compliant: number;
  };
}
