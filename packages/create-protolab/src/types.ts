// Copied from libs/types/src/setup.ts - keep in sync manually or via CI check

/**
 * Setup Pipeline Types
 *
 * Types for the ProtoLabs Agency Setup Pipeline.
 * Used by repo research, gap analysis, alignment proposal, and initialization phases.
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

// ========== Phase 3: Initialize ==========

export interface ProtolabConfig {
  name: string;
  version: string;
  protolab: {
    enabled: boolean;
  };
  techStack?: {
    language?: string;
    framework?: string;
    packageManager?: string;
  };
  commands?: {
    build?: string;
    test?: string;
    format?: string;
    lint?: string;
    dev?: string;
  };
  discord?: {
    categoryId?: string;
    channels?: Record<string, string>;
    webhookId?: string;
  };
  standard?: {
    skip?: string[];
    additional?: string[];
  };
  settings?: Record<string, unknown>;
}

export interface DiscordProvisionResult {
  success: boolean;
  categoryId?: string;
  channels?: Record<string, string>;
  webhookId?: string;
  error?: string;
}

// ========== Phase 4: Alignment Proposal ==========

export interface AlignmentFeature {
  title: string;
  description: string;
  complexity: GapEffort;
  priority: number;
  gapId: string;
  /** Index of the milestone this feature depends on (features in later milestones depend on earlier ones) */
  dependsOnMilestone?: number;
}

export interface AlignmentMilestone {
  title: string;
  features: AlignmentFeature[];
  /** 0-based index of this milestone in execution order */
  order: number;
  /** Indices of milestones that must complete before this one */
  dependsOn: number[];
}

export interface AlignmentProposal {
  projectPath: string;
  milestones: AlignmentMilestone[];
  totalFeatures: number;
  estimatedEffort: { small: number; medium: number; large: number };
  /** Milestone execution order (indices into milestones array) */
  dependencyOrder: number[];
}

// ========== Full Pipeline ==========

export interface SetupPipelineResult {
  research: RepoResearchResult;
  gapAnalysis: GapAnalysisReport;
  proposal?: AlignmentProposal;
  initialized: boolean;
  discordProvisioned?: boolean;
  featuresCreated?: number;
}
