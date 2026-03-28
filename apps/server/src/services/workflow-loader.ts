/**
 * Workflow Loader — Loads and caches WorkflowDefinition from YAML files.
 *
 * Resolution order:
 *   1. `.automaker/workflows/{name}.yml` — project-specific overrides
 *   2. Built-in defaults — standard, read-only, content, audit
 *
 * Also provides workflow auto-matching: given a feature's metadata,
 * resolves the best workflow based on match rules.
 */

import path from 'path';
import fs from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { createLogger } from '@protolabsai/utils';
import type { WorkflowDefinition, Feature } from '@protolabsai/types';

const logger = createLogger('WorkflowLoader');

// ─── Built-in Workflow Definitions ────────────────────────────────────────

const STANDARD_WORKFLOW: WorkflowDefinition = {
  name: 'standard',
  description: 'Full code pipeline — all phases, worktree isolation, PR workflow',
  phases: [
    { state: 'INTAKE', enabled: true },
    { state: 'PLAN', enabled: true },
    { state: 'EXECUTE', enabled: true },
    { state: 'REVIEW', enabled: true },
    { state: 'MERGE', enabled: true },
    { state: 'DEPLOY', enabled: true },
  ],
  execution: {
    useWorktrees: true,
    terminalStatus: 'review',
  },
};

const READ_ONLY_WORKFLOW: WorkflowDefinition = {
  name: 'read-only',
  description: 'Read-only analysis — no branches, no PRs, results to feature output',
  phases: [
    { state: 'INTAKE', enabled: true },
    { state: 'PLAN', enabled: false },
    { state: 'EXECUTE', enabled: true },
    { state: 'REVIEW', enabled: false },
    { state: 'MERGE', enabled: false },
    { state: 'DEPLOY', enabled: false },
  ],
  execution: {
    useWorktrees: false,
    gitWorkflow: {
      autoCommit: false,
      autoPush: false,
      autoCreatePR: false,
    },
    terminalStatus: 'done',
  },
  match: {
    executionMode: 'read-only',
  },
};

const CONTENT_WORKFLOW: WorkflowDefinition = {
  name: 'content',
  description: 'GTM content creation — strategy brief, write, review, distribute',
  phases: [
    { state: 'INTAKE', enabled: true },
    { state: 'PLAN', enabled: true, processor: 'content-execute' },
    { state: 'EXECUTE', enabled: true, processor: 'content-execute' },
    { state: 'REVIEW', enabled: true, processor: 'content-review' },
    { state: 'MERGE', enabled: false },
    { state: 'DEPLOY', enabled: false },
  ],
  agent: {
    role: 'gtm-specialist',
    model: 'sonnet',
  },
  execution: {
    useWorktrees: false,
    gitWorkflow: {
      autoCommit: false,
    },
    terminalStatus: 'done',
  },
  match: {
    categories: ['content', 'marketing', 'blog', 'social'],
  },
};

const AUDIT_WORKFLOW: WorkflowDefinition = {
  name: 'audit',
  description: 'Code audit — read-only analysis with reporting, no code changes',
  phases: [
    { state: 'INTAKE', enabled: true },
    { state: 'PLAN', enabled: false },
    { state: 'EXECUTE', enabled: true },
    { state: 'REVIEW', enabled: false },
    { state: 'MERGE', enabled: false },
    { state: 'DEPLOY', enabled: false },
  ],
  agent: {
    role: 'qa-engineer',
    model: 'sonnet',
  },
  execution: {
    useWorktrees: false,
    gitWorkflow: {
      autoCommit: false,
      autoPush: false,
      autoCreatePR: false,
    },
    terminalStatus: 'done',
  },
  match: {
    categories: ['audit', 'review', 'analysis'],
    keywords: ['audit', 'sweep', 'analyze', 'review', 'check'],
  },
};

// ─── Operational Workflows ─────────────────────────────────────────────────

const RESEARCH_WORKFLOW: WorkflowDefinition = {
  name: 'research',
  description:
    'Deep research — investigates a topic, reads code/docs/web, produces a structured report',
  phases: [
    { state: 'INTAKE', enabled: true },
    { state: 'PLAN', enabled: true },
    { state: 'EXECUTE', enabled: true },
    { state: 'REVIEW', enabled: false },
    { state: 'MERGE', enabled: false },
    { state: 'DEPLOY', enabled: false },
  ],
  agent: { model: 'sonnet' },
  execution: {
    useWorktrees: false,
    gitWorkflow: { autoCommit: false, autoPush: false, autoCreatePR: false },
    terminalStatus: 'done',
  },
  match: {
    categories: ['research', 'investigation', 'analysis', 'exploration', 'due-diligence'],
    keywords: ['research', 'investigate', 'explore', 'analyze', 'compare', 'evaluate', 'survey'],
  },
};

const TECH_DEBT_SCAN_WORKFLOW: WorkflowDefinition = {
  name: 'tech-debt-scan',
  description:
    'Scan codebase for tech debt — TODOs, suppressed lint rules, deprecated patterns, test skips',
  phases: [
    { state: 'INTAKE', enabled: true },
    { state: 'PLAN', enabled: false },
    { state: 'EXECUTE', enabled: true },
    { state: 'REVIEW', enabled: false },
    { state: 'MERGE', enabled: false },
    { state: 'DEPLOY', enabled: false },
  ],
  agent: { model: 'sonnet' },
  execution: {
    useWorktrees: false,
    gitWorkflow: { autoCommit: false, autoPush: false, autoCreatePR: false },
    terminalStatus: 'done',
  },
  match: {
    categories: ['tech-debt', 'hygiene', 'cleanup'],
    keywords: ['tech debt', 'TODO', 'deprecated', 'lint', 'skip', 'hack', 'workaround'],
  },
};

const POSTMORTEM_WORKFLOW: WorkflowDefinition = {
  name: 'postmortem',
  description:
    'Incident postmortem — reads git history, PR threads, Discord, produces timeline + root cause',
  phases: [
    { state: 'INTAKE', enabled: true },
    { state: 'PLAN', enabled: true },
    { state: 'EXECUTE', enabled: true },
    { state: 'REVIEW', enabled: false },
    { state: 'MERGE', enabled: false },
    { state: 'DEPLOY', enabled: false },
  ],
  agent: { model: 'opus' },
  execution: {
    useWorktrees: false,
    gitWorkflow: { autoCommit: false, autoPush: false, autoCreatePR: false },
    terminalStatus: 'done',
  },
  match: {
    categories: ['postmortem', 'incident', 'outage', 'retrospective'],
    keywords: ['postmortem', 'incident', 'outage', 'root cause', 'what went wrong'],
  },
};

const DEPENDENCY_HEALTH_WORKFLOW: WorkflowDefinition = {
  name: 'dependency-health',
  description: 'Scan dependencies for CVEs, outdated packages, license conflicts, and duplicates',
  phases: [
    { state: 'INTAKE', enabled: true },
    { state: 'PLAN', enabled: false },
    { state: 'EXECUTE', enabled: true },
    { state: 'REVIEW', enabled: false },
    { state: 'MERGE', enabled: false },
    { state: 'DEPLOY', enabled: false },
  ],
  agent: { model: 'haiku' },
  execution: {
    useWorktrees: false,
    gitWorkflow: { autoCommit: false, autoPush: false, autoCreatePR: false },
    terminalStatus: 'done',
  },
  match: {
    categories: ['dependencies', 'security', 'compliance', 'supply-chain'],
    keywords: ['dependency', 'CVE', 'vulnerability', 'outdated', 'license', 'audit'],
  },
};

const COST_ANALYSIS_WORKFLOW: WorkflowDefinition = {
  name: 'cost-analysis',
  description:
    'Analyze agent execution costs — spend per feature, model tier ROI, budget projections',
  phases: [
    { state: 'INTAKE', enabled: true },
    { state: 'PLAN', enabled: false },
    { state: 'EXECUTE', enabled: true },
    { state: 'REVIEW', enabled: false },
    { state: 'MERGE', enabled: false },
    { state: 'DEPLOY', enabled: false },
  ],
  agent: { model: 'haiku' },
  execution: {
    useWorktrees: false,
    gitWorkflow: { autoCommit: false, autoPush: false, autoCreatePR: false },
    terminalStatus: 'done',
  },
  match: {
    categories: ['cost', 'budget', 'spending', 'optimization'],
    keywords: ['cost', 'spend', 'budget', 'ROI', 'expensive', 'tokens', 'usage'],
  },
};

const STRATEGIC_REVIEW_WORKFLOW: WorkflowDefinition = {
  name: 'strategic-review',
  description:
    'Long-horizon reflection — reviews progress against goals, identifies gaps, proposes next steps',
  phases: [
    { state: 'INTAKE', enabled: true },
    { state: 'PLAN', enabled: true },
    { state: 'EXECUTE', enabled: true },
    { state: 'REVIEW', enabled: false },
    { state: 'MERGE', enabled: false },
    { state: 'DEPLOY', enabled: false },
  ],
  agent: { role: 'ava', model: 'opus' },
  execution: {
    useWorktrees: false,
    gitWorkflow: { autoCommit: false, autoPush: false, autoCreatePR: false },
    terminalStatus: 'done',
  },
  match: {
    categories: ['strategy', 'planning', 'review', 'roadmap', 'goals'],
    keywords: ['strategic', 'roadmap', 'goals', 'progress', 'milestone', 'direction', 'vision'],
  },
};

const CHANGELOG_DIGEST_WORKFLOW: WorkflowDefinition = {
  name: 'changelog-digest',
  description:
    'Generate user-facing changelog from merged PRs, completed features, and git history',
  phases: [
    { state: 'INTAKE', enabled: true },
    { state: 'PLAN', enabled: false },
    { state: 'EXECUTE', enabled: true },
    { state: 'REVIEW', enabled: false },
    { state: 'MERGE', enabled: false },
    { state: 'DEPLOY', enabled: false },
  ],
  agent: { model: 'haiku' },
  execution: {
    useWorktrees: false,
    gitWorkflow: { autoCommit: false, autoPush: false, autoCreatePR: false },
    terminalStatus: 'done',
  },
  match: {
    categories: ['changelog', 'release-notes', 'communication'],
    keywords: ['changelog', 'release notes', 'what shipped', 'update', 'digest'],
  },
};

const SWEBENCH_WORKFLOW: WorkflowDefinition = {
  name: 'swebench',
  description: 'SWE-bench evaluation — read-only agent produces a patch for a repo issue',
  phases: [
    { state: 'INTAKE', enabled: true },
    { state: 'PLAN', enabled: true },
    { state: 'EXECUTE', enabled: true },
    { state: 'REVIEW', enabled: false },
    { state: 'MERGE', enabled: false },
    { state: 'DEPLOY', enabled: false },
  ],
  agent: { model: 'sonnet' },
  execution: {
    useWorktrees: false,
    gitWorkflow: { autoCommit: false, autoPush: false, autoCreatePR: false },
    terminalStatus: 'done',
  },
  match: {
    categories: ['benchmark', 'eval', 'swebench'],
    keywords: ['swe-bench', 'swebench', 'benchmark', 'evaluation'],
  },
};

/** All built-in workflows, keyed by name */
const BUILT_IN_WORKFLOWS = new Map<string, WorkflowDefinition>([
  // Core pipelines
  ['standard', STANDARD_WORKFLOW],
  ['read-only', READ_ONLY_WORKFLOW],
  ['content', CONTENT_WORKFLOW],
  ['audit', AUDIT_WORKFLOW],
  // Operational
  ['research', RESEARCH_WORKFLOW],
  ['tech-debt-scan', TECH_DEBT_SCAN_WORKFLOW],
  ['dependency-health', DEPENDENCY_HEALTH_WORKFLOW],
  ['cost-analysis', COST_ANALYSIS_WORKFLOW],
  ['changelog-digest', CHANGELOG_DIGEST_WORKFLOW],
  // Strategic
  ['postmortem', POSTMORTEM_WORKFLOW],
  ['strategic-review', STRATEGIC_REVIEW_WORKFLOW],
  // Benchmark
  ['swebench', SWEBENCH_WORKFLOW],
]);

// ─── Service ──────────────────────────────────────────────────────────────

export class WorkflowLoader {
  /** Per-project cache: projectPath → Map<workflowName, definition> */
  private cache = new Map<string, Map<string, WorkflowDefinition>>();

  /**
   * Resolve a workflow definition by name for a given project.
   *
   * 1. Check project's `.automaker/workflows/{name}.yml`
   * 2. Fall back to built-in defaults
   * 3. Return null if not found
   */
  async resolve(projectPath: string, workflowName: string): Promise<WorkflowDefinition | null> {
    // Check project-level YAML first
    const projectWorkflows = await this.loadProjectWorkflows(projectPath);
    if (projectWorkflows.has(workflowName)) {
      return projectWorkflows.get(workflowName)!;
    }

    // Fall back to built-in
    return BUILT_IN_WORKFLOWS.get(workflowName) ?? null;
  }

  /**
   * Resolve the effective workflow for a feature.
   *
   * Priority:
   *   1. feature.workflow (explicit assignment)
   *   2. feature.featureType mapping ('content' → content workflow)
   *   3. feature.executionMode mapping ('read-only' → read-only workflow)
   *   4. Default: 'standard'
   */
  async resolveForFeature(projectPath: string, feature: Feature): Promise<WorkflowDefinition> {
    // Explicit workflow assignment
    if (feature.workflow) {
      const workflow = await this.resolve(projectPath, feature.workflow);
      if (workflow) return workflow;
      logger.warn(
        `Workflow "${feature.workflow}" not found for feature ${feature.id}, falling back to standard`
      );
    }

    // Legacy featureType mapping
    if (feature.featureType === 'content') {
      const workflow = await this.resolve(projectPath, 'content');
      if (workflow) return workflow;
    }

    // Legacy executionMode mapping
    if (feature.executionMode === 'read-only') {
      const workflow = await this.resolve(projectPath, 'read-only');
      if (workflow) return workflow;
    }

    // Default
    return STANDARD_WORKFLOW;
  }

  /**
   * List all available workflow names for a project (built-in + project-specific).
   */
  async listWorkflows(projectPath: string): Promise<string[]> {
    const projectWorkflows = await this.loadProjectWorkflows(projectPath);
    const names = new Set<string>([...BUILT_IN_WORKFLOWS.keys(), ...projectWorkflows.keys()]);
    return Array.from(names).sort();
  }

  /**
   * Get a built-in workflow by name (no project path needed).
   */
  getBuiltIn(name: string): WorkflowDefinition | undefined {
    return BUILT_IN_WORKFLOWS.get(name);
  }

  /**
   * Clear the cache for a project (e.g. after file changes).
   */
  invalidateCache(projectPath: string): void {
    this.cache.delete(projectPath);
  }

  // ── Private ─────────────────────────────────────────────────────────────

  private async loadProjectWorkflows(
    projectPath: string
  ): Promise<Map<string, WorkflowDefinition>> {
    // Return cached if available
    if (this.cache.has(projectPath)) {
      return this.cache.get(projectPath)!;
    }

    const workflows = new Map<string, WorkflowDefinition>();
    const workflowDir = path.join(projectPath, '.automaker', 'workflows');

    try {
      if (!fs.existsSync(workflowDir)) {
        this.cache.set(projectPath, workflows);
        return workflows;
      }

      const files = fs
        .readdirSync(workflowDir)
        .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));

      for (const file of files) {
        try {
          const filePath = path.join(workflowDir, file);
          const content = fs.readFileSync(filePath, 'utf-8');
          const parsed = parseYaml(content) as WorkflowDefinition;

          if (!parsed?.name) {
            logger.warn(`Workflow file ${file} missing 'name' field, skipping`);
            continue;
          }

          if (!parsed.phases || !Array.isArray(parsed.phases)) {
            logger.warn(`Workflow file ${file} missing 'phases' array, skipping`);
            continue;
          }

          if (!parsed.execution) {
            logger.warn(`Workflow file ${file} missing 'execution' block, skipping`);
            continue;
          }

          // Ensure terminalStatus has a default
          if (!parsed.execution.terminalStatus) {
            parsed.execution.terminalStatus = 'review';
          }

          // Ensure useWorktrees has a default
          if (parsed.execution.useWorktrees === undefined) {
            parsed.execution.useWorktrees = true;
          }

          workflows.set(parsed.name, parsed);
          logger.debug(`Loaded project workflow: ${parsed.name} from ${file}`);
        } catch (err) {
          logger.warn(`Failed to parse workflow file ${file}:`, err);
        }
      }
    } catch (err) {
      logger.warn(`Failed to read workflow directory ${workflowDir}:`, err);
    }

    this.cache.set(projectPath, workflows);
    return workflows;
  }
}
