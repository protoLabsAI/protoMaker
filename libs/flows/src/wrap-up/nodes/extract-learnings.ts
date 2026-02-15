/**
 * Extract Learnings Node — Collect memory + synthesize learnings
 *
 * 1. Reads .automaker/memory/*.md files
 * 2. Sends them to an LLM for synthesis into structured learnings
 * 3. Returns both raw memory entries and structured learning items
 */

import type { WrapUpState, MemoryFileEntry, StructuredLearning } from '../types.js';

/**
 * Interface for collecting memory files from disk.
 * Server injects real fs implementation; tests use mock.
 */
export interface MemoryCollector {
  collectMemoryFiles(projectPath: string): Promise<MemoryFileEntry[]>;
}

/**
 * Interface for synthesizing learnings from memory entries.
 * Server injects real LLM implementation; tests use mock.
 */
export interface LearningSynthesizer {
  synthesize(
    projectTitle: string,
    memoryEntries: MemoryFileEntry[],
    retrospective: string
  ): Promise<{
    summary: string;
    learnings: StructuredLearning[];
  }>;
}

/** Default mock memory collector */
const mockCollector: MemoryCollector = {
  async collectMemoryFiles(_projectPath) {
    return [];
  },
};

/** Default mock synthesizer */
const mockSynthesizer: LearningSynthesizer = {
  async synthesize(projectTitle, _memoryEntries, _retrospective) {
    return {
      summary: `Learning summary for ${projectTitle}: No memory entries to synthesize.`,
      learnings: [],
    };
  },
};

export function createExtractLearningsNode(
  collector?: MemoryCollector,
  synthesizer?: LearningSynthesizer
) {
  const memCollector = collector || mockCollector;
  const learnSynth = synthesizer || mockSynthesizer;

  return async (state: WrapUpState): Promise<Partial<WrapUpState>> => {
    const { input, retrospective } = state;

    // Collect memory files
    const memoryEntries = await memCollector.collectMemoryFiles(input.projectPath);

    // Synthesize learnings (even if no memory files, the retro provides context)
    const { summary, learnings } = await learnSynth.synthesize(
      input.projectTitle,
      memoryEntries,
      retrospective || ''
    );

    return {
      stage: 'extracting_learnings',
      memoryEntries,
      learningSummary: summary,
      learnings,
    };
  };
}

export const extractLearningsNode = createExtractLearningsNode();
