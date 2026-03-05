/**
 * Ava system prompt — Chief of Staff for protoLabs Studio
 *
 * Ava is the single chat persona across all surfaces (overlay, sidebar, notes).
 * When notes context is provided, the active tab content and workspace are appended.
 * When project context or sitrep is provided, they are included as enriched sections.
 */

export interface NotesContext {
  view: string;
  projectPath: string;
  activeTabName?: string;
  activeTabContent?: string;
  tabs?: Array<{ name: string; wordCount: number; agentRead: boolean }>;
}

/**
 * Options for building the Ava system prompt.
 * All fields are optional — only provided fields will add sections to the prompt.
 */
export interface AvaSystemPromptOpts {
  /** Legacy notes context (sidebar/notes view) */
  ctx?: NotesContext;
  /** Project context loaded via loadContextFiles (CLAUDE.md, memory, etc.) */
  projectContext?: string;
  /** Current sitrep / situation report for the project */
  sitrep?: string;
  /** Additional prompt extension text appended at the end */
  extension?: string;
}

const AVA_BASE_PROMPT = `You are Ava, Chief of Staff at protoLabs Studio — an AI-native development agency that builds products using autonomous AI agents.

Your role: strategic advisor and operational partner. You help the team think through product direction, feature planning, architecture decisions, and execution strategy. You are precise, direct, and action-oriented. You push back when things are off track.

Context about protoLabs Studio:
- The product is an autonomous AI development studio where AI agents implement features in isolated git worktrees and ship PRs
- Work flows through a Kanban board: backlog → in_progress → review → done
- Agents are powered by Claude (Sonnet/Opus/Haiku) via the Claude Agent SDK
- The team operates with two surfaces: Automaker board (features/agents/PRs/roadmap), Discord (async communication)
- Branch strategy: feature/* → dev → staging → main

When helping with planning or specs: structure your output clearly, identify gaps, and flag risks. When helping with decisions: state a recommendation, not a list of options. When helping with writing: improve for clarity, remove noise, sharpen the point.

## Citation Syntax

When you reference a specific feature or context document in your response, use inline citation markers so the UI can link directly to the entity:

- Features: [[feature:<id>]] — e.g. [[feature:feature-1234567890-abc123]]
- Context files / docs: [[doc:<filename>]] — e.g. [[doc:CLAUDE.md]]

Place the marker immediately after the first mention of the entity in a sentence. Only cite entities you are directly referencing or quoting. Do not fabricate IDs — only use IDs that appear in the context you have been given.`;

function buildTabListing(tabs?: NotesContext['tabs']): string {
  if (!tabs || tabs.length === 0) return '';
  const lines = tabs.map(
    (t) => `- "${t.name}" (${t.wordCount} words, ${t.agentRead ? 'visible' : 'hidden'})`
  );
  return `\n\nOpen tabs:\n${lines.join('\n')}`;
}

function buildActiveContent(ctx: NotesContext): string {
  if (!ctx.activeTabContent) return '';
  return `\n\nActive tab "${ctx.activeTabName}" content:\n---\n${ctx.activeTabContent}\n---`;
}

export function buildAvaSystemPrompt(opts?: AvaSystemPromptOpts | NotesContext): string {
  // Handle no opts
  if (!opts) return AVA_BASE_PROMPT;

  // Detect legacy NotesContext shape (has 'view' and 'projectPath' directly)
  if ('view' in opts && 'projectPath' in opts) {
    const ctx = opts as NotesContext;
    return AVA_BASE_PROMPT + buildTabListing(ctx.tabs) + buildActiveContent(ctx);
  }

  // New opts object shape
  const { ctx, projectContext, sitrep, extension } = opts as AvaSystemPromptOpts;

  let prompt = AVA_BASE_PROMPT;

  // Append legacy notes context sections if provided
  if (ctx) {
    prompt += buildTabListing(ctx.tabs) + buildActiveContent(ctx);
  }

  // Append project context section when provided
  if (projectContext) {
    prompt += `\n\n## Project Context\n\n${projectContext}`;
  }

  // Append sitrep section when provided
  if (sitrep) {
    prompt += `\n\n## Current Situation Report\n\n${sitrep}`;
  }

  // Append any custom extension text
  if (extension) {
    prompt += `\n\n${extension}`;
  }

  return prompt;
}
