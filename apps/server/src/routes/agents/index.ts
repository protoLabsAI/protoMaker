/**
 * Agent management routes - HTTP API for template CRUD and agent execution
 *
 * Routes:
 *   POST /api/agents/templates/list       - List all registered templates
 *   POST /api/agents/templates/get        - Get a specific template by name
 *   POST /api/agents/templates/register   - Register a new template
 *   POST /api/agents/templates/update     - Update an existing template
 *   POST /api/agents/templates/unregister - Remove a template
 *   POST /api/agents/execute              - Create and run agent from template
 */

import { Router } from 'express';
import type { RoleRegistryService } from '../../services/role-registry-service.js';
import type { AgentFactoryService } from '../../services/agent-factory-service.js';
import type { DynamicAgentExecutor } from '../../services/dynamic-agent-executor.js';
import { createListTemplatesHandler } from './routes/list-templates.js';
import { createGetTemplateHandler } from './routes/get-template.js';
import { createRegisterTemplateHandler } from './routes/register-template.js';
import { createUpdateTemplateHandler } from './routes/update-template.js';
import { createUnregisterTemplateHandler } from './routes/unregister-template.js';
import { createExecuteHandler } from './routes/execute.js';

export function createAgentManagementRoutes(
  registry: RoleRegistryService,
  factory: AgentFactoryService,
  executor: DynamicAgentExecutor
): Router {
  const router = Router();

  // Template CRUD
  router.post('/templates/list', createListTemplatesHandler(registry));
  router.post('/templates/get', createGetTemplateHandler(registry));
  router.post('/templates/register', createRegisterTemplateHandler(registry));
  router.post('/templates/update', createUpdateTemplateHandler(registry));
  router.post('/templates/unregister', createUnregisterTemplateHandler(registry));

  // Agent execution
  router.post('/execute', createExecuteHandler(factory, executor));

  return router;
}
