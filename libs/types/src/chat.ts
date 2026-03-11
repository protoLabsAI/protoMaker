/**
 * Chat types for the slash command system.
 *
 * SlashCommand represents a discoverable command that can be invoked
 * via the `/command-name` syntax in the chat UI.
 */

/** Where the command was discovered from */
export type SlashCommandSource =
  | 'mcp-plugin' // packages/mcp-server/plugins/automaker/commands/*.md
  | 'project-skill'; // .claude/skills/*.md

/** Category for grouping commands in the dropdown */
export type SlashCommandCategory = 'operations' | 'engineering' | 'team' | 'planning' | 'setup';

/**
 * A slash command that can be invoked from the chat interface.
 *
 * File-backed commands are parsed from markdown files with YAML frontmatter:
 *
 * ```markdown
 * ---
 * name: ava
 * description: Activates AVA, your Autonomous Virtual Agency.
 * category: operations
 * argument-hint: [project-path]
 * allowed-tools:
 *   - Read
 *   - Glob
 * model: claude-opus-4-6
 * ---
 *
 * # Ava Skill
 * ...body content...
 * ```
 */
export interface SlashCommand {
  /** Command name used after the slash (e.g. "ava" for "/ava") */
  name: string;
  /** Human-readable description shown in the command picker */
  description: string;
  /** Category for grouping in the command picker */
  category?: SlashCommandCategory;
  /** Optional hint for the argument that follows the command name */
  argumentHint?: string;
  /** List of tool names this command is allowed to use */
  allowedTools?: string[];
  /** Optional model override for this command */
  model?: string;
  /** Where the command was discovered from */
  source: SlashCommandSource;
  /** Full markdown body of the command file */
  body?: string;
}

/**
 * A lightweight summary of a slash command for the ChatInput autocomplete dropdown.
 * Omits the `body` field to keep API payloads small.
 */
export type SlashCommandSummary = Omit<SlashCommand, 'body'>;

/** Lifecycle status of a subagent spawned via the Agent tool */
export type SubagentStatus = 'spawning' | 'running' | 'done' | 'failed';

/** Progress data emitted as a data-subagent chunk in the chat stream */
export interface SubagentProgress {
  subagentType: string;
  status: SubagentStatus;
  description: string;
  resultSummary: string | null;
}
