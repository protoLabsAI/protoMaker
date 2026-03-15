/**
 * PromptBuilder — section-based prompt composition.
 *
 * Assembles a final prompt string from named sections, applying priority
 * ordering, phase filtering, and conditional inclusion.
 *
 * @example
 * ```typescript
 * const prompt = new PromptBuilder()
 *   .setPhase('EXECUTE')
 *   .addSection(SectionName.ROLE, 'You are a helpful assistant.', { priority: 1 })
 *   .addSection(SectionName.TASK, 'Answer the user's question.', { priority: 2 })
 *   .addSection(SectionName.CONTEXT, 'Context about the project.', {
 *     priority: 3,
 *     phase: 'PLAN',  // excluded from EXECUTE phase
 *   })
 *   .build();
 * ```
 */

import type { SectionOptions, PromptSection } from './types.js';
import { SectionName } from './types.js';

const SECTION_SEPARATOR = '\n\n---\n\n';
const DEFAULT_PRIORITY = 100;

export class PromptBuilder {
  private sections: PromptSection[] = [];
  private currentPhase: string | null = null;

  /**
   * Set the active phase. Sections whose `phase` option doesn't include this
   * phase will be excluded from the built prompt.
   */
  setPhase(phase: string): this {
    this.currentPhase = phase;
    return this;
  }

  /**
   * Add a named section to the prompt.
   *
   * @param name    - A SectionName enum value or any custom string key.
   * @param content - The section content (markdown supported).
   * @param options - Priority, phase filter, and conditional options.
   */
  addSection(name: SectionName | string, content: string, options: SectionOptions = {}): this {
    const { priority = DEFAULT_PRIORITY, phase, conditional } = options;

    this.sections.push({
      name,
      content,
      options: { priority, phase, conditional },
    });

    return this;
  }

  /**
   * Build the final prompt string.
   *
   * Sections are sorted by priority (ascending), filtered by phase and
   * conditional predicates, then joined with a section separator.
   */
  build(): string {
    const filtered = this.sections
      .filter((section) => this.shouldInclude(section))
      .sort((a, b) => a.options.priority - b.options.priority);

    return filtered
      .map((section) => `## ${section.name}\n\n${section.content}`)
      .join(SECTION_SEPARATOR);
  }

  /**
   * Clear all sections and reset the phase.
   */
  reset(): this {
    this.sections = [];
    this.currentPhase = null;
    return this;
  }

  /**
   * Return the number of sections currently added.
   */
  get sectionCount(): number {
    return this.sections.length;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private shouldInclude(section: PromptSection): boolean {
    // Conditional predicate — skip if it returns false
    if (section.options.conditional && !section.options.conditional()) {
      return false;
    }

    // Phase filter — skip if phase is set and current phase not in the list
    if (section.options.phase && this.currentPhase) {
      const phases = Array.isArray(section.options.phase)
        ? section.options.phase
        : [section.options.phase];

      if (!phases.includes(this.currentPhase)) {
        return false;
      }
    }

    return true;
  }
}

export { SectionName };
