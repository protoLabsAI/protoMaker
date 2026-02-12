/**
 * Built-in agent templates for the 9 known roles.
 *
 * Registered at server startup as tier 0 (protected) templates.
 * These cannot be overwritten or unregistered via the API.
 */

import type { AgentTemplate } from '@automaker/types';
import { createLogger } from '@automaker/utils';
import type { RoleRegistryService } from './role-registry-service.js';

const logger = createLogger('BuiltInTemplates');

const BUILT_IN_TEMPLATES: AgentTemplate[] = [
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
    tags: ['implementation', 'backend', 'api'],
  },
  {
    name: 'frontend-engineer',
    displayName: 'Frontend Engineer',
    description: 'Implements UI components, routes, state management, and styling.',
    role: 'frontend-engineer',
    tier: 0,
    model: 'sonnet',
    maxTurns: 100,
    canUseBash: true,
    canModifyFiles: true,
    canCommit: true,
    canCreatePRs: true,
    trustLevel: 2,
    tags: ['implementation', 'frontend', 'ui'],
  },
  {
    name: 'devops-engineer',
    displayName: 'DevOps Engineer',
    description: 'Manages infrastructure, CI/CD, deployments, monitoring, and system reliability.',
    role: 'devops-engineer',
    tier: 0,
    model: 'sonnet',
    maxTurns: 100,
    canUseBash: true,
    canModifyFiles: true,
    canCommit: true,
    canCreatePRs: true,
    trustLevel: 2,
    tags: ['infrastructure', 'devops', 'ci-cd'],
  },
  {
    name: 'qa-engineer',
    displayName: 'QA Engineer',
    description: 'Writes and runs tests, identifies bugs, validates acceptance criteria.',
    role: 'qa-engineer',
    tier: 0,
    model: 'sonnet',
    maxTurns: 50,
    canUseBash: true,
    canModifyFiles: true,
    canCommit: true,
    canCreatePRs: true,
    trustLevel: 1,
    tags: ['testing', 'quality', 'verification'],
  },
  {
    name: 'docs-engineer',
    displayName: 'Documentation Engineer',
    description: 'Writes and updates documentation, READMEs, API docs, and guides.',
    role: 'docs-engineer',
    tier: 0,
    model: 'haiku',
    maxTurns: 50,
    canUseBash: false,
    canModifyFiles: true,
    canCommit: true,
    canCreatePRs: true,
    trustLevel: 1,
    tags: ['documentation', 'writing'],
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
    tags: ['planning', 'product', 'requirements'],
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
    tags: ['management', 'review', 'coordination'],
  },
  {
    name: 'chief-of-staff',
    displayName: 'Chief of Staff',
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
    allowedSubagentRoles: [
      'backend-engineer',
      'frontend-engineer',
      'devops-engineer',
      'qa-engineer',
      'docs-engineer',
    ],
    trustLevel: 3,
    tags: ['operations', 'leadership', 'autonomous'],
  },
  {
    name: 'gtm-specialist',
    displayName: 'GTM Specialist',
    description: 'Handles go-to-market strategy, content creation, and growth initiatives.',
    role: 'gtm-specialist',
    tier: 0,
    model: 'sonnet',
    maxTurns: 50,
    canUseBash: false,
    canModifyFiles: true,
    canCommit: false,
    canCreatePRs: false,
    trustLevel: 1,
    tags: ['marketing', 'content', 'growth'],
  },
];

/**
 * Register all built-in templates. Returns count of successfully registered templates.
 */
export function registerBuiltInTemplates(registry: RoleRegistryService): number {
  let registered = 0;

  for (const template of BUILT_IN_TEMPLATES) {
    const result = registry.register(template);
    if (result.success) {
      registered++;
    } else {
      logger.warn(`Failed to register built-in template "${template.name}": ${result.error}`);
    }
  }

  logger.info(`Registered ${registered}/${BUILT_IN_TEMPLATES.length} built-in templates`);
  return registered;
}
