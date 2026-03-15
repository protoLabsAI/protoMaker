/**
 * Slash Command Registry
 *
 * Defines the SlashCommand interface and a simple in-memory registry for
 * command registration and lookup.
 *
 * Usage:
 *   1. Define commands using `registerCommand()` (see commands/example.ts)
 *   2. Detect `/command args` in chat messages using `parseSlashCommand()`
 *   3. Expand to a system prompt prefix with `cmd.expand(args)`
 *
 * Wire into chat route:
 *   const parsed = parseSlashCommand(lastUserMessage);
 *   if (parsed) {
 *     const cmd = getCommand(parsed.name);
 *     if (cmd) systemPrompt = cmd.expand(parsed.args) + '\n\n' + (systemPrompt ?? '');
 *   }
 */

// ─── Interface ────────────────────────────────────────────────────────────────

/**
 * A slash command that expands into a system prompt prefix.
 *
 * When a user types `/name [args]` in the chat input, the command's
 * `expand()` function is called with the remaining text.  The returned string
 * is prepended to the system prompt so the model receives additional
 * instructions before the conversation messages.
 */
export interface SlashCommand {
  /** Unique command name (without the leading slash). e.g. "summarize" */
  name: string;
  /** Short description shown in the autocomplete dropdown. */
  description: string;
  /**
   * Expand the command into a system-prompt addition.
   *
   * @param args  Everything after `/name ` in the user's message.
   * @returns     A string that will be prepended to the system prompt.
   */
  expand: (args: string) => string;
}

// ─── Registry ─────────────────────────────────────────────────────────────────

const registry = new Map<string, SlashCommand>();

/**
 * Register a slash command.  If a command with the same name already exists
 * it will be overwritten.
 */
export function registerCommand(cmd: SlashCommand): void {
  registry.set(cmd.name, cmd);
}

/**
 * Look up a command by name (without the leading slash).
 * Returns `undefined` if no command is registered under that name.
 */
export function getCommand(name: string): SlashCommand | undefined {
  return registry.get(name);
}

/**
 * Return all registered commands as an array, sorted alphabetically by name.
 */
export function listCommands(): SlashCommand[] {
  return Array.from(registry.values()).sort((a, b) => a.name.localeCompare(b.name));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parse a `/command [args]` prefix from a chat message.
 *
 * Returns `{ name, args }` if the message starts with a slash command,
 * or `null` if it does not.
 *
 * Examples:
 *   parseSlashCommand('/summarize')            → { name: 'summarize', args: '' }
 *   parseSlashCommand('/translate to Spanish') → { name: 'translate', args: 'to Spanish' }
 *   parseSlashCommand('Hello, world!')          → null
 */
export function parseSlashCommand(message: string): { name: string; args: string } | null {
  const trimmed = message.trimStart();
  const match = trimmed.match(/^\/([a-zA-Z][\w-]*)(?:\s+([\s\S]*))?$/);
  if (!match) return null;
  return { name: match[1]!, args: (match[2] ?? '').trim() };
}
