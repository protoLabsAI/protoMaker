/**
 * Setup routes - HTTP API for CLI detection, API keys, and platform info
 */

import { Router } from 'express';
import { createClaudeStatusHandler } from './routes/claude-status.js';
import { createInstallClaudeHandler } from './routes/install-claude.js';
import { createAuthClaudeHandler } from './routes/auth-claude.js';
import { createStoreApiKeyHandler } from './routes/store-api-key.js';
import { createDeleteApiKeyHandler } from './routes/delete-api-key.js';
import { createApiKeysHandler } from './routes/api-keys.js';
import { createPlatformHandler } from './routes/platform.js';
import { createVerifyClaudeAuthHandler } from './routes/verify-claude-auth.js';
import { createVerifyCodexAuthHandler } from './routes/verify-codex-auth.js';
import { createGhStatusHandler } from './routes/gh-status.js';
import { createCursorStatusHandler } from './routes/cursor-status.js';
import { createCodexStatusHandler } from './routes/codex-status.js';
import { createInstallCodexHandler } from './routes/install-codex.js';
import { createAuthCodexHandler } from './routes/auth-codex.js';
import { createAuthCursorHandler } from './routes/auth-cursor.js';
import { createDeauthClaudeHandler } from './routes/deauth-claude.js';
import { createDeauthCodexHandler } from './routes/deauth-codex.js';
import { createDeauthCursorHandler } from './routes/deauth-cursor.js';
import { createAuthOpencodeHandler } from './routes/auth-opencode.js';
import { createDeauthOpencodeHandler } from './routes/deauth-opencode.js';
import { createOpencodeStatusHandler } from './routes/opencode-status.js';
import {
  createGetOpencodeModelsHandler,
  createRefreshOpencodeModelsHandler,
  createGetOpencodeProvidersHandler,
  createClearOpencodeCacheHandler,
} from './routes/opencode-models.js';
import {
  createGetCursorConfigHandler,
  createSetCursorDefaultModelHandler,
  createSetCursorModelsHandler,
  createGetCursorPermissionsHandler,
  createApplyPermissionProfileHandler,
  createSetCustomPermissionsHandler,
  createDeleteProjectPermissionsHandler,
  createGetExampleConfigHandler,
} from './routes/cursor-config.js';
import { createSetupProjectHandler } from './routes/project.js';
import { createResearchHandler } from './routes/research.js';
import { createGapAnalysisHandler } from './routes/gap-analysis.js';
import { createProposeHandler } from './routes/propose.js';
import { createDiscordProvisionHandler } from './routes/discord-provision.js';
import { createCloneHandler } from './routes/clone.js';
import { createReportHandler } from './routes/report.js';
import { createOpenReportHandler } from './routes/open-report.js';
import { createDeliverHandler } from './routes/deliver.js';
import type { SettingsService } from '../../services/settings-service.js';

export function createSetupRoutes(settingsService: SettingsService): Router {
  const router = Router();

  router.get('/claude-status', createClaudeStatusHandler());
  router.post('/install-claude', createInstallClaudeHandler());
  router.post('/auth-claude', createAuthClaudeHandler());
  router.post('/deauth-claude', createDeauthClaudeHandler());
  router.post('/store-api-key', createStoreApiKeyHandler());
  router.post('/delete-api-key', createDeleteApiKeyHandler());
  router.get('/api-keys', createApiKeysHandler());
  router.get('/platform', createPlatformHandler());
  router.post('/verify-claude-auth', createVerifyClaudeAuthHandler());
  router.post('/verify-codex-auth', createVerifyCodexAuthHandler());
  router.get('/gh-status', createGhStatusHandler());

  // Cursor CLI routes
  router.get('/cursor-status', createCursorStatusHandler());
  router.post('/auth-cursor', createAuthCursorHandler());
  router.post('/deauth-cursor', createDeauthCursorHandler());

  // Codex CLI routes
  router.get('/codex-status', createCodexStatusHandler());
  router.post('/install-codex', createInstallCodexHandler());
  router.post('/auth-codex', createAuthCodexHandler());
  router.post('/deauth-codex', createDeauthCodexHandler());

  // OpenCode CLI routes
  router.get('/opencode-status', createOpencodeStatusHandler());
  router.post('/auth-opencode', createAuthOpencodeHandler());
  router.post('/deauth-opencode', createDeauthOpencodeHandler());

  // OpenCode Dynamic Model Discovery routes
  router.get('/opencode/models', createGetOpencodeModelsHandler());
  router.post('/opencode/models/refresh', createRefreshOpencodeModelsHandler());
  router.get('/opencode/providers', createGetOpencodeProvidersHandler());
  router.post('/opencode/cache/clear', createClearOpencodeCacheHandler());
  router.get('/cursor-config', createGetCursorConfigHandler());
  router.post('/cursor-config/default-model', createSetCursorDefaultModelHandler());
  router.post('/cursor-config/models', createSetCursorModelsHandler());

  // Cursor CLI Permissions routes
  router.get('/cursor-permissions', createGetCursorPermissionsHandler());
  router.post('/cursor-permissions/profile', createApplyPermissionProfileHandler());
  router.post('/cursor-permissions/custom', createSetCustomPermissionsHandler());
  router.delete('/cursor-permissions', createDeleteProjectPermissionsHandler());
  router.get('/cursor-permissions/example', createGetExampleConfigHandler());

  // Project setup routes
  router.post('/project', createSetupProjectHandler(settingsService));

  // Setup pipeline routes
  router.post('/research', createResearchHandler());
  router.post('/gap-analysis', createGapAnalysisHandler());
  router.post('/propose', createProposeHandler());
  router.post('/report', createReportHandler());
  router.post('/open-report', createOpenReportHandler());
  router.post('/discord-provision', createDiscordProvisionHandler());
  // Labs management routes
  router.post('/clone', createCloneHandler());
  router.post('/deliver', createDeliverHandler());

  return router;
}
