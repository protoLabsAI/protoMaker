/**
 * Built-in agent templates registered at server startup.
 *
 * Registered at server startup as tier 0 (protected) templates.
 * These cannot be overwritten or unregistered via the API.
 */

import type { AgentTemplate, UserProfile, CustomPrompt } from '@protolabs-ai/types';
import { createLogger } from '@protolabs-ai/utils';
import {
  getAvaPrompt,
  getMattPrompt,
  getSamPrompt,
  getCindiPrompt,
  getJonPrompt,
  getKaiPrompt,
  getLinearSpecialistPrompt,
  getPrMaintainerPrompt,
  getBoardJanitorPrompt,
  getFrankPrompt,
  getPmPrompt,
} from '@protolabs-ai/prompts';
import type { RoleRegistryService } from './role-registry-service.js';

const logger = createLogger('BuiltInTemplates');

/**
 * Resolve the effective system prompt for a persona, applying overrides if enabled.
 */
function resolvePersonaPrompt(
  name: string,
  generated: string,
  overrides?: Record<string, CustomPrompt>
): string {
  const override = overrides?.[name];
  if (override?.enabled && override.value) {
    return override.value;
  }
  return generated;
}

/**
 * Derive allowedUsers from user profile, falling back to current defaults.
 */
function deriveAllowedUsers(profile?: UserProfile): string[] {
  const primary = profile?.discord?.username;
  const additional = profile?.additionalAllowedUsers ?? [];
  return primary ? [primary, ...additional] : additional;
}

export function buildTemplates(
  userProfile?: UserProfile,
  personaOverrides?: Record<string, CustomPrompt>
): AgentTemplate[] {
  const allowedUsers = deriveAllowedUsers(userProfile);
  const promptConfig = { userProfile };

  return [
    {
      name: 'pr-maintainer',
      displayName: 'PR Maintainer',
      description:
        'Handles PR pipeline mechanics: auto-merge enablement, CodeRabbit thread resolution, format fixing in worktrees, branch rebasing, and PR creation from orphaned worktrees.',
      role: 'pr-maintainer',
      tier: 0,
      model: 'haiku',
      maxTurns: 50,
      canUseBash: true,
      canModifyFiles: true,
      canCommit: true,
      canCreatePRs: true,
      trustLevel: 2,
      exposure: { cli: false, discord: false },
      tags: ['pr', 'pipeline', 'maintenance', 'formatting', 'coderabbit'],
      systemPrompt: getPrMaintainerPrompt(),
    },
    {
      name: 'board-janitor',
      displayName: 'Board Janitor',
      description:
        'Maintains board consistency: moves merged-PR features to done, resets stale in-progress features, repairs dependency chains.',
      role: 'board-janitor',
      tier: 0,
      model: 'haiku',
      maxTurns: 30,
      canUseBash: false,
      canModifyFiles: false,
      canCommit: false,
      canCreatePRs: false,
      trustLevel: 1,
      exposure: { cli: false, discord: false },
      tags: ['board', 'maintenance', 'cleanup', 'dependencies'],
      systemPrompt: getBoardJanitorPrompt(),
    },
    {
      name: 'backend-engineer',
      displayName: 'Backend Engineer',
      description: 'Implements server-side features, APIs, services, and database logic.',
      role: 'backend-engineer',
      tier: 0,
      model: 'sonnet',
      maxTurns: 100,
      canUseBash: true,
      canModifyFiles: true,
      canCommit: true,
      canCreatePRs: true,
      trustLevel: 2,
      exposure: { cli: false, discord: false },
      tags: ['implementation', 'backend', 'api'],
    },
    {
      name: 'matt',
      displayName: 'Matt',
      description:
        'Frontend engineering specialist. Implements UI components, design systems, theming, and Storybook. Reports to Ava.',
      role: 'frontend-engineer',
      tier: 0,
      model: 'sonnet',
      maxTurns: 100,
      canUseBash: true,
      canModifyFiles: true,
      canCommit: true,
      canCreatePRs: true,
      trustLevel: 2,
      exposure: { cli: true, discord: true, allowedUsers },
      tags: ['implementation', 'frontend', 'ui', 'design-system', 'storybook'],
      systemPrompt: resolvePersonaPrompt('matt', getMattPrompt(promptConfig), personaOverrides),
    },
    {
      name: 'sam',
      displayName: 'Sam',
      description:
        'AI agent engineer. Designs multi-agent flows, LangGraph state graphs, LLM provider integrations, and observability pipelines. Reports to Ava.',
      role: 'backend-engineer',
      tier: 0,
      model: 'sonnet',
      maxTurns: 100,
      canUseBash: true,
      canModifyFiles: true,
      canCommit: true,
      canCreatePRs: true,
      trustLevel: 2,
      exposure: { cli: true, discord: true, allowedUsers },
      tags: ['implementation', 'ai-agents', 'langgraph', 'observability', 'flows'],
      systemPrompt: resolvePersonaPrompt('sam', getSamPrompt(promptConfig), personaOverrides),
    },
    {
      name: 'kai',
      displayName: 'Kai',
      description:
        'Backend engineer. Implements Express routes, services, API design, error handling, and server-side features. Reports to Ava.',
      role: 'backend-engineer',
      tier: 0,
      model: 'sonnet',
      maxTurns: 100,
      canUseBash: true,
      canModifyFiles: true,
      canCommit: true,
      canCreatePRs: true,
      trustLevel: 2,
      exposure: { cli: true, discord: true, allowedUsers },
      tags: ['implementation', 'backend', 'api', 'express', 'services'],
      systemPrompt: resolvePersonaPrompt('kai', getKaiPrompt(promptConfig), personaOverrides),
    },
    {
      name: 'frank',
      displayName: 'Frank',
      description:
        'Manages infrastructure, CI/CD, deployments, monitoring, and system reliability.',
      role: 'devops-engineer',
      tier: 0,
      model: 'sonnet',
      maxTurns: 100,
      canUseBash: true,
      canModifyFiles: true,
      canCommit: true,
      canCreatePRs: true,
      trustLevel: 2,
      exposure: { cli: true, discord: true, allowedUsers },
      tags: ['infrastructure', 'devops', 'ci-cd'],
      systemPrompt: resolvePersonaPrompt('frank', getFrankPrompt(promptConfig), personaOverrides),
    },
    {
      name: 'product-manager',
      displayName: 'Product Manager',
      description: 'Manages requirements, priorities, roadmap, and stakeholder communication.',
      role: 'product-manager',
      tier: 0,
      model: 'sonnet',
      maxTurns: 50,
      canUseBash: false,
      canModifyFiles: false,
      canCommit: false,
      canCreatePRs: false,
      trustLevel: 1,
      exposure: { cli: false, discord: false },
      tags: ['planning', 'product', 'requirements'],
    },
    {
      name: 'project-manager',
      displayName: 'Project Manager',
      description:
        'Manages the project board, tracks milestones, posts status updates, and produces distilled reports for Ava. Owns project lifecycle from planning through delivery.',
      role: 'product-manager',
      tier: 0,
      model: 'sonnet',
      maxTurns: 80,
      canUseBash: false,
      canModifyFiles: false,
      canCommit: false,
      canCreatePRs: false,
      trustLevel: 2,
      tools: [
        'project_list',
        'project_get',
        'project_update',
        'project_add_link',
        'project_remove_link',
        'project_add_update',
        'project_remove_update',
        'project_list_docs',
        'project_get_doc',
        'project_create_doc',
        'project_update_doc',
        'project_delete_doc',
        'project_list_features',
        'list_features',
        'get_feature',
        'update_feature',
        'create_feature',
        'query_board',
      ],
      exposure: { cli: true, discord: true, allowedUsers },
      tags: ['project', 'board', 'management', 'reports', 'milestones'],
      systemPrompt: resolvePersonaPrompt(
        'project-manager',
        getPmPrompt(promptConfig),
        personaOverrides
      ),
    },
    {
      name: 'engineering-manager',
      displayName: 'Engineering Manager',
      description:
        'Oversees engineering execution, code review, team coordination, and technical decisions.',
      role: 'engineering-manager',
      tier: 0,
      model: 'sonnet',
      maxTurns: 50,
      canUseBash: false,
      canModifyFiles: false,
      canCommit: false,
      canCreatePRs: false,
      trustLevel: 1,
      exposure: { cli: false, discord: false },
      tags: ['management', 'review', 'coordination'],
    },
    {
      name: 'ava',
      displayName: 'AVA',
      description:
        'Autonomous operator with full authority. Manages operations, coordinates agents, and drives execution.',
      role: 'chief-of-staff',
      tier: 0,
      model: 'opus',
      maxTurns: 200,
      canUseBash: true,
      canModifyFiles: true,
      canCommit: true,
      canCreatePRs: true,
      canSpawnAgents: true,
      allowedSubagentRoles: ['backend-engineer', 'frontend-engineer', 'devops-engineer'],
      trustLevel: 3,
      exposure: { cli: true, discord: true, allowedUsers },
      tags: ['operations', 'leadership', 'autonomous'],
      systemPrompt: resolvePersonaPrompt('ava', getAvaPrompt(promptConfig), personaOverrides),
    },
    {
      name: 'cindi',
      displayName: 'Cindi',
      description:
        'Content writing specialist for protoLabs. Uses content pipeline flows to produce blog posts, technical docs, training data, and marketing content. Expert in SEO, antagonistic review, and multi-format output.',
      role: 'content-writer',
      tier: 0,
      model: 'sonnet',
      maxTurns: 100,
      canUseBash: false,
      canModifyFiles: true,
      canCommit: true,
      canCreatePRs: true,
      trustLevel: 2,
      exposure: { cli: true, discord: true, allowedUsers },
      tags: ['content', 'writing', 'blog', 'documentation', 'seo', 'training-data'],
      systemPrompt: resolvePersonaPrompt('cindi', getCindiPrompt(promptConfig), personaOverrides),
    },
    {
      name: 'linear-specialist',
      displayName: 'Linear Specialist',
      description:
        'Owns all Linear workspace operations: project management, sprint planning, issue lifecycle, initiative tracking, and Automaker board synchronization.',
      role: 'linear-specialist',
      tier: 0,
      model: 'sonnet',
      maxTurns: 100,
      canUseBash: false,
      canModifyFiles: false,
      canCommit: false,
      canCreatePRs: false,
      trustLevel: 2,
      exposure: { cli: false, discord: false },
      tags: ['linear', 'project-management', 'sprint-planning', 'issues', 'initiatives'],
      systemPrompt: getLinearSpecialistPrompt(),
    },
    {
      name: 'jon',
      displayName: 'Jon',
      description:
        'GTM Specialist — content strategy, brand positioning, social media, competitive research, and launch execution.',
      role: 'gtm-specialist',
      tier: 0,
      model: 'sonnet',
      maxTurns: 100,
      canUseBash: true,
      canModifyFiles: true,
      canCommit: false,
      canCreatePRs: false,
      trustLevel: 1,
      exposure: {
        cli: true,
        discord: true,
        allowedUsers,
      },
      tags: ['marketing', 'content', 'growth', 'gtm', 'brand'],
      systemPrompt: resolvePersonaPrompt('jon', getJonPrompt(promptConfig), personaOverrides),
    },
    {
      name: 'calendar-assistant',
      displayName: 'Calendar Assistant',
      description:
        'Manages all calendar operations for the project. Handles scheduling, event creation/updates, deadline tracking, and temporal data management. Other agents delegate calendar operations to this assistant.',
      role: 'calendar-assistant',
      tier: 0,
      model: 'opus',
      maxTurns: 50,
      canUseBash: false,
      canModifyFiles: false,
      canCommit: false,
      canCreatePRs: false,
      trustLevel: 3,
      tools: [
        'mcp__plugin_protolabs_studio__list_calendar_events',
        'mcp__plugin_protolabs_studio__create_calendar_event',
        'mcp__plugin_protolabs_studio__update_calendar_event',
        'mcp__plugin_protolabs_studio__delete_calendar_event',
        'mcp__plugin_protolabs_studio__list_features',
        'mcp__plugin_protolabs_studio__get_feature',
        'mcp__plugin_protolabs_studio__query_board',
      ],
      exposure: { cli: false, discord: false },
      tags: ['calendar', 'scheduling', 'calendar-read', 'calendar-write'],
      systemPrompt:
        'You are the Calendar Assistant. You manage all calendar operations for the project. Other agents delegate to you when they need to schedule events, check deadlines, or query the calendar. You are the single source of truth for temporal data.',
    },
  ];
}

/**
 * Register all built-in templates. Returns count of successfully registered templates.
 */
export function registerBuiltInTemplates(
  registry: RoleRegistryService,
  userProfile?: UserProfile,
  personaOverrides?: Record<string, CustomPrompt>
): number {
  const templates = buildTemplates(userProfile, personaOverrides);
  let registered = 0;

  for (const template of templates) {
    const result = registry.register(template);
    if (result.success) {
      registered++;
    } else {
      logger.warn(`Failed to register built-in template "${template.name}": ${result.error}`);
    }
  }

  logger.info(`Registered ${registered}/${templates.length} built-in templates`);
  return registered;
}
