import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LangfuseClient } from '@automaker/observability';
import { createLogger } from '@automaker/utils';

const logger = createLogger('PromptLoader');

// Get the directory of this module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Available prompt template names
 */
export type PromptName =
  | 'research-synthesis'
  | 'outline-planner'
  | 'section-writer'
  | 'technical-reviewer'
  | 'style-reviewer'
  | 'fact-checker'
  | 'assembler'
  | 'antagonistic-review';

/**
 * Variables for prompt interpolation
 */
export type PromptVariables = Record<string, string | number | boolean | null | undefined>;

/**
 * Options for compilePrompt
 */
export interface CompilePromptOptions {
  /**
   * Prompt template name
   */
  name: PromptName;

  /**
   * Variables to interpolate into the prompt template
   */
  variables?: PromptVariables;

  /**
   * Optional Langfuse version to fetch (defaults to latest)
   */
  version?: number;

  /**
   * Optional Langfuse client (if not provided, will use local fallback)
   */
  langfuseClient?: LangfuseClient;
}

/**
 * Compiled prompt result
 */
export interface CompiledPrompt {
  /**
   * The compiled prompt text with variables interpolated
   */
  prompt: string;

  /**
   * Source of the prompt (langfuse or local)
   */
  source: 'langfuse' | 'local';

  /**
   * Version number if from Langfuse
   */
  version?: number;

  /**
   * Variables that were used for interpolation
   */
  variables: PromptVariables;
}

/**
 * Compile a prompt template with variable interpolation.
 *
 * This function:
 * 1. Attempts to fetch the prompt from Langfuse (if client provided and available)
 * 2. Falls back to local markdown file if Langfuse unavailable or not found
 * 3. Interpolates {{variable}} placeholders with provided values
 *
 * @param options - Compilation options
 * @returns Compiled prompt with metadata
 *
 * @example
 * ```typescript
 * // Pure local mode (no Langfuse)
 * const prompt = await compilePrompt({
 *   name: 'research-synthesis',
 *   variables: {
 *     topic: 'AI Content Generation',
 *     target_audience: 'developers',
 *     scope: 'technical documentation'
 *   }
 * });
 *
 * // With Langfuse client
 * const langfuse = new LangfuseClient({
 *   publicKey: process.env.LANGFUSE_PUBLIC_KEY,
 *   secretKey: process.env.LANGFUSE_SECRET_KEY
 * });
 *
 * const prompt = await compilePrompt({
 *   name: 'section-writer',
 *   variables: {
 *     section_title: 'Getting Started',
 *     target_audience: 'beginners'
 *   },
 *   langfuseClient: langfuse
 * });
 * ```
 */
export async function compilePrompt(options: CompilePromptOptions): Promise<CompiledPrompt> {
  const { name, variables = {}, version, langfuseClient } = options;

  let promptTemplate: string;
  let source: 'langfuse' | 'local' = 'local';
  let promptVersion: number | undefined;

  // Try Langfuse first if client provided
  if (langfuseClient && langfuseClient.isAvailable()) {
    try {
      logger.debug(`Attempting to fetch prompt from Langfuse: ${name}`, { version });
      const langfusePrompt = await langfuseClient.getPrompt(name, version);

      if (langfusePrompt && langfusePrompt.prompt) {
        promptTemplate = langfusePrompt.prompt;
        source = 'langfuse';
        promptVersion = langfusePrompt.version;
        logger.info(`Loaded prompt from Langfuse: ${name}`, {
          version: promptVersion,
          source,
        });
      } else {
        logger.debug(`Prompt not found in Langfuse, falling back to local: ${name}`);
        promptTemplate = await loadLocalPrompt(name);
      }
    } catch (error) {
      logger.warn(`Error fetching prompt from Langfuse, falling back to local: ${name}`, error);
      promptTemplate = await loadLocalPrompt(name);
    }
  } else {
    logger.debug(`No Langfuse client available, using local prompt: ${name}`);
    promptTemplate = await loadLocalPrompt(name);
  }

  // Interpolate variables using {{variable}} syntax
  const interpolatedPrompt = interpolateVariables(promptTemplate, variables);

  return {
    prompt: interpolatedPrompt,
    source,
    version: promptVersion,
    variables,
  };
}

/**
 * Load a prompt template from local markdown file
 */
async function loadLocalPrompt(name: PromptName): Promise<string> {
  const promptPath = join(__dirname, 'prompts', `${name}.md`);

  try {
    const content = await readFile(promptPath, 'utf-8');
    logger.debug(`Loaded local prompt: ${name}`, { path: promptPath });
    return content;
  } catch (error) {
    logger.error(`Failed to load local prompt: ${name}`, error);
    throw new Error(`Failed to load prompt template: ${name}. Path: ${promptPath}`);
  }
}

/**
 * Interpolate {{variable}} placeholders in template
 *
 * Supports:
 * - Simple variables: {{name}}
 * - Nested values: converts objects/arrays to formatted strings
 * - Undefined/null: replaced with empty string
 *
 * @param template - Template string with {{variable}} placeholders
 * @param variables - Object with variable values
 * @returns Template with variables replaced
 */
function interpolateVariables(template: string, variables: PromptVariables): string {
  let result = template;

  // Replace all {{variable}} patterns
  for (const [key, value] of Object.entries(variables)) {
    const pattern = new RegExp(`\\{\\{${key}\\}\\}`, 'g');

    // Convert value to string, handling various types
    let replacement: string;

    if (value === null || value === undefined) {
      replacement = '';
    } else if (typeof value === 'object') {
      // Format objects and arrays as readable strings
      replacement = JSON.stringify(value, null, 2);
    } else {
      replacement = String(value);
    }

    result = result.replace(pattern, replacement);
  }

  // Log warning for any remaining unreplaced variables
  const unreplacedPattern = /\{\{([^}]+)\}\}/g;
  const unreplacedMatches = [...result.matchAll(unreplacedPattern)];

  if (unreplacedMatches.length > 0) {
    const unreplacedVars = unreplacedMatches.map((m) => m[1]);
    logger.warn('Prompt contains unreplaced variables', {
      variables: unreplacedVars,
    });
  }

  return result;
}

/**
 * Load a prompt template without variable interpolation.
 * Useful for inspecting raw templates.
 *
 * @param name - Prompt template name
 * @param langfuseClient - Optional Langfuse client
 * @returns Raw prompt template
 */
export async function loadPromptTemplate(
  name: PromptName,
  langfuseClient?: LangfuseClient
): Promise<{ template: string; source: 'langfuse' | 'local'; version?: number }> {
  let template: string;
  let source: 'langfuse' | 'local' = 'local';
  let version: number | undefined;

  // Try Langfuse first if client provided
  if (langfuseClient && langfuseClient.isAvailable()) {
    try {
      const langfusePrompt = await langfuseClient.getPrompt(name);

      if (langfusePrompt && langfusePrompt.prompt) {
        template = langfusePrompt.prompt;
        source = 'langfuse';
        version = langfusePrompt.version;
      } else {
        template = await loadLocalPrompt(name);
      }
    } catch (error) {
      logger.warn(`Error fetching prompt from Langfuse: ${name}`, error);
      template = await loadLocalPrompt(name);
    }
  } else {
    template = await loadLocalPrompt(name);
  }

  return { template, source, version };
}

/**
 * Get list of available prompt template names
 */
export function getAvailablePrompts(): PromptName[] {
  return [
    'research-synthesis',
    'outline-planner',
    'section-writer',
    'technical-reviewer',
    'style-reviewer',
    'fact-checker',
    'assembler',
  ];
}
