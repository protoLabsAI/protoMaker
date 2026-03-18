/**
 * PromptBuilder
 *
 * A composable builder for constructing structured prompts from named sections.
 * Supports phase filtering, conditional inclusion, and priority-based ordering.
 *
 * Usage:
 *   import { PromptBuilder, SectionName } from '@protolabsai/prompts';
 *
 *   const prompt = new PromptBuilder()
 *     .setPhase('planning')
 *     .addSection(SectionName.TASK, 'Implement the feature', { priority: 1 })
 *     .addSection(SectionName.CONTEXT, 'Background info', { phase: 'planning', priority: 2 })
 *     .build();
 */

/** Standard section names for well-known prompt sections */
export enum SectionName {
  ENVIRONMENT = 'ENVIRONMENT',
  TASK = 'TASK',
  CONTEXT = 'CONTEXT',
  TOOLS = 'TOOLS',
  CODING_STANDARDS = 'CODING_STANDARDS',
  TESTING = 'TESTING',
  COMMIT_RULES = 'COMMIT_RULES',
  COMMUNICATION = 'COMMUNICATION',
  TRAJECTORY_CONTEXT = 'TRAJECTORY_CONTEXT',
}

/** Options for a prompt section */
export interface SectionOptions {
  /** Only include this section when the current phase matches */
  phase?: string | string[];
  /** Section ordering — lower numbers appear first (default: 0) */
  priority?: number;
  /** Dynamic inclusion predicate — section is excluded when this returns false */
  conditional?: () => boolean;
}

interface SectionEntry {
  content: string;
  options: SectionOptions;
}

/**
 * Builds a structured prompt string from named, optionally filtered sections.
 */
export class PromptBuilder {
  private sections: Map<string, SectionEntry> = new Map();
  private currentPhase?: string;

  /**
   * Set the active phase for this builder instance.
   * Sections that specify a phase filter will only be included when the phase matches.
   */
  setPhase(phase: string): this {
    this.currentPhase = phase;
    return this;
  }

  /**
   * Add or replace a named section.
   *
   * @param name    Section name (use SectionName enum for standard sections)
   * @param content The text content for this section
   * @param options Optional filtering / ordering options
   */
  addSection(name: string, content: string, options: SectionOptions = {}): this {
    this.sections.set(name, { content, options });
    return this;
  }

  /**
   * Remove a named section if it exists.
   */
  removeSection(name: string): this {
    this.sections.delete(name);
    return this;
  }

  /**
   * Check whether a named section is currently registered.
   */
  hasSection(name: string): boolean {
    return this.sections.has(name);
  }

  /**
   * Build and return the final prompt string.
   *
   * Processing order:
   * 1. Filter by phase (skip sections whose phase filter doesn't match current phase)
   * 2. Filter by conditional (skip sections whose conditional() returns false)
   * 3. Sort by priority (lower number = earlier position; default priority = 0)
   * 4. Format each section as `## SECTION_NAME\n\ncontent`
   * 5. Join with `\n\n---\n\n`
   */
  build(): string {
    const included: Array<{ name: string; entry: SectionEntry }> = [];

    for (const [name, entry] of this.sections) {
      // Phase filter
      if (entry.options.phase !== undefined) {
        const phases = Array.isArray(entry.options.phase)
          ? entry.options.phase
          : [entry.options.phase];
        if (this.currentPhase === undefined || !phases.includes(this.currentPhase)) {
          continue;
        }
      }

      // Conditional filter
      if (entry.options.conditional !== undefined && !entry.options.conditional()) {
        continue;
      }

      included.push({ name, entry });
    }

    // Sort by priority (lower = earlier); sections without priority default to 0
    included.sort((a, b) => {
      const pa = a.entry.options.priority ?? 0;
      const pb = b.entry.options.priority ?? 0;
      return pa - pb;
    });

    return included.map(({ name, entry }) => `## ${name}\n\n${entry.content}`).join('\n\n---\n\n');
  }
}
