/**
 * Context routes - HTTP API for context file operations
 *
 * Provides endpoints for managing context files including:
 * - CRUD operations (list, get, create, delete)
 * - AI-powered image and file description generation
 */

import { Router } from 'express';
import { createDescribeImageHandler } from './routes/describe-image.js';
import { createDescribeFileHandler } from './routes/describe-file.js';
import { createListContextFilesHandler } from './routes/list.js';
import { createGetContextFileHandler } from './routes/get.js';
import { createCreateContextFileHandler } from './routes/create.js';
import { createDeleteContextFileHandler } from './routes/delete.js';
import type { SettingsService } from '../../services/settings-service.js';

/**
 * Create the context router
 *
 * @param settingsService - Optional settings service for loading autoLoadClaudeMd setting
 * @returns Express router with context endpoints
 */
export function createContextRoutes(settingsService?: SettingsService): Router {
  const router = Router();

  // CRUD operations for context files
  router.post('/list', createListContextFilesHandler());
  router.post('/get', createGetContextFileHandler());
  router.post('/create', createCreateContextFileHandler());
  router.post('/delete', createDeleteContextFileHandler());

  // AI-powered description generation
  router.post('/describe-image', createDescribeImageHandler(settingsService));
  router.post('/describe-file', createDescribeFileHandler(settingsService));

  return router;
}
