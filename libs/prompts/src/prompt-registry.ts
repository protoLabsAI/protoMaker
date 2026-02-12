/**
 * Prompt Registry Adapter
 *
 * Maps role names to prompt generation functions with a unified interface.
 * Built-in prompts register on module import. Custom prompts can be loaded
 * from template systemPromptTemplate strings.
 *
 * Usage:
 *   import { getPromptForRole } from '@automaker/prompts';
 *   const prompt = getPromptForRole('product-manager', { projectPath: '/path' });
 */

import { getProductManagerPrompt } from './agents/product-manager-prompt.js';
import { getEngineeringManagerPrompt } from './agents/engineering-manager-prompt.js';
import { getFrontendEngineerPrompt } from './agents/frontend-engineer-prompt.js';
import { getBackendEngineerPrompt } from './agents/backend-engineer-prompt.js';
import { getDevOpsEngineerPrompt } from './agents/devops-engineer-prompt.js';
import { getQAEngineerPrompt } from './agents/qa-engineer-prompt.js';
import { getDocsEngineerPrompt } from './agents/docs-engineer-prompt.js';
import { getGTMSpecialistPrompt } from './agents/gtm-specialist-prompt.js';

/** Base config that all prompt functions accept */
export interface BasePromptConfig {
  projectPath: string;
  contextFiles?: string[];
  [key: string]: unknown;
}

/** A prompt generator function */
type PromptGenerator = (config: BasePromptConfig) => string;

/** Registry of role name → prompt generator */
const promptRegistry = new Map<string, PromptGenerator>();

/**
 * Register a prompt generator for a role.
 */
export function registerPrompt(role: string, generator: PromptGenerator): void {
  promptRegistry.set(role, generator);
}

/**
 * Get the system prompt for a given role.
 *
 * Resolution order:
 * 1. Registered prompt generator (built-in or custom)
 * 2. Generic fallback prompt
 */
export function getPromptForRole(role: string, config: BasePromptConfig): string {
  const generator = promptRegistry.get(role);
  if (generator) {
    return generator(config);
  }

  // Generic fallback for unknown roles
  return `You are a ${role} agent working on the project at ${config.projectPath}. Help with tasks related to your role. Be concise and helpful.`;
}

/**
 * Create a prompt generator from an inline system prompt template string.
 * Supports {{projectPath}} and {{contextFiles}} placeholders.
 */
export function createPromptFromTemplate(template: string): PromptGenerator {
  return (config: BasePromptConfig) => {
    let prompt = template;
    prompt = prompt.replace(/\{\{projectPath\}\}/g, config.projectPath);
    prompt = prompt.replace(/\{\{contextFiles\}\}/g, (config.contextFiles ?? []).join(', '));
    return prompt;
  };
}

/**
 * List all registered role names.
 */
export function listRegisteredRoles(): string[] {
  return Array.from(promptRegistry.keys());
}

/**
 * Check if a role has a registered prompt.
 */
export function hasPrompt(role: string): boolean {
  return promptRegistry.has(role);
}

// --- Register built-in prompts on module import ---

registerPrompt('product-manager', (config) =>
  getProductManagerPrompt({
    projectPath: config.projectPath,
    discordChannels: (config.discordChannels as string[]) ?? [],
    contextFiles: config.contextFiles,
  })
);

registerPrompt('engineering-manager', (config) =>
  getEngineeringManagerPrompt({
    projectPath: config.projectPath,
    linearProjects: (config.linearProjects as string[]) ?? [],
    contextFiles: config.contextFiles,
  })
);

registerPrompt('frontend-engineer', (config) =>
  getFrontendEngineerPrompt({
    projectPath: config.projectPath,
    linearProjects: (config.linearProjects as string[]) ?? [],
    contextFiles: config.contextFiles,
  })
);

registerPrompt('backend-engineer', (config) =>
  getBackendEngineerPrompt({
    projectPath: config.projectPath,
    linearProjects: (config.linearProjects as string[]) ?? [],
    contextFiles: config.contextFiles,
  })
);

registerPrompt('devops-engineer', (config) =>
  getDevOpsEngineerPrompt({
    projectPath: config.projectPath,
    linearProjects: (config.linearProjects as string[]) ?? [],
    contextFiles: config.contextFiles,
  })
);

registerPrompt('qa-engineer', (config) =>
  getQAEngineerPrompt({
    projectPath: config.projectPath,
    contextFiles: config.contextFiles,
  })
);

registerPrompt('docs-engineer', (config) =>
  getDocsEngineerPrompt({
    projectPath: config.projectPath,
    linearProjects: (config.linearProjects as string[]) ?? [],
    contextFiles: config.contextFiles,
  })
);

registerPrompt('gtm-specialist', (config) =>
  getGTMSpecialistPrompt({
    context: (config.context as string) ?? '',
    platform: (config.platform as string) ?? 'twitter',
    focus: (config.focus as string) ?? '',
  })
);
