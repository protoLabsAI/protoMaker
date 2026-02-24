/**
 * Shared types for @protolabs-ai/prompts
 */

import type { UserProfile } from '@protolabs-ai/types';

/** Configuration for personified agent prompt generators */
export interface PromptConfig {
  /** Additional context to append to the prompt */
  additionalContext?: string;
  /** User profile for personalization */
  userProfile?: UserProfile;
}
