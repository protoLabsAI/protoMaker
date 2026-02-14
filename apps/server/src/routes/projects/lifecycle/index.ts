/**
 * Project Lifecycle Routes
 *
 * Endpoints for the full project lifecycle with Linear as source of truth:
 * initiate → generate-prd → approve-prd → launch → status
 */

import { Router } from 'express';
import { validatePathParams, validateSlugs } from '../../../middleware/validate-paths.js';
import type { ProjectLifecycleService } from '../../../services/project-lifecycle-service.js';
import type { ProjectService } from '../../../services/project-service.js';
import { createInitiateHandler } from './initiate.js';
import { createGeneratePrdHandler } from './generate-prd.js';
import { createApprovePrdHandler } from './approve-prd.js';
import { createLaunchHandler } from './launch.js';
import { createStatusHandler } from './status.js';
import { createCollectRelatedHandler } from './collect-related.js';

export function createLifecycleRoutes(
  lifecycleService: ProjectLifecycleService,
  projectService: ProjectService
): Router {
  const router = Router();

  router.post(
    '/initiate',
    validatePathParams('projectPath'),
    createInitiateHandler(lifecycleService)
  );

  router.post(
    '/generate-prd',
    validatePathParams('projectPath'),
    validateSlugs('projectSlug'),
    createGeneratePrdHandler(projectService)
  );

  router.post(
    '/approve-prd',
    validatePathParams('projectPath'),
    validateSlugs('projectSlug'),
    createApprovePrdHandler(lifecycleService)
  );

  router.post(
    '/launch',
    validatePathParams('projectPath'),
    validateSlugs('projectSlug'),
    createLaunchHandler(lifecycleService)
  );

  router.post(
    '/status',
    validatePathParams('projectPath'),
    validateSlugs('projectSlug'),
    createStatusHandler(lifecycleService)
  );

  router.post(
    '/collect-related',
    validatePathParams('projectPath'),
    validateSlugs('projectSlug'),
    createCollectRelatedHandler(lifecycleService)
  );

  return router;
}
