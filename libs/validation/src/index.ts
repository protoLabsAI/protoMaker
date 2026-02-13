/**
 * @automaker/validation
 *
 * Runtime validation library for external data.
 *
 * Provides:
 * - Zod schemas for configuration validation
 * - API response validators (Discord, GitHub)
 * - Template variable validation
 * - Filesystem path validation
 *
 * Usage:
 * ```ts
 * import { validateProtolabConfig } from '@automaker/validation';
 *
 * const result = validateProtolabConfig(configData);
 * if (!result.success) {
 *   console.error('Config validation failed:', result.errors);
 * }
 * ```
 */

// Re-export schemas
export {
  ProtolabConfigSchema,
  DiscordChannelConfigSchema,
  TemplateVariablesSchema,
  ProjectNameSchema,
  validateProtolabConfig,
  validateTemplateVariables as validateTemplateVariablesSchema,
  validateProjectName,
  type ValidatedProtolabConfig,
} from './schemas.js';

// Re-export API validators
export {
  DiscordChannelSchema,
  DiscordWebhookSchema,
  DiscordCategorySchema,
  DiscordRateLimitSchema,
  GitHubRulesetSchema,
  GitHubPRSchema,
  GitHubRateLimitSchema,
  validateDiscordChannel,
  validateDiscordWebhook,
  validateDiscordCategory,
  validateGitHubRuleset,
  validateGitHubPR,
  handleRateLimit,
} from './api-validator.js';

// Re-export template validators
export {
  extractTemplateVariables,
  validateTemplateVariables,
  renderTemplate,
  validateVariableType,
  validateTemplates,
  hasTemplateVariables,
} from './template-validator.js';

// Re-export filesystem validators
export {
  validatePathWithinRoot,
  validatePathExists,
  validateRequiredFiles,
  validateDirectoryReadable,
  validateTemplateStructure,
  validatePathSafe,
  validateGitRepository,
  validateFileReadable,
} from './filesystem-validator.js';
