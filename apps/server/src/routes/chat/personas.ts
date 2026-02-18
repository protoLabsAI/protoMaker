/**
 * Chat Personas — Context-aware system prompts for notes integration
 *
 * Selects between Jon (GTM), Ava (Ops), or generic writing assistant
 * based on the active note tab name.
 */

const GTM_KEYWORDS = [
  'blog',
  'post',
  'social',
  'marketing',
  'content',
  'newsletter',
  'tweet',
  'linkedin',
  'announcement',
];

const OPS_KEYWORDS = [
  'prd',
  'spec',
  'design',
  'architecture',
  'ops',
  'runbook',
  'doc',
  'plan',
  'rfc',
];

export type PersonaId = 'jon' | 'ava' | 'writer';

export interface NotesContext {
  view: string;
  projectPath: string;
  activeTabName?: string;
  activeTabContent?: string;
  tabs?: Array<{ name: string; wordCount: number; agentRead: boolean }>;
}

function matchKeywords(name: string, keywords: string[]): boolean {
  const lower = name.toLowerCase();
  return keywords.some((kw) => lower.includes(kw));
}

export function selectPersona(tabName?: string): PersonaId {
  if (!tabName) return 'writer';
  if (matchKeywords(tabName, GTM_KEYWORDS)) return 'jon';
  if (matchKeywords(tabName, OPS_KEYWORDS)) return 'ava';
  return 'writer';
}

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

export function buildPersonaPrompt(persona: PersonaId, ctx: NotesContext): string {
  const tabListing = buildTabListing(ctx.tabs);
  const activeContent = buildActiveContent(ctx);

  switch (persona) {
    case 'jon':
      return (
        `You are Jon, the GTM (Go-To-Market) specialist at protoLabs Studio. ` +
        `You help with content strategy, blog posts, social media copy, marketing, and brand positioning. ` +
        `Be creative, punchy, and audience-aware. Use a conversational yet professional tone. ` +
        `Help the user refine their writing, suggest improvements, and provide feedback on structure and messaging.` +
        tabListing +
        activeContent
      );
    case 'ava':
      return (
        `You are Ava, Chief of Staff at protoLabs Studio. ` +
        `You help with PRDs, specs, architecture documents, operational planning, and technical writing. ` +
        `Be precise, structured, and detail-oriented. Focus on clarity, completeness, and actionability. ` +
        `Help organize requirements, identify gaps, and improve document quality.` +
        tabListing +
        activeContent
      );
    default:
      return (
        `You are a helpful writing assistant integrated into protoLabs Studio. ` +
        `Help the user write, edit, and improve their content. Be concise and helpful. ` +
        `Provide feedback on structure, clarity, and tone when asked.` +
        tabListing +
        activeContent
      );
  }
}
