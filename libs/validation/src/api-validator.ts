/**
 * API Response Validator
 *
 * Validates responses from external APIs including:
 * - Discord API (channel creation, webhook creation)
 * - GitHub API (ruleset creation, PR operations)
 *
 * Handles rate limiting gracefully and validates response structure
 * before using data.
 */

import { z } from 'zod';
import { createLogger } from '@automaker/utils';

const logger = createLogger('APIValidator');

/**
 * Common API error response schema
 */
const APIErrorSchema = z.object({
  error: z.string(),
  message: z.string().optional(),
  code: z.union([z.string(), z.number()]).optional(),
});

/**
 * Discord API Response Schemas
 */

export const DiscordChannelSchema = z.object({
  id: z.string().min(1, 'Channel ID is required'),
  name: z.string().min(1, 'Channel name is required'),
  type: z.number(),
  guild_id: z.string().optional(),
  position: z.number().optional(),
  permission_overwrites: z.array(z.any()).optional(),
  parent_id: z.string().nullable().optional(),
  nsfw: z.boolean().optional(),
  topic: z.string().nullable().optional(),
});

export const DiscordWebhookSchema = z.object({
  id: z.string().min(1, 'Webhook ID is required'),
  type: z.number().optional(),
  guild_id: z.string().optional(),
  channel_id: z.string().min(1, 'Channel ID is required'),
  user: z.any().optional(),
  name: z.string().nullable().optional(),
  avatar: z.string().nullable().optional(),
  token: z.string().optional(),
  application_id: z.string().nullable().optional(),
  url: z.string().url('Invalid webhook URL').optional(),
});

export const DiscordCategorySchema = z.object({
  id: z.string().min(1, 'Category ID is required'),
  name: z.string().min(1, 'Category name is required'),
  type: z.literal(4), // Category type is always 4
  guild_id: z.string().optional(),
  position: z.number().optional(),
  permission_overwrites: z.array(z.any()).optional(),
});

export const DiscordRateLimitSchema = z.object({
  message: z.string(),
  retry_after: z.number(),
  global: z.boolean().optional(),
});

/**
 * GitHub API Response Schemas
 */

export const GitHubRulesetSchema = z.object({
  id: z.number(),
  name: z.string().min(1, 'Ruleset name is required'),
  source_type: z.enum(['Repository', 'Organization']).optional(),
  source: z.string().optional(),
  enforcement: z.enum(['disabled', 'active', 'evaluate']),
  target: z.string().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export const GitHubPRSchema = z.object({
  number: z.number(),
  title: z.string().min(1, 'PR title is required'),
  state: z.enum(['open', 'closed', 'merged']),
  html_url: z.string().url('Invalid PR URL'),
  user: z.object({
    login: z.string(),
    id: z.number(),
  }),
  created_at: z.string(),
  updated_at: z.string(),
  merged_at: z.string().nullable().optional(),
  head: z.object({
    ref: z.string(),
    sha: z.string(),
  }),
  base: z.object({
    ref: z.string(),
    sha: z.string(),
  }),
});

export const GitHubRateLimitSchema = z.object({
  message: z.string(),
  documentation_url: z.string().url().optional(),
});

/**
 * Validate Discord channel creation response
 */
export function validateDiscordChannel(data: unknown): {
  success: boolean;
  data?: z.infer<typeof DiscordChannelSchema>;
  errors?: string[];
  isRateLimit?: boolean;
} {
  // Check for rate limit first
  const rateLimitCheck = DiscordRateLimitSchema.safeParse(data);
  if (rateLimitCheck.success) {
    logger.warn('Discord rate limit hit:', rateLimitCheck.data);
    return {
      success: false,
      errors: [`Rate limited. Retry after ${rateLimitCheck.data.retry_after} seconds`],
      isRateLimit: true,
    };
  }

  // Check for error response
  const errorCheck = APIErrorSchema.safeParse(data);
  if (errorCheck.success) {
    return {
      success: false,
      errors: [errorCheck.data.message || errorCheck.data.error],
    };
  }

  // Validate channel data
  const result = DiscordChannelSchema.safeParse(data);
  if (result.success) {
    return {
      success: true,
      data: result.data,
    };
  }

  const errors = result.error.errors.map((err) => {
    const path = err.path.join('.');
    return path ? `${path}: ${err.message}` : err.message;
  });

  logger.error('Discord channel validation failed:', errors);
  return {
    success: false,
    errors,
  };
}

/**
 * Validate Discord webhook creation response
 */
export function validateDiscordWebhook(data: unknown): {
  success: boolean;
  data?: z.infer<typeof DiscordWebhookSchema>;
  errors?: string[];
  isRateLimit?: boolean;
} {
  // Check for rate limit first
  const rateLimitCheck = DiscordRateLimitSchema.safeParse(data);
  if (rateLimitCheck.success) {
    logger.warn('Discord rate limit hit:', rateLimitCheck.data);
    return {
      success: false,
      errors: [`Rate limited. Retry after ${rateLimitCheck.data.retry_after} seconds`],
      isRateLimit: true,
    };
  }

  // Check for error response
  const errorCheck = APIErrorSchema.safeParse(data);
  if (errorCheck.success) {
    return {
      success: false,
      errors: [errorCheck.data.message || errorCheck.data.error],
    };
  }

  // Validate webhook data
  const result = DiscordWebhookSchema.safeParse(data);
  if (result.success) {
    return {
      success: true,
      data: result.data,
    };
  }

  const errors = result.error.errors.map((err) => {
    const path = err.path.join('.');
    return path ? `${path}: ${err.message}` : err.message;
  });

  logger.error('Discord webhook validation failed:', errors);
  return {
    success: false,
    errors,
  };
}

/**
 * Validate Discord category creation response
 */
export function validateDiscordCategory(data: unknown): {
  success: boolean;
  data?: z.infer<typeof DiscordCategorySchema>;
  errors?: string[];
  isRateLimit?: boolean;
} {
  // Check for rate limit first
  const rateLimitCheck = DiscordRateLimitSchema.safeParse(data);
  if (rateLimitCheck.success) {
    logger.warn('Discord rate limit hit:', rateLimitCheck.data);
    return {
      success: false,
      errors: [`Rate limited. Retry after ${rateLimitCheck.data.retry_after} seconds`],
      isRateLimit: true,
    };
  }

  // Check for error response
  const errorCheck = APIErrorSchema.safeParse(data);
  if (errorCheck.success) {
    return {
      success: false,
      errors: [errorCheck.data.message || errorCheck.data.error],
    };
  }

  // Validate category data
  const result = DiscordCategorySchema.safeParse(data);
  if (result.success) {
    return {
      success: true,
      data: result.data,
    };
  }

  const errors = result.error.errors.map((err) => {
    const path = err.path.join('.');
    return path ? `${path}: ${err.message}` : err.message;
  });

  logger.error('Discord category validation failed:', errors);
  return {
    success: false,
    errors,
  };
}

/**
 * Validate GitHub ruleset creation response
 */
export function validateGitHubRuleset(data: unknown): {
  success: boolean;
  data?: z.infer<typeof GitHubRulesetSchema>;
  errors?: string[];
  isRateLimit?: boolean;
} {
  // Check for rate limit first
  const rateLimitCheck = GitHubRateLimitSchema.safeParse(data);
  if (rateLimitCheck.success) {
    logger.warn('GitHub rate limit hit:', rateLimitCheck.data);
    return {
      success: false,
      errors: ['GitHub API rate limit exceeded. Please try again later'],
      isRateLimit: true,
    };
  }

  // Check for error response
  const errorCheck = APIErrorSchema.safeParse(data);
  if (errorCheck.success) {
    return {
      success: false,
      errors: [errorCheck.data.message || errorCheck.data.error],
    };
  }

  // Validate ruleset data
  const result = GitHubRulesetSchema.safeParse(data);
  if (result.success) {
    return {
      success: true,
      data: result.data,
    };
  }

  const errors = result.error.errors.map((err) => {
    const path = err.path.join('.');
    return path ? `${path}: ${err.message}` : err.message;
  });

  logger.error('GitHub ruleset validation failed:', errors);
  return {
    success: false,
    errors,
  };
}

/**
 * Validate GitHub PR response
 */
export function validateGitHubPR(data: unknown): {
  success: boolean;
  data?: z.infer<typeof GitHubPRSchema>;
  errors?: string[];
  isRateLimit?: boolean;
} {
  // Check for rate limit first
  const rateLimitCheck = GitHubRateLimitSchema.safeParse(data);
  if (rateLimitCheck.success) {
    logger.warn('GitHub rate limit hit:', rateLimitCheck.data);
    return {
      success: false,
      errors: ['GitHub API rate limit exceeded. Please try again later'],
      isRateLimit: true,
    };
  }

  // Check for error response
  const errorCheck = APIErrorSchema.safeParse(data);
  if (errorCheck.success) {
    return {
      success: false,
      errors: [errorCheck.data.message || errorCheck.data.error],
    };
  }

  // Validate PR data
  const result = GitHubPRSchema.safeParse(data);
  if (result.success) {
    return {
      success: true,
      data: result.data,
    };
  }

  const errors = result.error.errors.map((err) => {
    const path = err.path.join('.');
    return path ? `${path}: ${err.message}` : err.message;
  });

  logger.error('GitHub PR validation failed:', errors);
  return {
    success: false,
    errors,
  };
}

/**
 * Generic API response validator with retry-after handling
 */
export function handleRateLimit(retryAfter: number): {
  shouldRetry: boolean;
  waitMs: number;
} {
  const maxRetryAfter = 60; // Maximum 60 seconds

  if (retryAfter > maxRetryAfter) {
    logger.error(`Rate limit retry time too long: ${retryAfter}s`);
    return {
      shouldRetry: false,
      waitMs: 0,
    };
  }

  logger.info(`Rate limited. Will retry after ${retryAfter}s`);
  return {
    shouldRetry: true,
    waitMs: retryAfter * 1000,
  };
}
