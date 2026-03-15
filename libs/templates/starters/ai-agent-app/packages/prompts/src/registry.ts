/**
 * PromptRegistry — register and resolve prompts by role.
 *
 * Ships empty — prompts are loaded at runtime by the PromptLoader from the
 * project's `prompts/` directory (git-versioned markdown files).
 *
 * @example
 * ```typescript
 * import { PromptRegistry } from './registry.js';
 *
 * const registry = new PromptRegistry();
 *
 * // Register a prompt directly
 * registry.registerPrompt({
 *   role: 'assistant',
 *   name: 'General Assistant',
 *   version: '1.0.0',
 *   template: 'You are a helpful assistant. Today is {{date}}.',
 *   variables: ['date'],
 * });
 *
 * // Resolve and interpolate
 * const prompt = registry.createPromptFromTemplate('assistant', { date: '2026-01-01' });
 * ```
 */

import type { PromptEntry } from './types.js';

export class PromptRegistry {
  private prompts: Map<string, PromptEntry> = new Map();

  /**
   * Register a prompt. Overwrites any previously registered prompt for the
   * same role (last registration wins — useful for hot-reloading from disk).
   */
  registerPrompt(entry: PromptEntry): void {
    this.prompts.set(entry.role, entry);
  }

  /**
   * Register multiple prompts at once.
   */
  registerMany(entries: PromptEntry[]): void {
    for (const entry of entries) {
      this.registerPrompt(entry);
    }
  }

  /**
   * Get the raw prompt entry for a role.
   *
   * Returns undefined if no prompt is registered for the role.
   */
  getPromptForRole(role: string): PromptEntry | undefined {
    return this.prompts.get(role);
  }

  /**
   * Interpolate a registered prompt template for a role, substituting
   * `{{variable}}` placeholders with the provided values.
   *
   * Returns undefined if no prompt is registered for the role.
   *
   * @example
   * ```typescript
   * const result = registry.createPromptFromTemplate('assistant', {
   *   date: '2026-01-01',
   *   userName: 'Alice',
   * });
   * ```
   */
  createPromptFromTemplate(
    role: string,
    variables: Record<string, string> = {}
  ): string | undefined {
    const entry = this.prompts.get(role);
    if (!entry) return undefined;

    return interpolate(entry.template, variables);
  }

  /**
   * Check whether a prompt is registered for a role.
   */
  hasPrompt(role: string): boolean {
    return this.prompts.has(role);
  }

  /**
   * List all registered role keys.
   */
  listRoles(): string[] {
    return Array.from(this.prompts.keys());
  }

  /**
   * List all registered prompt entries.
   */
  listPrompts(): PromptEntry[] {
    return Array.from(this.prompts.values());
  }

  /**
   * Unregister a prompt by role.
   *
   * Returns true if the prompt was found and removed.
   */
  unregisterPrompt(role: string): boolean {
    return this.prompts.delete(role);
  }

  /**
   * Clear all registered prompts.
   */
  clear(): void {
    this.prompts.clear();
  }

  /**
   * Number of registered prompts.
   */
  get size(): number {
    return this.prompts.size;
  }
}

// ---------------------------------------------------------------------------
// Template interpolation
// ---------------------------------------------------------------------------

/**
 * Replace `{{variable}}` placeholders in a template string with provided values.
 *
 * Unrecognised placeholders are left as-is.
 *
 * @example
 * ```typescript
 * interpolate('Hello, {{name}}!', { name: 'Alice' });
 * // => 'Hello, Alice!'
 * ```
 */
export function interpolate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    return Object.prototype.hasOwnProperty.call(variables, key) ? variables[key] : `{{${key}}}`;
  });
}
