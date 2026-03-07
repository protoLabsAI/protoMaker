import crypto from 'node:crypto';
import { createLogger } from '@protolabsai/utils';
import { getNotesWorkspacePath, ensureNotesDir, secureFs } from '@protolabsai/platform';
import type { NotesWorkspace, NoteTab } from '@protolabsai/types';
import type { RepoResearchResult } from '@protolabsai/types';

const logger = createLogger('setup-tutorial-service');

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface TutorialSection {
  title: string;
  content: string;
}

export interface TutorialContent {
  tabName: string;
  sections: TutorialSection[];
}

// ────────────────────────────────────────────────────────────────────────────
// Workspace helpers (mirrors notes route internals)
// ────────────────────────────────────────────────────────────────────────────

async function loadWorkspace(projectPath: string): Promise<NotesWorkspace> {
  const filePath = getNotesWorkspacePath(projectPath);
  try {
    const raw = await secureFs.readFile(filePath, 'utf-8');
    return JSON.parse(raw as string) as NotesWorkspace;
  } catch {
    // Return a minimal default workspace when none exists yet
    const defaultTabId = crypto.randomUUID();
    const now = Date.now();
    return {
      version: 1,
      workspaceVersion: 0,
      activeTabId: defaultTabId,
      tabOrder: [defaultTabId],
      tabs: {
        [defaultTabId]: {
          id: defaultTabId,
          name: 'Notes',
          content: '',
          permissions: { agentRead: true, agentWrite: true },
          metadata: { createdAt: now, updatedAt: now, wordCount: 0, characterCount: 0 },
        },
      },
    };
  }
}

async function saveWorkspace(projectPath: string, workspace: NotesWorkspace): Promise<void> {
  await ensureNotesDir(projectPath);
  const filePath = getNotesWorkspacePath(projectPath);
  await secureFs.writeFile(filePath, JSON.stringify(workspace, null, 2), 'utf-8');
}

// ────────────────────────────────────────────────────────────────────────────
// HTML rendering helpers
// ────────────────────────────────────────────────────────────────────────────

/**
 * Render a list of tutorial sections as Tiptap-compatible HTML.
 * Each section becomes a <details>/<summary> collapsible block.
 */
function renderSectionsToHtml(sections: TutorialSection[]): string {
  const parts: string[] = [];

  for (const section of sections) {
    parts.push(
      `<details><summary><strong>${section.title}</strong></summary>${section.content}</details>`
    );
  }

  return parts.join('\n');
}

// ────────────────────────────────────────────────────────────────────────────
// Content generators — one per product domain
// ────────────────────────────────────────────────────────────────────────────

function boardSection(): TutorialSection {
  return {
    title: 'Board — Feature Lifecycle',
    content: `<p>The Board is your single source of truth for project work.</p>
<ul>
  <li><strong>Create a feature</strong>: Click <em>New Feature</em> in the board header.</li>
  <li><strong>Status flow</strong>: <code>backlog → active → in-review → done</code></li>
  <li><strong>Move a feature</strong>: Drag the card to a new column or use the status dropdown inside the feature detail view.</li>
  <li><strong>Milestones &amp; Phases</strong>: Group features under a milestone so agents can sequence work automatically.</li>
</ul>`,
  };
}

function agentsSection(research?: RepoResearchResult): TutorialSection {
  const pm = research?.monorepo?.packageManager ?? 'npm';
  const runCmd = pm === 'pnpm' ? 'pnpm' : pm === 'bun' ? 'bun' : 'npm run';

  return {
    title: 'Agents — Starting & What Happens Next',
    content: `<p>Each feature can be assigned to an AI agent that does the implementation work.</p>
<ul>
  <li><strong>Start an agent</strong>: Open a feature and click <em>Start Agent</em>. The agent runs inside an isolated git worktree so it never touches your main branch.</li>
  <li><strong>Worktrees</strong>: The agent checks out a fresh branch (<code>feature/&lt;id&gt;</code>) via <code>git worktree</code>. Your working tree stays clean.</li>
  <li><strong>Build &amp; test</strong>: The agent runs <code>${runCmd} build</code> and <code>${runCmd} test</code> before raising a PR.</li>
  <li><strong>PR</strong>: When work is complete the agent opens a pull request. Review, approve, and the worktree is cleaned up automatically.</li>
</ul>`,
  };
}

function contextSection(): TutorialSection {
  return {
    title: 'Context — coding-rules.md & Customization',
    content: `<p>Agents load context files from <code>.automaker/context/</code> before every task.</p>
<ul>
  <li><strong>coding-rules.md</strong>: Declares linting, formatting, and type-checking requirements. Agents follow these rules automatically — keep it up to date as your tooling evolves.</li>
  <li><strong>CLAUDE.md</strong>: High-level project overview, tech stack summary, and common commands. Edit this whenever the architecture changes.</li>
  <li><strong>Custom files</strong>: Add any <code>.md</code> file to <code>.automaker/context/</code> and agents will read it. Great for API contracts, style guides, or domain knowledge.</li>
</ul>`,
  };
}

function autoModeSection(): TutorialSection {
  return {
    title: 'Auto-mode — Autonomous Operation',
    content: `<p>Auto-mode lets Automaker work through the backlog without manual intervention.</p>
<ul>
  <li><strong>What it is</strong>: When enabled, the system picks the next <em>active</em> feature, starts an agent, waits for the PR, and loops to the next one.</li>
  <li><strong>How to start</strong>: Toggle <em>Auto-mode</em> in the board toolbar. You can stop it at any time — in-flight work is not cancelled.</li>
  <li><strong>Dependency chains</strong>: Features can declare <code>blockedBy</code> relationships. Auto-mode respects these — a feature won't start until its dependencies are merged.</li>
  <li><strong>Review gates</strong>: Auto-mode pauses at PRs awaiting your approval. It won't auto-merge without a human sign-off unless you explicitly enable that in settings.</li>
</ul>`,
  };
}

function projectsSection(): TutorialSection {
  return {
    title: 'Projects — PRDs, Milestones & Phases',
    content: `<p>Large initiatives are organized as Projects containing Milestones and Phases.</p>
<ul>
  <li><strong>PRD</strong>: Submit a Product Requirements Document via the <em>Submit PRD</em> action. The Project Manager agent decomposes it into features automatically.</li>
  <li><strong>Milestones</strong>: A milestone groups related features. Mark it complete when all child features reach <em>done</em>.</li>
  <li><strong>Phases</strong>: Phases order milestones sequentially. Agents only start on Phase N+1 once Phase N is fully merged.</li>
</ul>`,
  };
}

function gitWorkflowSection(research?: RepoResearchResult): TutorialSection {
  const defaultBranch = research?.git?.defaultBranch ?? 'main';

  return {
    title: 'Git Workflow — Three-Branch Flow',
    content: `<p>Automaker enforces a structured branching strategy to keep <code>${defaultBranch}</code> stable.</p>
<ul>
  <li><strong>Three branches</strong>: <code>feature/* → dev → staging → ${defaultBranch}</code>. Agent work lands on <code>feature/*</code> first.</li>
  <li><strong>Worktree isolation</strong>: Every agent operates in its own <code>git worktree</code> directory. Branches never interfere with each other or your working tree.</li>
  <li><strong>PR auto-merge</strong>: Once CI passes and a reviewer approves, the PR is merged and the worktree is pruned. No manual cleanup needed.</li>
  <li><strong>Branch protection</strong>: <code>${defaultBranch}</code> requires passing build, test, format, and lint checks before merge — enforced via branch protection rules.</li>
</ul>`,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────────

/**
 * Generate structured tutorial content for all 6 product domains,
 * optionally customizing examples to the detected tech stack.
 */
export function generateTutorialContent(research?: RepoResearchResult): TutorialContent {
  return {
    tabName: 'Getting Started',
    sections: [
      boardSection(),
      agentsSection(research),
      contextSection(),
      autoModeSection(),
      projectsSection(),
      gitWorkflowSection(research),
    ],
  };
}

/**
 * SetupTutorialService — creates a "Getting Started" notes tab for a project.
 *
 * The tab is written directly to the notes workspace file so it is immediately
 * available in the UI without a separate API call.
 */
export class SetupTutorialService {
  /**
   * Create the "Getting Started" tutorial tab in the project's notes workspace.
   * If the tab already exists (by name) it is left unchanged.
   *
   * @returns The ID of the created (or pre-existing) tab, or null on failure.
   */
  async createGettingStartedTab(
    projectPath: string,
    research?: RepoResearchResult
  ): Promise<string | null> {
    try {
      const workspace = await loadWorkspace(projectPath);

      // Skip if a "Getting Started" tab already exists
      const alreadyExists = Object.values(workspace.tabs).some(
        (tab) => tab.name === 'Getting Started'
      );
      if (alreadyExists) {
        logger.info('Getting Started tab already exists — skipping', { projectPath });
        const existing = Object.values(workspace.tabs).find(
          (tab) => tab.name === 'Getting Started'
        );
        return existing?.id ?? null;
      }

      const tutorial = generateTutorialContent(research);
      const html = renderSectionsToHtml(tutorial.sections);

      const now = Date.now();
      const tabId = crypto.randomUUID();
      const plainText = html.replace(/<[^>]*>/g, '');

      const newTab: NoteTab = {
        id: tabId,
        name: tutorial.tabName,
        content: html,
        permissions: { agentRead: true, agentWrite: false },
        metadata: {
          createdAt: now,
          updatedAt: now,
          wordCount: plainText.trim() ? plainText.trim().split(/\s+/).length : 0,
          characterCount: plainText.length,
        },
      };

      // Prepend the Getting Started tab so it appears first
      workspace.tabs[tabId] = newTab;
      workspace.tabOrder = [tabId, ...workspace.tabOrder];
      workspace.workspaceVersion = (workspace.workspaceVersion ?? 0) + 1;

      await saveWorkspace(projectPath, workspace);

      logger.info('Created Getting Started tutorial tab', { projectPath, tabId });
      return tabId;
    } catch (error) {
      logger.error('Failed to create Getting Started tutorial tab', {
        projectPath,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
}
