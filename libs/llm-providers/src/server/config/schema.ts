import { z } from 'zod';

/**
 * Model category schema
 */
export const modelCategorySchema = z.enum(['fast', 'smart', 'reasoning', 'vision', 'coding']);

/**
 * Provider name schema
 */
export const providerNameSchema = z.enum(['anthropic', 'openai', 'google', 'ollama']);

/**
 * Model mapping schema
 */
export const modelMappingSchema = z.object({
  fast: z.string().optional(),
  smart: z.string().optional(),
  reasoning: z.string().optional(),
  vision: z.string().optional(),
  coding: z.string().optional(),
});

/**
 * Provider configuration schema
 */
export const providerConfigSchema = z.object({
  name: providerNameSchema,
  apiKey: z.string().optional(),
  baseUrl: z.string().url().optional(),
  enabled: z.boolean(),
  models: modelMappingSchema,
});

/**
 * Complete LLM providers configuration schema
 */
export const llmProvidersConfigSchema = z.object({
  providers: z.object({
    anthropic: providerConfigSchema.optional(),
    openai: providerConfigSchema.optional(),
    google: providerConfigSchema.optional(),
    ollama: providerConfigSchema.optional(),
  }),
  defaultProvider: providerNameSchema,
});

/**
 * Validate provider configuration
 */
export function validateProviderConfig(config: unknown): z.infer<typeof providerConfigSchema> {
  return providerConfigSchema.parse(config);
}

/**
 * Validate complete LLM providers configuration
 */
export function validateLLMProvidersConfig(
  config: unknown
): z.infer<typeof llmProvidersConfigSchema> {
  return llmProvidersConfigSchema.parse(config);
}
