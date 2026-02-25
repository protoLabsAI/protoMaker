/**
 * Git routes - HTTP API for git operations (non-worktree)
 */

import { Router } from 'express';
import { validatePathParams } from '../../middleware/validate-paths.js';
import { createDiffsHandler } from './routes/diffs.js';
import { createFileDiffHandler } from './routes/file-diff.js';
import { createEnhancedStatusHandler } from './routes/enhanced-status.js';
import { createStageFilesHandler } from './routes/stage-files.js';
import { createFileDetailsHandler } from './routes/details.js';

export function createGitRoutes(): Router {
  const router = Router();

  router.post('/diffs', validatePathParams('projectPath'), createDiffsHandler());
  router.post('/file-diff', validatePathParams('projectPath', 'filePath'), createFileDiffHandler());
  router.post('/enhanced-status', validatePathParams('projectPath'), createEnhancedStatusHandler());
  router.post('/stage-files', createStageFilesHandler());
  router.post(
    '/details',
    validatePathParams('projectPath', 'filePath'),
    createFileDetailsHandler()
  );

  return router;
}
