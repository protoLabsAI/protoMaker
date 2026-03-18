import type { EnhancementMode as CoreEnhancementMode } from '@protolabsai/types';

/** Enhancement modes — extends core modes with project-specific ones */
export type EnhancementMode = CoreEnhancementMode | 'expand' | 'research';

/** Labels for enhancement modes displayed in the UI */
export const ENHANCEMENT_MODE_LABELS: Record<EnhancementMode, string> = {
  improve: 'Improve Clarity',
  technical: 'Add Technical Details',
  simplify: 'Simplify',
  acceptance: 'Add Acceptance Criteria',
  'ux-reviewer': 'User Experience',
  expand: 'Expand & Detail',
  research: 'Research & Enrich',
};

/** Descriptions for enhancement modes (for tooltips/accessibility) */
export const ENHANCEMENT_MODE_DESCRIPTIONS: Record<EnhancementMode, string> = {
  improve: 'Make the prompt clearer and more concise',
  technical: 'Add implementation details and specifications',
  simplify: 'Reduce complexity while keeping the core intent',
  acceptance: 'Add specific acceptance criteria and test cases',
  'ux-reviewer': 'Add user experience considerations and flows',
  expand: 'Expand with more detail, context, and specificity',
  research: 'Enrich with research findings and industry best practices',
};
