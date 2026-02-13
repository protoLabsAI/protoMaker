import { Langfuse } from 'langfuse';

/**
 * Configuration for prompt version management
 */
export interface PromptVersionConfig {
  promptName: string;
  version?: number;
  label?: string;
}

/**
 * Prompt metadata with version information
 */
export interface PromptMetadata {
  name: string;
  version: number;
  label?: string;
  config: Record<string, unknown>;
  compiledPrompt: string;
}

/**
 * Get a Langfuse client instance
 * @param publicKey - Langfuse public key
 * @param secretKey - Langfuse secret key
 * @param baseUrl - Optional Langfuse base URL
 */
export function getLangfuseClient(
  publicKey: string,
  secretKey: string,
  baseUrl?: string
): Langfuse {
  return new Langfuse({
    publicKey,
    secretKey,
    baseUrl,
  });
}

/**
 * Fetch a raw prompt from Langfuse with optional version pinning
 * @param client - Langfuse client instance
 * @param config - Prompt version configuration
 */
export async function getRawPrompt(
  client: Langfuse,
  config: PromptVersionConfig
): Promise<PromptMetadata> {
  const { promptName, version, label } = config;

  const prompt = await client.getPrompt(promptName, version, {
    label,
    // Langfuse caches prompts for 60s by default, we'll handle our own caching
    cacheTtlSeconds: 60,
  });

  if (!prompt) {
    throw new Error(
      `Prompt not found: ${promptName}${version ? ` (v${version})` : ''}${label ? ` [${label}]` : ''}`
    );
  }

  return {
    name: promptName,
    version: prompt.version,
    label: label,
    config: prompt.config || {},
    compiledPrompt: prompt.prompt,
  };
}

/**
 * Fetch multiple prompts and validate they all exist
 * @param client - Langfuse client instance
 * @param configs - Array of prompt configurations
 */
export async function prefetchPrompts(
  client: Langfuse,
  configs: PromptVersionConfig[]
): Promise<Map<string, PromptMetadata>> {
  const results = await Promise.allSettled(configs.map((config) => getRawPrompt(client, config)));

  const prompts = new Map<string, PromptMetadata>();
  const errors: string[] = [];

  results.forEach((result, index) => {
    const config = configs[index];
    if (result.status === 'fulfilled') {
      prompts.set(config.promptName, result.value);
    } else {
      errors.push(`Failed to fetch ${config.promptName}: ${result.reason.message}`);
    }
  });

  if (errors.length > 0) {
    throw new Error(`Failed to prefetch prompts:\n${errors.map((e) => `  - ${e}`).join('\n')}`);
  }

  return prompts;
}

/**
 * Pin a prompt to a specific version
 * @param promptName - Name of the prompt
 * @param version - Version number to pin to
 */
export function pinPromptVersion(promptName: string, version: number): PromptVersionConfig {
  return {
    promptName,
    version,
  };
}

/**
 * Pin a prompt to a specific label
 * @param promptName - Name of the prompt
 * @param label - Label to pin to (e.g., 'production', 'staging')
 */
export function pinPromptLabel(promptName: string, label: string): PromptVersionConfig {
  return {
    promptName,
    label,
  };
}
