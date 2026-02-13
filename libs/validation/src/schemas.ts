/**
 * Zod Schemas for Runtime Validation
 *
 * Provides Zod schemas for validating external data including:
 * - protolab.config.json structure
 * - Configuration objects
 * - User inputs
 *
 * All schemas provide helpful error messages for validation failures.
 */

import { z } from 'zod';

/**
 * Schema for protolab.config.json
 *
 * Validates the structure matches ProtolabConfig type from @automaker/types.
 * Required fields: name, version, protolab.enabled
 * Discord fields are optional but validated if present.
 */
export const ProtolabConfigSchema = z.object({
  name: z.string().min(1, 'Project name is required and cannot be empty'),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Version must be in semver format (e.g., 1.0.0)'),
  protolab: z.object({
    enabled: z.boolean({
      required_error: 'protolab.enabled is required',
      invalid_type_error: 'protolab.enabled must be a boolean',
    }),
  }),
  techStack: z
    .object({
      language: z.string().optional(),
      framework: z.string().optional(),
      packageManager: z.string().optional(),
    })
    .optional(),
  commands: z
    .object({
      build: z.string().optional(),
      test: z.string().optional(),
      format: z.string().optional(),
      lint: z.string().optional(),
      dev: z.string().optional(),
    })
    .optional(),
  discord: z
    .object({
      categoryId: z.string().min(1, 'Discord category ID cannot be empty').optional(),
      channels: z.record(z.string(), z.string()).optional(),
      webhookId: z.string().min(1, 'Discord webhook ID cannot be empty').optional(),
    })
    .optional(),
  standard: z
    .object({
      skip: z.array(z.string()).optional(),
      additional: z.array(z.string()).optional(),
    })
    .optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Type inference from schema
 */
export type ValidatedProtolabConfig = z.infer<typeof ProtolabConfigSchema>;

/**
 * Validate protolab.config.json data
 *
 * @param data - Raw data to validate
 * @returns Validation result with parsed data or formatted error messages
 */
export function validateProtolabConfig(data: unknown): {
  success: boolean;
  data?: ValidatedProtolabConfig;
  errors?: string[];
} {
  const result = ProtolabConfigSchema.safeParse(data);

  if (result.success) {
    return {
      success: true,
      data: result.data,
    };
  }

  // Format Zod errors into helpful messages
  const errors = result.error.errors.map((err) => {
    const path = err.path.join('.');
    return path ? `${path}: ${err.message}` : err.message;
  });

  return {
    success: false,
    errors,
  };
}

/**
 * Schema for Discord channel configuration
 */
export const DiscordChannelConfigSchema = z.object({
  categoryId: z.string().min(1, 'Category ID is required'),
  channels: z
    .record(z.string(), z.string().min(1, 'Channel ID cannot be empty'))
    .refine((channels) => Object.keys(channels).length > 0, 'At least one channel is required'),
});

/**
 * Schema for template variables
 */
export const TemplateVariablesSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean()], {
    errorMap: () => ({ message: 'Template variable must be a string, number, or boolean' }),
  })
);

/**
 * Validate template variables
 *
 * @param variables - Variables object to validate
 * @returns Validation result
 */
export function validateTemplateVariables(variables: unknown): {
  success: boolean;
  data?: Record<string, string | number | boolean>;
  errors?: string[];
} {
  const result = TemplateVariablesSchema.safeParse(variables);

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

  return {
    success: false,
    errors,
  };
}

/**
 * Schema for project name validation
 */
export const ProjectNameSchema = z
  .string()
  .min(1, 'Project name cannot be empty')
  .max(100, 'Project name must be less than 100 characters')
  .regex(/^[a-z0-9-]+$/, 'Project name must contain only lowercase letters, numbers, and hyphens')
  .refine((name) => !name.startsWith('-') && !name.endsWith('-'), {
    message: 'Project name cannot start or end with a hyphen',
  });

/**
 * Validate project name
 */
export function validateProjectName(name: unknown): {
  success: boolean;
  data?: string;
  errors?: string[];
} {
  const result = ProjectNameSchema.safeParse(name);

  if (result.success) {
    return {
      success: true,
      data: result.data,
    };
  }

  return {
    success: false,
    errors: result.error.errors.map((err) => err.message),
  };
}
