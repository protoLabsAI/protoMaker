/**
 * HTTP API Client for web mode.
 *
 * This is the composition root: it assembles domain-specific client mixins
 * into a single HttpApiClient class and re-exports the auth utilities that
 * consumers import directly from this module.
 *
 * Domain-specific implementations live under `./clients/`:
 *   auth.ts             — server URL, API key, session token, auth operations
 *   base-http-client.ts — WebSocket + HTTP helpers (BaseHttpClient)
 *   api-types.ts        — shared response interfaces
 *   filesystem-client.ts — ping, openDirectory, readFile, writeFile, etc.
 *   setup-client.ts     — model, setup, setupLab
 *   features-client.ts  — features, autoMode, enhancePrompt, suggestions, specRegeneration, backlogPlan
 *   agent-client.ts     — runningAgents, github, workspace, agent, templates, agentTemplates
 *   git-client.ts       — worktree, git
 *   settings-client.ts  — settings, sessions, claude, codex, context
 *   content-client.ts   — notes, ai, contentPipeline, authorityPipeline, voice
 *   system-client.ts    — mcp, pipeline, metrics, integrations, system, analytics, lifecycle
 *   engine-client.ts    — engine
 *   hitl-client.ts      — notifications, hitlForms, actionableItems, eventHistory
 *   ava-client.ts       — ava (getConfig, updateConfig)
 */

import { createLogger } from '@protolabs-ai/utils/logger';

// Re-export auth utilities — consumed by login-view, terminal-panel, account-section, etc.
export {
  isConnectionError,
  handleServerOffline,
  getServerUrlSync,
  getApiKey,
  getSessionToken,
  setSessionToken,
  clearSessionToken,
  initApiKey,
  waitForApiKeyInit,
  isElectronMode,
  checkExternalServerMode,
  isExternalServerMode,
  checkAuthStatus,
  login,
  fetchSessionToken,
  logout,
  verifySession,
  checkSandboxEnvironment,
  notifyLoggedOut,
  notifyServerOffline,
  handleUnauthorized,
  NO_STORE_CACHE_MODE,
} from './clients/auth';

// Re-export API response types — consumed by components that type their state
export type {
  LedgerAggregateResponse,
  TimeSeriesResponse,
  ModelDistributionResponse,
  CycleTimeDistributionResponse,
  CapacityMetricsResponse,
  IntegrationStatusResponse,
  SystemHealthResponse,
  DevServerStartedEvent,
  DevServerOutputEvent,
  DevServerStoppedEvent,
  DevServerLogEvent,
  DevServerLogsResponse,
} from './clients/api-types';

// Re-export base types used by a few consumers
export type { EventType, EventCallback, Constructor } from './clients/base-http-client';

// Domain-specific mixins
import { BaseHttpClient } from './clients/base-http-client';
import { withFilesystemClient } from './clients/filesystem-client';
import { withSetupClient } from './clients/setup-client';
import { withFeaturesClient } from './clients/features-client';
import { withAgentClient } from './clients/agent-client';
import { withGitClient } from './clients/git-client';
import { withSettingsClient } from './clients/settings-client';
import { withContentClient } from './clients/content-client';
import { withSystemClient } from './clients/system-client';
import { withEngineClient } from './clients/engine-client';
import { withHitlClient } from './clients/hitl-client';
import { withAvaClient } from './clients/ava-client';
import { initApiKey } from './clients/auth';

const logger = createLogger('HttpClient');

// Compose all domain mixins into the final client class
const ComposedHttpClient = withAvaClient(
  withEngineClient(
    withSystemClient(
      withHitlClient(
        withContentClient(
          withSettingsClient(
            withSetupClient(
              withGitClient(
                withAgentClient(withFeaturesClient(withFilesystemClient(BaseHttpClient)))
              )
            )
          )
        )
      )
    )
  )
);

// HttpApiClient is the full client — all domain APIs in one place
class HttpApiClient extends ComposedHttpClient {}

// Singleton instance
let httpApiClientInstance: HttpApiClient | null = null;

export function getHttpApiClient(): HttpApiClient {
  if (!httpApiClientInstance) {
    httpApiClientInstance = new HttpApiClient();
  }
  return httpApiClientInstance;
}

// Start API key initialization immediately when this module is imported
// This ensures the init promise is created early, even before React components mount
// The actual async work happens in the background and won't block module loading
initApiKey().catch((error) => {
  logger.error('Failed to initialize API key:', error);
});
