/**
 * AgentFactoryService - Creates configured agent instances from templates.
 *
 * Resolves templates from the RoleRegistry, applies overrides, merges
 * inherited capabilities, and returns fully configured agent configs
 * ready for execution. Does NOT execute agents.
 */

import {
  AgentTemplateSchema,
  type AgentTemplate,
  type DeploymentEnvironment,
} from '@protolabs-ai/types';
import { createLogger } from '@protolabs-ai/utils';
import { resolveModelString } from '@protolabs-ai/model-resolver';
import { getPromptForRole, hasPrompt } from '@protolabs-ai/prompts';
import type { RoleRegistryService } from './role-registry-service.js';
import type { EventEmitter } from '../lib/events.js';

const logger = createLogger('AgentFactory');

/**
 * The resolved agent configuration returned by the factory.
 * Contains everything needed to execute an agent.
 */
export interface AgentConfig {
  /** Template name used to create this config */
  templateName: string;
  /** Resolved Claude model ID (e.g., "claude-sonnet-4-5-20250929") */
  resolvedModel: string;
  /** Model alias (e.g., "sonnet") */
  modelAlias: string;
  /** Allowed tools for this agent */
  tools: string[];
  /** Denied tools (overrides allowlist) */
  disallowedTools: string[];
  /** Maximum turns before stopping */
  maxTurns: number;
  /** System prompt template path (if using file) */
  systemPromptTemplate?: string;
  /** Inline system prompt (if provided) */
  systemPrompt?: string;
  /** Agent role */
  role: string;
  /** Display name */
  displayName: string;
  /** Trust level (0-3) */
  trustLevel: number;
  /** Capability flags */
  capabilities: {
    canUseBash: boolean;
    canModifyFiles: boolean;
    canCommit: boolean;
    canCreatePRs: boolean;
    canSpawnAgents: boolean;
  };
  /** Allowed sub-agent roles (if canSpawnAgents) */
  allowedSubagentRoles: string[];
  /** Headsdown loop config */
  headsdownConfig?: AgentTemplate['headsdownConfig'];
  /** Routing assignments */
  assignments?: AgentTemplate['assignments'];
  /** Desired state conditions for reactive activation (from AgentTemplate.desiredState) */
  desiredState?: Array<{
    key: string;
    operator: string;
    value: string | number | boolean;
    description?: string;
    priority?: number;
  }>;
  /** MCP server configurations for this agent (enables per-template MCP server assignment) */
  mcpServers: Array<{
    name: string;
    type?: 'stdio' | 'sse' | 'http';
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    url?: string;
    headers?: Record<string, string>;
  }>;
  /** Deployment environment (dev/staging/prod) */
  environment: DeploymentEnvironment;
  /** Project path this agent is configured for */
  projectPath: string;
}

/** Overrides that can be applied when creating from template */
export type AgentOverrides = Partial<
  Pick<
    AgentTemplate,
    | 'model'
    | 'tools'
    | 'disallowedTools'
    | 'maxTurns'
    | 'systemPrompt'
    | 'trustLevel'
    | 'maxRiskAllowed'
    | 'canUseBash'
    | 'canModifyFiles'
    | 'canCommit'
    | 'canCreatePRs'
  >
>;

const DEFAULT_MAX_TURNS = 100;
const DEFAULT_TRUST_LEVEL = 1;

export class AgentFactoryService {
  private registry: RoleRegistryService;
  private events?: EventEmitter;
  private environment: DeploymentEnvironment;

  constructor(
    registry: RoleRegistryService,
    events?: EventEmitter,
    environment?: DeploymentEnvironment
  ) {
    this.registry = registry;
    this.events = events;
    this.environment = environment ?? 'development';
  }

  /**
   * Create a fully resolved agent config from a registered template.
   *
   * @param templateName - The template name in the registry
   * @param projectPath - The project this agent will work on
   * @param overrides - Optional field-level overrides
   * @returns Fully resolved AgentConfig ready for execution
   * @throws Error if template not found or validation fails
   */
  createFromTemplate(
    templateName: string,
    projectPath: string,
    overrides?: AgentOverrides
  ): AgentConfig {
    const template = this.registry.get(templateName);
    if (!template) {
      const available = this.registry
        .list()
        .map((t) => t.name)
        .join(', ');
      throw new Error(
        `Template "${templateName}" not found in registry. Available: ${available || 'none'}`
      );
    }

    const merged = this.applyOverrides(template, overrides);
    const config = this.resolveConfig(merged, projectPath);

    logger.info(
      `Created agent config from "${templateName}" for ${projectPath} (model: ${config.modelAlias}, turns: ${config.maxTurns})`
    );

    this.events?.emit('authority:agent-registered', {
      name: templateName,
      role: config.role,
      tier: template.tier ?? 1,
      action: 'factory-create',
      projectPath,
    });

    return config;
  }

  /**
   * Create from template with inheritance — custom template extends a base.
   * The child template's fields override the parent's. Tools are merged additively.
   *
   * @param parentName - Base template name
   * @param childTemplate - Partial template to overlay
   * @param projectPath - The project this agent will work on
   * @returns Fully resolved AgentConfig
   */
  createWithInheritance(
    parentName: string,
    childTemplate: Partial<AgentTemplate> & { name: string },
    projectPath: string
  ): AgentConfig {
    const parent = this.registry.get(parentName);
    if (!parent) {
      throw new Error(`Parent template "${parentName}" not found in registry`);
    }

    // Merge: child overrides parent, tools are additive
    const merged: AgentTemplate = {
      ...parent,
      ...childTemplate,
      // Additive tool merge: parent tools + child tools (deduped)
      tools: this.mergeTools(parent.tools, childTemplate.tools),
      // Disallowed tools: child replaces parent entirely
      disallowedTools: childTemplate.disallowedTools ?? parent.disallowedTools,
      // Assignments: deep merge
      assignments: childTemplate.assignments
        ? {
            ...parent.assignments,
            ...childTemplate.assignments,
          }
        : parent.assignments,
      // Headsdown: child replaces parent entirely
      headsdownConfig: childTemplate.headsdownConfig ?? parent.headsdownConfig,
    };

    // Validate the merged template
    const result = AgentTemplateSchema.safeParse(merged);
    if (!result.success) {
      const errors = result.error.issues.map((i) => i.message).join(', ');
      throw new Error(`Inherited template "${childTemplate.name}" failed validation: ${errors}`);
    }

    const config = this.resolveConfig(result.data as AgentTemplate, projectPath);

    logger.info(
      `Created inherited agent config "${childTemplate.name}" (parent: "${parentName}") for ${projectPath}`
    );

    this.events?.emit('authority:agent-registered', {
      name: childTemplate.name,
      role: config.role,
      tier: childTemplate.tier ?? parent.tier ?? 1,
      action: 'factory-inherit',
      parentName,
      projectPath,
    });

    return config;
  }

  /**
   * List all available template names in the registry.
   */
  getAvailableTemplates(): Array<{ name: string; displayName: string; role: string }> {
    return this.registry.list().map((t) => ({
      name: t.name,
      displayName: t.displayName,
      role: t.role,
    }));
  }

  /**
   * Apply overrides to a template. Tools are additive, other fields replace.
   */
  private applyOverrides(template: AgentTemplate, overrides?: AgentOverrides): AgentTemplate {
    if (!overrides) return template;

    return {
      ...template,
      model: overrides.model ?? template.model,
      tools: overrides.tools ? this.mergeTools(template.tools, overrides.tools) : template.tools,
      disallowedTools: overrides.disallowedTools ?? template.disallowedTools,
      maxTurns: overrides.maxTurns ?? template.maxTurns,
      systemPrompt: overrides.systemPrompt ?? template.systemPrompt,
      trustLevel: overrides.trustLevel ?? template.trustLevel,
      maxRiskAllowed: overrides.maxRiskAllowed ?? template.maxRiskAllowed,
      canUseBash: overrides.canUseBash ?? template.canUseBash,
      canModifyFiles: overrides.canModifyFiles ?? template.canModifyFiles,
      canCommit: overrides.canCommit ?? template.canCommit,
      canCreatePRs: overrides.canCreatePRs ?? template.canCreatePRs,
    };
  }

  /**
   * Merge tool arrays additively, deduplicating.
   */
  private mergeTools(base?: string[], additional?: string[]): string[] | undefined {
    if (!base && !additional) return undefined;
    if (!additional) return base;
    if (!base) return additional;
    return [...new Set([...base, ...additional])];
  }

  /**
   * Resolve a template into a concrete AgentConfig.
   *
   * System prompt resolution order:
   * 1. Template's inline systemPrompt (if set)
   * 2. Prompt registry lookup by template name (e.g., 'matt', 'ava')
   * 3. Prompt registry lookup by role (e.g., 'backend-engineer')
   * 4. undefined (no system prompt)
   */
  private resolveConfig(template: AgentTemplate, projectPath: string): AgentConfig {
    const modelAlias = template.model ?? 'sonnet';
    const resolvedModel = resolveModelString(modelAlias);

    // Resolve system prompt with registry fallback
    let systemPrompt = template.systemPrompt;
    if (!systemPrompt) {
      // Try template name first, then role
      const lookupKey = hasPrompt(template.name) ? template.name : template.role;
      if (hasPrompt(lookupKey)) {
        systemPrompt = getPromptForRole(lookupKey, { projectPath });
      }
    }

    return {
      templateName: template.name,
      resolvedModel,
      modelAlias,
      tools: template.tools ?? [],
      disallowedTools: template.disallowedTools ?? [],
      maxTurns: template.maxTurns ?? DEFAULT_MAX_TURNS,
      systemPromptTemplate: template.systemPromptTemplate,
      systemPrompt,
      role: template.role,
      displayName: template.displayName,
      trustLevel: template.trustLevel ?? DEFAULT_TRUST_LEVEL,
      capabilities: {
        canUseBash: template.canUseBash ?? true,
        canModifyFiles: template.canModifyFiles ?? true,
        canCommit: template.canCommit ?? true,
        canCreatePRs: template.canCreatePRs ?? true,
        canSpawnAgents: template.canSpawnAgents ?? false,
      },
      allowedSubagentRoles: template.allowedSubagentRoles ?? [],
      headsdownConfig: template.headsdownConfig,
      assignments: template.assignments,
      desiredState: (template as Record<string, unknown>)
        .desiredState as AgentConfig['desiredState'],
      mcpServers: ((template as Record<string, unknown>).mcpServers ??
        []) as AgentConfig['mcpServers'],
      environment: this.environment,
      projectPath,
    };
  }
}
