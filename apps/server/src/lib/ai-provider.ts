/**
 * AI Provider — chat-route language model factory, routed through the protoLabs
 * LiteLLM gateway by default.
 *
 * History: this file used to wrap `@ai-sdk/anthropic` for direct Anthropic
 * calls. As of the gateway-first migration we no longer talk to api.anthropic.com
 * directly — every chat request goes through the gateway via the OpenAI-compatible
 * `/v1/chat/completions` endpoint. Anthropic OAuth (Claude Max/Pro) and bare
 * ANTHROPIC_API_KEY are no longer used; the gateway terminates auth.
 *
 * The export name `getAnthropicModel` is kept to avoid touching every caller in
 * the same change; a follow-up can rename to `getChatModel`. Callers should
 * pass any model identifier the gateway recognizes (e.g. `protolabs/smart`,
 * `protolabs/fast`). Legacy Claude aliases (`sonnet`, `opus`, `claude-sonnet-4-6`)
 * fall back to `protolabs/smart` so existing UI surfaces don't crash mid-migration.
 *
 * Auth resolution order:
 * 1. GATEWAY_API_KEY env var
 * 2. OPENAI_API_KEY env var (alias — the gateway speaks OpenAI's wire format)
 * 3. `apiKeys.protolabsGateway` from settings credentials (when wired)
 * 4. Empty string + warn (the gateway will reject the request — but the server
 *    won't crash at boot, which keeps the rest of the API surface usable)
 *
 * Base URL: GATEWAY_BASE_URL or OPENAI_BASE_URL env var,
 * default `https://api.proto-labs.ai/v1`.
 */

import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModelV3 } from '@ai-sdk/provider';
import { createLogger } from '@protolabsai/utils';

const logger = createLogger('AIProvider');

const DEFAULT_BASE_URL = 'https://api.proto-labs.ai/v1';
/** Models the gateway knows about that legacy Claude aliases should fall back to. */
const FALLBACK_GATEWAY_MODEL = 'protolabs/smart';

/** Cached provider instance — created once, reused across requests. */
let cachedProvider: ReturnType<typeof createOpenAICompatible> | null = null;

/**
 * Credential resolver function — set by the server at boot to wire in
 * settingsService.getCredentials() without a circular import.
 */
let credentialResolver:
  | (() => Promise<{ apiKeys?: { protolabsGateway?: string; anthropic?: string } }>)
  | null = null;

/**
 * Register the credential resolver (called once at server startup).
 * Kept as the same export name as the legacy Anthropic version so callers
 * don't need to change.
 */
export function setCredentialResolver(
  resolver: () => Promise<{ apiKeys?: { protolabsGateway?: string; anthropic?: string } }>
): void {
  credentialResolver = resolver;
  // Invalidate cache so next request picks up the resolver
  cachedProvider = null;
}

/**
 * Resolve a gateway API key from the chain above. Returns the key + a label
 * for logging.
 */
async function resolveApiKey(): Promise<{ key: string; source: string }> {
  if (credentialResolver) {
    try {
      const credentials = await credentialResolver();
      const fromSettings = credentials.apiKeys?.protolabsGateway;
      if (fromSettings) return { key: fromSettings, source: 'settings.protolabsGateway' };
    } catch {
      // ignore, continue chain
    }
  }
  if (process.env.GATEWAY_API_KEY) {
    return { key: process.env.GATEWAY_API_KEY, source: 'env.GATEWAY_API_KEY' };
  }
  if (process.env.OPENAI_API_KEY) {
    return { key: process.env.OPENAI_API_KEY, source: 'env.OPENAI_API_KEY' };
  }
  return { key: '', source: 'none' };
}

/**
 * Build or return the cached OpenAI-compatible provider pointed at the gateway.
 */
async function getOrCreateProvider(): Promise<ReturnType<typeof createOpenAICompatible>> {
  if (cachedProvider) return cachedProvider;

  const baseURL = process.env.GATEWAY_BASE_URL || process.env.OPENAI_BASE_URL || DEFAULT_BASE_URL;
  const { key, source } = await resolveApiKey();

  if (!key) {
    logger.warn(
      'No gateway API key found. Chat requests will fail. ' +
        'Set GATEWAY_API_KEY in the server environment or enter a key in Settings. ' +
        'Not caching the provider — it will re-resolve on the next request.'
    );
    // Transient provider — intentionally NOT cached so a later key addition
    // (env or Settings) recovers without a full restart (#3771). Caching an
    // empty-key provider previously wedged the whole process until restart.
    return createOpenAICompatible({ name: 'protolabs-gateway', baseURL, apiKey: key });
  }

  logger.info(`Gateway provider initialized: baseURL=${baseURL} keySource=${source}`);
  cachedProvider = createOpenAICompatible({
    name: 'protolabs-gateway',
    baseURL,
    apiKey: key,
  });
  return cachedProvider;
}

/**
 * Whether a gateway key currently resolves. Used by the startup health gate
 * to surface a keyless server loudly instead of letting every model call
 * silently 401. See #3771.
 */
export async function hasGatewayKey(): Promise<boolean> {
  const { key } = await resolveApiKey();
  return key.length > 0;
}

/**
 * Map a legacy Claude alias to a gateway model. Any non-Claude model name
 * (e.g. `protolabs/smart`, `protolabs/fast`) passes through unchanged.
 *
 * Why: chat default falls through to `'sonnet'` in several places. Until that
 * default is fully scrubbed, treat Claude-flavored names as a request for the
 * gateway's smart model instead of letting them leak to a now-unsupported path.
 */
function mapLegacyClaudeModel(modelId: string): string {
  const lower = modelId.toLowerCase();
  if (lower === 'sonnet' || lower === 'opus' || lower === 'haiku' || lower.startsWith('claude-')) {
    return FALLBACK_GATEWAY_MODEL;
  }
  return modelId;
}

/**
 * Get a language model instance routed through the gateway.
 *
 * Drop-in replacement for the old `getAnthropicModel(...)` signature; callers
 * pass a model id and receive a model object compatible with
 * `streamText`/`generateText`.
 *
 * Legacy Claude aliases are silently remapped to `protolabs/smart` so existing
 * UI flows don't 4xx during the migration window.
 */
export async function getAnthropicModel(modelId: string): Promise<LanguageModelV3> {
  const provider = await getOrCreateProvider();
  const mapped = mapLegacyClaudeModel(modelId);
  if (mapped !== modelId) {
    logger.debug(`Remapped legacy model id ${modelId} -> ${mapped}`);
  }
  return provider(mapped);
}

/**
 * Invalidate the cached provider (e.g., after credentials change).
 */
export function resetAnthropicProvider(): void {
  cachedProvider = null;
}
