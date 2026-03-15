/**
 * @@PROJECT_NAME-prompts
 *
 * Git-versioned prompt templates with section-based composition and a
 * role-keyed registry. Load prompts from the project's `prompts/` directory
 * and resolve them at runtime with `{{variable}}` interpolation.
 *
 * @example
 * ```typescript
 * import { PromptRegistry, PromptLoader, PromptBuilder, SectionName } from '@@PROJECT_NAME-prompts';
 * import path from 'node:path';
 *
 * // Load prompts from disk
 * const registry = new PromptRegistry();
 * const loader = new PromptLoader(registry);
 * await loader.loadDirectory(path.join(process.cwd(), 'prompts'));
 *
 * // Resolve a prompt for a role
 * const systemPrompt = registry.createPromptFromTemplate('assistant', {
 *   date: new Date().toDateString(),
 * });
 *
 * // Or compose a prompt programmatically
 * const composed = new PromptBuilder()
 *   .setPhase('EXECUTE')
 *   .addSection(SectionName.ROLE, 'You are a code reviewer.', { priority: 1 })
 *   .addSection(SectionName.TASK, 'Review the PR for quality issues.', { priority: 2 })
 *   .build();
 * ```
 */

export { PromptBuilder, SectionName } from './builder.js';
export { PromptRegistry, interpolate } from './registry.js';
export { PromptLoader, parsePromptFile } from './loader.js';
export type {
  SectionOptions,
  PromptSection,
  PromptFrontmatter,
  ParsedPrompt,
  PromptEntry,
} from './types.js';
