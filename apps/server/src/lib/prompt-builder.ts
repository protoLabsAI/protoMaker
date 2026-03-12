/**
 * PromptBuilder - Modular prompt construction with named sections and phase awareness.
 *
 * Supports three execution phases:
 * - EXECUTE: Coding standards, commit rules, verification instructions
 * - PLAN: Analysis and architecture sections
 * - REVIEW: Review criteria and quality checks
 *
 * Sections can be restricted to specific phases. Sections without a phase list
 * are included in all phases.
 */

/**
 * Execution phase that determines which prompt sections are included.
 */
export type ExecutionPhase = 'EXECUTE' | 'PLAN' | 'REVIEW';

/**
 * A named section of a prompt, optionally scoped to specific phases.
 */
interface PromptSection {
  /** Unique name identifying this section (e.g. 'FEATURE_HEADER', 'CONTEXT') */
  name: string;
  /** The text content of this section */
  content: string;
  /**
   * Optional list of phases this section applies to.
   * If omitted, the section is included in all phases.
   */
  phases?: ExecutionPhase[];
}

/**
 * Builds a prompt from named sections, with optional phase-aware filtering.
 *
 * Usage:
 * ```ts
 * const prompt = new PromptBuilder('EXECUTE')
 *   .addSection('CONTEXT', contextContent)
 *   .addSection('FEATURE_HEADER', headerContent)
 *   .addSection('CODING_STANDARDS', standardsContent, ['EXECUTE'])
 *   .build();
 * ```
 */
export class PromptBuilder {
  private sections: PromptSection[] = [];
  private phase: ExecutionPhase;

  /**
   * @param phase The execution phase for this prompt. Defaults to 'EXECUTE'.
   */
  constructor(phase: ExecutionPhase = 'EXECUTE') {
    this.phase = phase;
  }

  /**
   * Add a named section to the prompt.
   *
   * Sections with empty or whitespace-only content are silently skipped.
   *
   * @param name    Section identifier (e.g. 'CONTEXT', 'CODING_STANDARDS')
   * @param content Text content of the section
   * @param phases  Optional phase filter — section is only included when the builder's
   *                phase matches one of these values. Omit to include in all phases.
   * @returns this (fluent interface)
   */
  addSection(name: string, content: string, phases?: ExecutionPhase[]): this {
    if (content && content.trim()) {
      this.sections.push({ name, content, phases });
    }
    return this;
  }

  /**
   * Assemble the final prompt string from all sections that pass the phase filter.
   *
   * Sections are concatenated in insertion order.
   */
  build(): string {
    return this.sections
      .filter((s) => !s.phases || s.phases.includes(this.phase))
      .map((s) => s.content)
      .join('');
  }
}
