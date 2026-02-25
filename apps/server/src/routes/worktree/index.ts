/**
 * Worktree routes - HTTP API for git worktree operations
 */

import { Router } from 'express';
import type { EventEmitter } from '../../lib/events.js';
import { validatePathParams } from '../../middleware/validate-paths.js';
import { requireValidWorktree, requireValidProject, requireGitRepoOnly } from './middleware.js';
import { createInfoHandler } from './routes/info.js';
import { createStatusHandler } from './routes/status.js';
import { createListHandler } from './routes/list.js';
import { createDiffsHandler } from './routes/diffs.js';
import { createFileDiffHandler } from './routes/file-diff.js';
import { createMergeHandler } from './routes/merge.js';
import { createCreateHandler } from './routes/create.js';
import { createDeleteHandler } from './routes/delete.js';
import { createCreatePRHandler } from './routes/create-pr.js';
import { createPRInfoHandler } from './routes/pr-info.js';
import { createCommitHandler } from './routes/commit.js';
import { createGenerateCommitMessageHandler } from './routes/generate-commit-message.js';
import { createPushHandler } from './routes/push.js';
import { createPullHandler } from './routes/pull.js';
import { createCheckoutBranchHandler } from './routes/checkout-branch.js';
import { createListBranchesHandler } from './routes/list-branches.js';
import { createSwitchBranchHandler } from './routes/switch-branch.js';
import {
  createOpenInEditorHandler,
  createGetDefaultEditorHandler,
  createGetAvailableEditorsHandler,
  createRefreshEditorsHandler,
} from './routes/open-in-editor.js';
import {
  createOpenInTerminalHandler,
  createGetAvailableTerminalsHandler,
  createGetDefaultTerminalHandler,
  createRefreshTerminalsHandler,
  createOpenInExternalTerminalHandler,
} from './routes/open-in-terminal.js';
import { createInitGitHandler } from './routes/init-git.js';
import { createMigrateHandler } from './routes/migrate.js';
import { createStartDevHandler } from './routes/start-dev.js';
import { createStopDevHandler } from './routes/stop-dev.js';
import { createListDevServersHandler } from './routes/list-dev-servers.js';
import { createGetDevServerLogsHandler } from './routes/dev-server-logs.js';
import {
  createGetInitScriptHandler,
  createPutInitScriptHandler,
  createDeleteInitScriptHandler,
  createRunInitScriptHandler,
} from './routes/init-script.js';
import { createDiscardChangesHandler } from './routes/discard-changes.js';
import { createListRemotesHandler } from './routes/list-remotes.js';
import { createGraphiteStatusHandler } from './routes/graphite-status.js';
import { createGraphiteSyncHandler } from './routes/graphite-sync.js';
import { createGraphiteRestackHandler } from './routes/graphite-restack.js';
import { createHealthHandler } from './routes/health.js';
import { createPruneHandler } from './routes/prune.js';
import { createCherryPickHandler } from './routes/cherry-pick.js';
import { createAbortOperationHandler } from './routes/abort-operation.js';
import { createContinueOperationHandler } from './routes/continue-operation.js';
import { createStashPushHandler } from './routes/stash-push.js';
import { createStashListHandler } from './routes/stash-list.js';
import { createStashApplyHandler } from './routes/stash-apply.js';
import { createStashDropHandler } from './routes/stash-drop.js';
import type { SettingsService } from '../../services/settings-service.js';
import type { WorktreeLifecycleService } from '../../services/worktree-lifecycle-service.js';
import type { AutoModeService } from '../../services/auto-mode-service.js';

export function createWorktreeRoutes(
  events: EventEmitter,
  settingsService?: SettingsService,
  worktreeLifecycleService?: WorktreeLifecycleService,
  autoModeService?: AutoModeService
): Router {
  const router = Router();

  router.post('/info', validatePathParams('projectPath'), createInfoHandler());
  router.post('/status', validatePathParams('projectPath'), createStatusHandler());
  router.post('/list', createListHandler());
  router.post('/diffs', validatePathParams('projectPath'), createDiffsHandler());
  router.post('/file-diff', validatePathParams('projectPath', 'filePath'), createFileDiffHandler());
  router.post(
    '/merge',
    validatePathParams('projectPath'),
    requireValidProject,
    createMergeHandler()
  );
  router.post('/create', validatePathParams('projectPath'), createCreateHandler(events));
  router.post(
    '/delete',
    validatePathParams('projectPath', 'worktreePath'),
    createDeleteHandler(autoModeService)
  );
  router.post('/create-pr', createCreatePRHandler());
  router.post('/pr-info', createPRInfoHandler());
  router.post(
    '/commit',
    validatePathParams('worktreePath'),
    requireGitRepoOnly,
    createCommitHandler()
  );
  router.post(
    '/generate-commit-message',
    validatePathParams('worktreePath'),
    requireGitRepoOnly,
    createGenerateCommitMessageHandler(settingsService)
  );
  router.post(
    '/push',
    validatePathParams('worktreePath'),
    requireValidWorktree,
    createPushHandler()
  );
  router.post(
    '/pull',
    validatePathParams('worktreePath'),
    requireValidWorktree,
    createPullHandler()
  );
  router.post('/checkout-branch', requireValidWorktree, createCheckoutBranchHandler());
  router.post(
    '/list-branches',
    validatePathParams('worktreePath'),
    requireValidWorktree,
    createListBranchesHandler()
  );
  router.post('/switch-branch', requireValidWorktree, createSwitchBranchHandler());
  router.post('/open-in-editor', validatePathParams('worktreePath'), createOpenInEditorHandler());
  router.post(
    '/open-in-terminal',
    validatePathParams('worktreePath'),
    createOpenInTerminalHandler()
  );
  router.get('/default-editor', createGetDefaultEditorHandler());
  router.get('/available-editors', createGetAvailableEditorsHandler());
  router.post('/refresh-editors', createRefreshEditorsHandler());

  // External terminal routes
  router.get('/available-terminals', createGetAvailableTerminalsHandler());
  router.get('/default-terminal', createGetDefaultTerminalHandler());
  router.post('/refresh-terminals', createRefreshTerminalsHandler());
  router.post(
    '/open-in-external-terminal',
    validatePathParams('worktreePath'),
    createOpenInExternalTerminalHandler()
  );

  router.post('/init-git', validatePathParams('projectPath'), createInitGitHandler());
  router.post('/migrate', createMigrateHandler());
  router.post(
    '/start-dev',
    validatePathParams('projectPath', 'worktreePath'),
    createStartDevHandler()
  );
  router.post('/stop-dev', createStopDevHandler());
  router.post('/list-dev-servers', createListDevServersHandler());
  router.get(
    '/dev-server-logs',
    validatePathParams('worktreePath'),
    createGetDevServerLogsHandler()
  );

  // Init script routes
  router.get('/init-script', createGetInitScriptHandler());
  router.put('/init-script', validatePathParams('projectPath'), createPutInitScriptHandler());
  router.delete('/init-script', validatePathParams('projectPath'), createDeleteInitScriptHandler());
  router.post(
    '/run-init-script',
    validatePathParams('projectPath', 'worktreePath'),
    createRunInitScriptHandler(events)
  );

  // Discard changes route
  router.post(
    '/discard-changes',
    validatePathParams('worktreePath'),
    requireGitRepoOnly,
    createDiscardChangesHandler()
  );

  // List remotes route
  router.post(
    '/list-remotes',
    validatePathParams('worktreePath'),
    requireValidWorktree,
    createListRemotesHandler()
  );

  // Graphite CLI integration routes
  router.post(
    '/graphite-status',
    validatePathParams('worktreePath'),
    requireGitRepoOnly,
    createGraphiteStatusHandler()
  );
  router.post(
    '/graphite-sync',
    validatePathParams('worktreePath'),
    requireGitRepoOnly,
    createGraphiteSyncHandler()
  );
  router.post(
    '/graphite-restack',
    validatePathParams('worktreePath'),
    requireGitRepoOnly,
    createGraphiteRestackHandler()
  );

  // Cherry-pick and rebase operations
  router.post('/cherry-pick', validatePathParams('worktreePath'), createCherryPickHandler());
  router.post(
    '/abort-operation',
    validatePathParams('worktreePath'),
    createAbortOperationHandler()
  );
  router.post(
    '/continue-operation',
    validatePathParams('worktreePath'),
    createContinueOperationHandler()
  );

  // Stash operations
  router.post('/stash-push', validatePathParams('worktreePath'), createStashPushHandler());
  router.post('/stash-list', validatePathParams('worktreePath'), createStashListHandler());
  router.post('/stash-apply', validatePathParams('worktreePath'), createStashApplyHandler());
  router.post('/stash-drop', validatePathParams('worktreePath'), createStashDropHandler());

  // Worktree health and recovery routes
  if (worktreeLifecycleService) {
    router.post(
      '/health',
      validatePathParams('projectPath'),
      createHealthHandler(worktreeLifecycleService)
    );
    router.post(
      '/prune',
      validatePathParams('projectPath'),
      createPruneHandler(worktreeLifecycleService)
    );
  }

  return router;
}
