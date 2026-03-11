/**
 * Chat types for the slash command system.
 *
 * SlashCommand represents a discoverable command that can be invoked
 * via the `/command-name` syntax in the chat UI.
 */

/** Where the command was discovered from */
export type SlashCommandSource =
  | 'built-in' // Hardcoded commands (compact, clear, new)
  | 'mcp-plugin' // packages/mcp-server/plugins/automaker/commands/*.md
  | 'learned-skill' // .automaker/skills/*.md
  | 'project-skill'; // .claude/skills/*.md

/**
 * A slash command that can be invoked from the chat interface.
 *
 * Built-in commands (compact, clear, new) are registered without filesystem backing.
 * File-backed commands are parsed from markdown files with YAML frontmatter:
 *
 * ```markdown
 * ---
 * name: ava
 * description: Activates AVA, your Autonomous Virtual Agency.
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
  /** Optional hint for the argument that follows the command name */
  argumentHint?: string;
  /** List of tool names this command is allowed to use */
  allowedTools?: string[];
  /** Optional model override for this command */
  model?: string;
  /** Where the command was discovered from */
  source: SlashCommandSource;
  /** Full markdown body of the command file (undefined for built-in commands) */
  body?: string;
}
