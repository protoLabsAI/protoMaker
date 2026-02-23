/**
 * Shared types for @automaker/prompts
 */

import type { UserProfile } from '@automaker/types';

/** Configuration for personified agent prompt generators */
export interface PromptConfig {
  /** Additional context to append to the prompt */
  additionalContext?: string;
  /** User profile for personalization */
  userProfile?: UserProfile;
}
