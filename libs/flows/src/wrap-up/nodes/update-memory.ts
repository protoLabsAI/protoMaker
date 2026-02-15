/**
 * Update Memory Node — Persist learnings to disk
 *
 * 1. Writes PROJECT_LEARNINGS.md to project root
 * 2. Appends structured learnings to .automaker/memory/ category files
 * 3. Posts completion update to Linear (if configured)
 *
 * Pure I/O node — no LLM calls.
 */

import type { WrapUpState, StructuredLearning } from '../types.js';

/**
 * Interface for persisting learnings to disk and external systems.
 * Server injects real implementation with fs + Linear; tests use mock.
 */
export interface MemoryPersister {
  /** Write PROJECT_LEARNINGS.md to project root */
  storeSummary(projectPath: string, projectTitle: string, summary: string): Promise<void>;

  /** Append structured learnings to .automaker/memory/ category files */
  persistLearnings(
    projectPath: string,
    projectTitle: string,
    learnings: StructuredLearning[]
  ): Promise<number>;

  /** Post completion update to Linear (best-effort) */
  postToLinear?(projectPath: string, projectTitle: string): Promise<void>;
}

/** Default mock persister */
const mockPersister: MemoryPersister = {
  async storeSummary() {},
  async persistLearnings(_path, _title, learnings) {
    return learnings.length;
  },
};

export function createUpdateMemoryNode(persister?: MemoryPersister) {
  const impl = persister || mockPersister;

  return async (state: WrapUpState): Promise<Partial<WrapUpState>> => {
    const { input, learningSummary, learnings } = state;
    const errors: string[] = [];

    // Store the learning summary
    if (learningSummary) {
      try {
        await impl.storeSummary(input.projectPath, input.projectTitle, learningSummary);
      } catch (error) {
        errors.push(`Failed to store learning summary: ${error}`);
      }
    }

    // Persist structured learnings to memory files
    try {
      await impl.persistLearnings(input.projectPath, input.projectTitle, learnings);
    } catch (error) {
      errors.push(`Failed to persist learnings: ${error}`);
    }

    // Post to Linear (best-effort)
    if (impl.postToLinear) {
      try {
        await impl.postToLinear(input.projectPath, input.projectTitle);
      } catch {
        // Non-blocking — Linear post failure doesn't stop the flow
      }
    }

    return {
      stage: 'updating_memory',
      errors: errors.length > 0 ? errors : undefined,
    };
  };
}

export const updateMemoryNode = createUpdateMemoryNode();
