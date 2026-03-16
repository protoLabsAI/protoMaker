/**
 * Post-project documentation ceremony LangGraph flow.
 *
 * Fires after a project completes (all features done). Gathers project context —
 * PRD, merged PR summaries, changed files — then identifies doc files that reference
 * the changed code and creates a backlog feature with rich context for a doc-update agent.
 *
 * Flow topology:
 *   START -> loadProjectContext -> scanAffectedDocs -> createDocUpdateFeature -> END
 *
 * This is a fire-and-forget ceremony: any failure here does not affect project status.
 *
 * Usage (server-side):
 * ```typescript
 * import { createPostProjectDocsFlow } from '@protolabsai/flows';
 *
 * const flow = createPostProjectDocsFlow({
 *   featureLoader,
 *   projectPath: '/path/to/project',
 *   projectSlug: 'my-project',
 *   projectTitle: 'My Project',
 *   totalFeatures: 10,
 *   milestoneSummaries: [...],
 * });
 *
 * await flow.invoke({});
 * ```
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { StateGraph, Annotation, END, START } from '@langchain/langgraph';
import type { Feature } from '@protolabsai/types';

// ---------------------------------------------------------------------------
// Minimal structural interfaces (dependency injection without concrete imports)
// ---------------------------------------------------------------------------

/**
 * Subset of FeatureLoader used by the post-project docs flow.
 */
export interface PostProjectDocsFeatureLoader {
  getAll: (projectPath: string) => Promise<Feature[]>;
  create: (projectPath: string, data: Partial<Feature>) => Promise<Feature>;
}

/**
 * Summary of a milestone for context building.
 */
export interface PostProjectDocsMilestoneSummary {
  milestoneTitle: string;
  featureCount: number;
  costUsd: number;
}

/**
 * All dependencies required to create a post-project docs flow instance.
 */
export interface PostProjectDocsFlowDeps {
  /** Feature loader for reading/creating features */
  featureLoader: PostProjectDocsFeatureLoader;
  /** Absolute path to the project directory */
  projectPath: string;
  /** Project slug identifier */
  projectSlug: string;
  /** Human-readable project title */
  projectTitle: string;
  /** Total number of features in the project */
  totalFeatures: number;
  /** Per-milestone summaries for context */
  milestoneSummaries: PostProjectDocsMilestoneSummary[];
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const PostProjectDocsStateAnnotation = Annotation.Root({
  // Input context
  projectPath: Annotation<string>,
  projectSlug: Annotation<string>,
  projectTitle: Annotation<string>,
  totalFeatures: Annotation<number>,
  milestoneSummaries: Annotation<PostProjectDocsMilestoneSummary[]>,
  // Loaded in loadProjectContext
  features: Annotation<Feature[]>,
  prdContent: Annotation<string>,
  changedFiles: Annotation<string[]>,
  mergedPrSummaries: Annotation<string>,
  // Populated in scanAffectedDocs
  affectedDocFiles: Annotation<string[]>,
  // Set in createDocUpdateFeature
  createdFeatureId: Annotation<string>,
  // Error field
  error: Annotation<string>,
});

type PostProjectDocsState = typeof PostProjectDocsStateAnnotation.State;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Read the project PRD markdown file if it exists. */
function readPrdContent(projectPath: string, projectSlug: string): string {
  const prdPath = path.join(projectPath, '.automaker', 'projects', projectSlug, 'prd.md');
  try {
    if (fs.existsSync(prdPath)) {
      const raw = fs.readFileSync(prdPath, 'utf-8');
      // Truncate to avoid overly large descriptions
      return raw.length > 3000 ? raw.slice(0, 2997) + '...' : raw;
    }
  } catch {
    // non-fatal
  }
  return '';
}

/**
 * Get files changed in the last N commits on the current branch.
 * Returns paths relative to the repository root.
 */
function getRecentlyChangedFiles(projectPath: string, commitDepth = 30): string[] {
  try {
    const output = execSync(`git diff --name-only HEAD~${commitDepth}..HEAD 2>/dev/null || true`, {
      cwd: projectPath,
      encoding: 'utf-8',
      timeout: 10_000,
    });
    return output
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Find doc files in docs/ that reference any of the given keywords.
 * Keywords are derived from changed file basenames (without extension).
 * Returns paths relative to the repository root.
 */
function findAffectedDocFiles(projectPath: string, changedFiles: string[]): string[] {
  if (changedFiles.length === 0) return [];

  // Extract meaningful keywords from changed file paths
  const keywords = changedFiles
    .filter((f) => !f.startsWith('docs/') && !f.endsWith('.md'))
    .map((f) => path.basename(f, path.extname(f)))
    .filter((k) => k.length > 3) // skip trivial names like "src", "lib"
    .filter((k) => !/^(index|types|utils|helpers|constants)$/.test(k));

  if (keywords.length === 0) return [];

  // Deduplicate
  const uniqueKeywords = [...new Set(keywords)].slice(0, 20);
  const docsDir = path.join(projectPath, 'docs');

  if (!fs.existsSync(docsDir)) return [];

  const affectedFiles = new Set<string>();

  for (const keyword of uniqueKeywords) {
    try {
      // Use grep to find doc files referencing this keyword
      const output = execSync(
        `grep -rl --include="*.md" ${JSON.stringify(keyword)} . 2>/dev/null || true`,
        { cwd: docsDir, encoding: 'utf-8', timeout: 5_000 }
      );
      output
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .forEach((f) => {
          // Make path relative to repo root
          const relPath = path.join('docs', f.replace(/^\.\//, ''));
          affectedFiles.add(relPath);
        });
    } catch {
      // non-fatal
    }
  }

  return [...affectedFiles].slice(0, 20);
}

// ---------------------------------------------------------------------------
// Node factories
// ---------------------------------------------------------------------------

/**
 * loadProjectContext: Loads completed features, reads the project PRD,
 * and collects recently changed files for context.
 */
function createLoadProjectContextNode(deps: PostProjectDocsFlowDeps) {
  return async (_state: PostProjectDocsState): Promise<Partial<PostProjectDocsState>> => {
    try {
      const allFeatures = await deps.featureLoader.getAll(deps.projectPath);
      const features = allFeatures.filter(
        (f) => f.projectSlug === deps.projectSlug && f.status === 'done'
      );

      const prdContent = readPrdContent(deps.projectPath, deps.projectSlug);
      const changedFiles = getRecentlyChangedFiles(deps.projectPath);

      // Build PR summary from feature data (titles + PR URLs)
      const prLines = features
        .filter((f) => f.prUrl)
        .map((f) => `- ${f.title || 'Untitled'} — ${f.prUrl}`)
        .join('\n');
      const mergedPrSummaries = prLines || '- No merged PRs recorded';

      return { features, prdContent, changedFiles, mergedPrSummaries };
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : String(err),
        features: [],
        prdContent: '',
        changedFiles: [],
        mergedPrSummaries: '',
      };
    }
  };
}

/**
 * scanAffectedDocs: Finds documentation files that reference changed code modules.
 */
function createScanAffectedDocsNode(deps: PostProjectDocsFlowDeps) {
  return async (state: PostProjectDocsState): Promise<Partial<PostProjectDocsState>> => {
    if (state.error) return { affectedDocFiles: [] };

    const affectedDocFiles = findAffectedDocFiles(deps.projectPath, state.changedFiles);
    return { affectedDocFiles };
  };
}

/**
 * createDocUpdateFeature: Creates a backlog feature with full project context
 * for a doc-update agent to pick up.
 */
function createDocUpdateFeatureNode(deps: PostProjectDocsFlowDeps) {
  return async (state: PostProjectDocsState): Promise<Partial<PostProjectDocsState>> => {
    if (state.error) return {};

    const shippedCount = state.features.length;
    const milestoneLine = deps.milestoneSummaries
      .map((m) => `- ${m.milestoneTitle}: ${m.featureCount} features`)
      .join('\n');

    const affectedDocsSection =
      state.affectedDocFiles.length > 0
        ? `\n\n## Potentially Affected Doc Files\n\nGrep scan found these docs referencing changed modules:\n${state.affectedDocFiles.map((f) => `- \`${f}\``).join('\n')}`
        : '\n\n## Potentially Affected Doc Files\n\nNo automatic matches found — review `docs/` manually.';

    const prdSection = state.prdContent ? `\n\n## Project PRD\n\n${state.prdContent}` : '';

    const description =
      `All ${shippedCount} features in the **${deps.projectTitle}** project have merged. ` +
      `Review the docs and update any pages affected by these changes.\n\n` +
      `## Project Summary\n\n` +
      `- Total features shipped: ${shippedCount} of ${deps.totalFeatures}\n` +
      `- Milestones:\n${milestoneLine || '- (none)'}\n\n` +
      `## Merged PRs\n\n${state.mergedPrSummaries}` +
      affectedDocsSection +
      prdSection +
      `\n\n## Instructions\n\n` +
      `1. Review each potentially affected doc file listed above\n` +
      `2. Check the merged PRs for new services, routes, config options, or changed behavior\n` +
      `3. Update all relevant pages in \`docs/\` (and \`docs/internal/\` if applicable)\n` +
      `4. Open a single PR with all doc updates`;

    const feature = await deps.featureLoader.create(deps.projectPath, {
      title: `Update docs: ${deps.projectTitle} project complete`,
      description,
      status: 'backlog',
      category: 'Documentation',
      complexity: 'small',
    });

    return { createdFeatureId: feature.id };
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates and compiles the post-project docs ceremony LangGraph flow.
 *
 * Flow topology:
 *   START -> loadProjectContext -> scanAffectedDocs -> createDocUpdateFeature -> END
 *
 * @param deps - Flow dependencies (featureLoader, project identifiers, summaries)
 * @returns Compiled StateGraph ready for .invoke({})
 */
export function createPostProjectDocsFlow(deps: PostProjectDocsFlowDeps) {
  const graph = new StateGraph(PostProjectDocsStateAnnotation);

  graph.addNode('loadProjectContext', createLoadProjectContextNode(deps));
  graph.addNode('scanAffectedDocs', createScanAffectedDocsNode(deps));
  graph.addNode('createDocUpdateFeature', createDocUpdateFeatureNode(deps));

  // TypeScript's strict node-name literal inference requires casting here.
  // Same pattern used in project-retro-flow.ts, maintenance-flow.ts, etc.
  const g = graph as unknown as {
    addEdge: (from: string, to: string) => void;
  };

  g.addEdge(START as unknown as string, 'loadProjectContext');
  g.addEdge('loadProjectContext', 'scanAffectedDocs');
  g.addEdge('scanAffectedDocs', 'createDocUpdateFeature');
  g.addEdge('createDocUpdateFeature', END as unknown as string);

  return graph.compile();
}
