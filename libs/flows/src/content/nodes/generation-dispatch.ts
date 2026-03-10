/**
 * Generation Dispatch and Collection Nodes
 *
 * Implements parallel section generation via Send() dispatch pattern.
 * Dispatcher fans out to SectionWriter subgraph, collector aggregates results.
 */

import { Send, Command } from '@langchain/langgraph';
import type { RunnableConfig } from '@langchain/core/runnables';
import { createLogger } from '@protolabsai/utils';
import { copilotkitEmitState, emitHeartbeat } from '../copilotkit-utils.js';

const logger = createLogger('generation-dispatch');

/**
 * Section specification for generation
 */
export interface SectionSpec {
  id: string;
  title: string;
  position: number; // Position in outline (0-indexed)
  description?: string;
  wordCount?: number;
}

/**
 * Research data subset for a section
 */
export interface ResearchSubset {
  facts: string[];
  quotes?: string[];
  references?: string[];
}

/**
 * Generated section result
 */
export interface GeneratedSection {
  sectionId: string;
  position: number;
  content: string;
  wordCount: number;
  success: boolean;
  error?: string;
}

/**
 * Outline structure
 */
export interface Outline {
  sections: SectionSpec[];
  totalSections: number;
}

/**
 * State for generation dispatch
 */
export interface GenerationState {
  outline: Outline;
  research: Record<string, ResearchSubset>; // Keyed by section ID
  sections: GeneratedSection[]; // Accumulated via appendReducer
  failedSections?: string[]; // Section IDs that failed
  isComplete?: boolean;
  config?: RunnableConfig;
}

/**
 * Dispatcher Node - Returns Send[] for parallel section generation
 *
 * Takes the approved outline and creates a Send() for each section,
 * routing to the SectionWriter subgraph with section spec + research subset.
 *
 * @param state - Current generation state with outline and research
 * @returns Command with Send[] for each section
 */
export async function generationDispatchNode(state: GenerationState): Promise<Command> {
  const { outline, research, config } = state;
  const sends: Send[] = [];

  // Emit state to CopilotKit
  if (config) {
    await copilotkitEmitState(config, {
      currentActivity: 'Dispatching parallel section generation',
      progress: 0,
    });
  }

  // Create a Send for each section in the outline
  for (const section of outline.sections) {
    // Extract relevant research for this section
    const researchSubset = research[section.id] || {
      facts: [],
      quotes: [],
      references: [],
    };

    // Create Send to section_writer node with isolated state
    sends.push(
      new Send('section_writer', {
        sectionSpec: section,
        research: researchSubset,
        // Preserve parent state fields as needed
        outline,
      })
    );
  }

  // Emit heartbeat
  if (config) {
    await emitHeartbeat(config, `Dispatched ${sends.length} sections for generation`);
  }

  // Return Command with goto Send array for parallel dispatch
  return new Command({ goto: sends });
}

/**
 * Collector Node - Aggregates sections from parallel generation
 *
 * Receives all sections via appendReducer, orders them by outline position,
 * validates completeness, and handles partial failures.
 *
 * @param state - State with accumulated sections array
 * @returns Updated state with ordered sections and failure reporting
 */
export async function generationCollectorNode(
  state: GenerationState
): Promise<Partial<GenerationState>> {
  const { outline, sections, config } = state;

  // Emit state to CopilotKit
  if (config) {
    await copilotkitEmitState(config, {
      currentActivity: 'Collecting generated sections',
      progress: 50,
    });
  }

  // Validate section count
  const expectedCount = outline.totalSections;
  const receivedCount = sections.length;

  if (receivedCount !== expectedCount) {
    logger.warn(`Section count mismatch: expected ${expectedCount}, received ${receivedCount}`);
  }

  // Sort sections by outline position
  const orderedSections = [...sections].sort((a, b) => a.position - b.position);

  // Identify failed sections
  const failedSections = orderedSections.filter((s) => !s.success).map((s) => s.sectionId);

  // Identify missing sections (expected but not received)
  const receivedIds = new Set(orderedSections.map((s) => s.sectionId));
  const expectedIds = outline.sections.map((s) => s.id);
  const missingSections = expectedIds.filter((id) => !receivedIds.has(id));

  // Combine failed and missing
  const allFailedSections = [...failedSections, ...missingSections];

  // Determine if generation is complete
  const isComplete = receivedCount === expectedCount && allFailedSections.length === 0;

  // Log results
  if (isComplete) {
    logger.info(
      `Generation complete: ${receivedCount}/${expectedCount} sections generated successfully`
    );
  } else {
    logger.warn(`Partial failure: ${receivedCount}/${expectedCount} sections received`);
    if (failedSections.length > 0) {
      logger.warn(`  Failed sections: ${failedSections.join(', ')}`);
    }
    if (missingSections.length > 0) {
      logger.warn(`  Missing sections: ${missingSections.join(', ')}`);
    }
  }

  // Emit completion state
  if (config) {
    await copilotkitEmitState(config, {
      currentActivity: isComplete
        ? 'Section generation complete'
        : 'Section generation partially complete',
      progress: 100,
    });
  }

  return {
    sections: orderedSections,
    failedSections: allFailedSections.length > 0 ? allFailedSections : undefined,
    isComplete,
  };
}

/**
 * Helper to extract research subset for a section
 * Can be used by dispatcher or externally for research routing
 */
export function extractResearchForSection(
  allResearch: Record<string, ResearchSubset>,
  sectionId: string
): ResearchSubset {
  return (
    allResearch[sectionId] || {
      facts: [],
      quotes: [],
      references: [],
    }
  );
}

/**
 * Helper to validate outline completeness
 */
export function validateOutline(outline: Outline): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!outline.sections || outline.sections.length === 0) {
    errors.push('Outline has no sections');
  }

  if (outline.totalSections !== outline.sections.length) {
    errors.push(
      `Total sections (${outline.totalSections}) does not match sections array length (${outline.sections.length})`
    );
  }

  // Check for duplicate positions
  const positions = outline.sections.map((s) => s.position);
  const uniquePositions = new Set(positions);
  if (positions.length !== uniquePositions.size) {
    errors.push('Duplicate section positions detected');
  }

  // Check for gaps in positions (should be 0, 1, 2, ...)
  const sortedPositions = [...positions].sort((a, b) => a - b);
  for (let i = 0; i < sortedPositions.length; i++) {
    if (sortedPositions[i] !== i) {
      errors.push(`Position gap detected: expected ${i}, found ${sortedPositions[i]}`);
      break;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Helper to create a failure report for partial failures
 */
export function createFailureReport(state: GenerationState): {
  totalSections: number;
  successfulSections: number;
  failedSections: string[];
  successRate: number;
  canRetry: boolean;
} {
  const { outline, sections, failedSections = [] } = state;

  const successfulSections = sections.filter((s) => s.success).length;
  const totalSections = outline.totalSections;
  const successRate = totalSections > 0 ? successfulSections / totalSections : 0;

  return {
    totalSections,
    successfulSections,
    failedSections,
    successRate,
    canRetry: failedSections.length > 0,
  };
}
