/**
 * Designs routes - HTTP API for .pen file management
 *
 * Provides endpoints for managing design files in the designs/ directory:
 * - List all .pen files recursively
 * - Read and parse a .pen file
 * - Write (save) a .pen file
 * - Create a new empty .pen file
 */

import { Router } from 'express';
import { validatePathParams } from '../../middleware/validate-paths.js';
import { createListHandler } from './routes/list.js';
import { createReadHandler } from './routes/read.js';
import { createWriteHandler } from './routes/write.js';
import { createCreateHandler } from './routes/create.js';

export function createDesignsRoutes(): Router {
  const router = Router();

  // All routes validate projectPath to prevent access outside allowed directories
  router.post('/list', validatePathParams('projectPath'), createListHandler());
  router.post('/read', validatePathParams('projectPath', 'filePath'), createReadHandler());
  router.post('/write', validatePathParams('projectPath', 'filePath'), createWriteHandler());
  router.post('/create', validatePathParams('projectPath', 'filePath'), createCreateHandler());

  return router;
}
