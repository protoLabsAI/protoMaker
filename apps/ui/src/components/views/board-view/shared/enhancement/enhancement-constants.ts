// Board-view uses only core EnhancementMode, not the extended project-wizard modes.
// Re-export the type from @protolabsai/types and the labels from shared (they're a superset but
// the core modes are all present).
export type { EnhancementMode } from '@protolabsai/types';

import type { EnhancementMode } from '@protolabsai/types';

/** Labels for enhancement modes displayed in the UI */
export const ENHANCEMENT_MODE_LABELS: Record<EnhancementMode, string> = {
  improve: 'Improve Clarity',
  technical: 'Add Technical Details',
  simplify: 'Simplify',
  acceptance: 'Add Acceptance Criteria',
  'ux-reviewer': 'User Experience',
};

/** Descriptions for enhancement modes (for tooltips/accessibility) */
export const ENHANCEMENT_MODE_DESCRIPTIONS: Record<EnhancementMode, string> = {
  improve: 'Make the prompt clearer and more concise',
  technical: 'Add implementation details and specifications',
  simplify: 'Reduce complexity while keeping the core intent',
  acceptance: 'Add specific acceptance criteria and test cases',
  'ux-reviewer': 'Add user experience considerations and flows',
};
