/**
 * Enhancement Prompts - Re-exported from @protolabs-ai/prompts
 *
 * This file now re-exports enhancement prompts from the shared @protolabs-ai/prompts package
 * to maintain backward compatibility with existing imports in the server codebase.
 */

export {
  IMPROVE_SYSTEM_PROMPT,
  TECHNICAL_SYSTEM_PROMPT,
  SIMPLIFY_SYSTEM_PROMPT,
  ACCEPTANCE_SYSTEM_PROMPT,
  IMPROVE_EXAMPLES,
  TECHNICAL_EXAMPLES,
  SIMPLIFY_EXAMPLES,
  ACCEPTANCE_EXAMPLES,
  getEnhancementPrompt,
  getSystemPrompt,
  getExamples,
  buildUserPrompt,
  isValidEnhancementMode,
  getAvailableEnhancementModes,
} from '@protolabs-ai/prompts';

export type { EnhancementMode, EnhancementExample } from '@protolabs-ai/prompts';
