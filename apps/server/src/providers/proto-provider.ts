/**
 * Proto Provider — executes agent queries via @protolabsai/sdk (the protoCLI
 * SDK at https://github.com/protoLabsAI/protoCLI/tree/dev/packages/sdk-typescript).
 *
 * Why this exists: we're cutting over from @anthropic-ai/claude-agent-sdk to
 * our own SDK so we control the full stack (multi-provider routing, gateway
 * auth, tool schemas, hook semantics). This is PR 1 of two — it adds the
 * provider so we can run real workloads through it before deleting
 * ClaudeProvider. See [[proto-sdk-namesake]] in /memory and PR 2 for the
 * full rip-out.
 *
 * Shape mapping vs. ClaudeProvider/Claude SDK:
 *   ExecuteOptions field        Proto SDK QueryOptions field
 *   --------------------        ----------------------------
 *   model                       model
 *   cwd                         cwd
 *   systemPrompt                systemPrompt (string form passes through)
 *   maxTurns                    maxSessionTurns
 *   allowedTools                coreTools
 *   disallowedTools             excludeTools
 *   canUseTool                  canUseTool
 *   abortController             abortController
 *   mcpServers                  mcpServers
 *   hooks (matcher arrays)      hookCallbacks (flat Record<HookEvent, fn>)
 *
 * Gateway: we set OPENAI_BASE_URL + OPENAI_API_KEY in the SDK process env so
 * proto routes every call through https://api.proto-labs.ai/v1 by default.
 * No Anthropic creds, no direct API calls.
 */

import {
  query,
  type QueryOptions,
  type SDKUserMessage,
  type HookCallback,
  type HookEvent,
} from '@protolabsai/sdk';
import { validateBareModelId } from '@protolabsai/types';
import { BaseProvider } from './base-provider.js';
import { classifyError, getUserFriendlyErrorMessage, createLogger } from '@protolabsai/utils';
import type {
  ExecuteOptions,
  ProviderMessage,
  InstallationStatus,
  ModelDefinition,
} from './types.js';

const logger = createLogger('ProtoProvider');

const DEFAULT_GATEWAY_BASE_URL = 'https://api.proto-labs.ai/v1';

/**
 * System env vars always passed through to the SDK process so spawned tools
 * (gh, git, shells inside the agent) work. Mirrors ClaudeProvider's
 * SYSTEM_ENV_VARS — keep them in sync until ClaudeProvider is deleted.
 */
const SYSTEM_ENV_VARS = [
  'PATH',
  'HOME',
  'SHELL',
  'TERM',
  'USER',
  'LANG',
  'LC_ALL',
  // Self-service API access (skills that call back to the server via A2A)
  'AUTOMAKER_API_KEY',
  'PORT',
  // Discord integration
  'DISCORD_TOKEN',
  'DISCORD_GUILD_ID',
  // GitHub CLI
  'GH_TOKEN',
  'GITHUB_TOKEN',
  // Plane integration
  'PLANE_API_KEY',
  'PLANE_BASE_URL',
  'PLANE_WORKSPACE_SLUG',
  'PLANE_WORKSPACE_ID',
];

/**
 * Build the env passed to the proto SDK process. Routes through the LiteLLM
 * gateway unless overridden. The SDK reads `OPENAI_API_KEY` / `OPENAI_BASE_URL`
 * for its OpenAI-compatible providers — both can be set here or via the
 * `baseURL` shortcut on QueryOptions.
 */
function buildEnv(): Record<string, string> {
  const env: Record<string, string> = {};

  // System vars passthrough — only set keys whose process.env value is a real
  // string so the proto SDK's `Record<string, string>` contract is honored
  // (it rejects `undefined` to avoid spawning subprocesses with bogus env).
  for (const key of SYSTEM_ENV_VARS) {
    const value = process.env[key];
    if (typeof value === 'string') {
      env[key] = value;
    }
  }

  // Gateway routing. GATEWAY_API_KEY > OPENAI_API_KEY so the rest of the
  // proto-labs surface can share one canonical env var name without forcing
  // existing OPENAI_API_KEY consumers to change.
  const gatewayKey = process.env.GATEWAY_API_KEY || process.env.OPENAI_API_KEY;
  if (gatewayKey) {
    env.OPENAI_API_KEY = gatewayKey;
  }
  const gatewayBaseUrl =
    process.env.GATEWAY_BASE_URL || process.env.OPENAI_BASE_URL || DEFAULT_GATEWAY_BASE_URL;
  env.OPENAI_BASE_URL = gatewayBaseUrl;

  // Langfuse OTel passthrough — the proto CLI honors OTEL_* like Claude Code
  // did, so per-turn traces continue to land in Langfuse without UI changes.
  const langfusePublicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const langfuseSecretKey = process.env.LANGFUSE_SECRET_KEY;
  const langfuseBaseUrl = process.env.LANGFUSE_BASE_URL;
  if (langfusePublicKey && langfuseSecretKey && langfuseBaseUrl) {
    env.OTEL_EXPORTER_OTLP_ENDPOINT = `${langfuseBaseUrl}/api/public/otel`;
    env.OTEL_EXPORTER_OTLP_HEADERS = `Authorization=Basic ${Buffer.from(
      `${langfusePublicKey}:${langfuseSecretKey}`
    ).toString('base64')}`;
  }

  return env;
}

/**
 * Convert Claude SDK-shaped hooks (matcher arrays under PreToolUse/PostToolUse
 * etc.) to proto SDK's flat `Record<HookEvent, HookCallback | HookCallback[]>`.
 *
 * Claude shape: `{ PreToolUse: [{ hooks: [fn1, fn2] }, { hooks: [fn3] }] }`
 * Proto shape:  `{ PreToolUse: [fn1, fn2, fn3] }`
 *
 * Returns undefined when there are no hooks to translate so callers can spread
 * `...(hookCallbacks && { hookCallbacks })`.
 */
function adaptHooks(
  hooks: ExecuteOptions['hooks']
): Partial<Record<HookEvent, HookCallback[]>> | undefined {
  if (!hooks) return undefined;
  const out: Partial<Record<HookEvent, HookCallback[]>> = {};
  const entries = Object.entries(hooks) as Array<
    [HookEvent, Array<{ hooks?: HookCallback[] }> | undefined]
  >;
  for (const [event, matchers] of entries) {
    if (!matchers) continue;
    const flat: HookCallback[] = [];
    for (const matcher of matchers) {
      if (matcher?.hooks) flat.push(...matcher.hooks);
    }
    if (flat.length > 0) {
      out[event] = flat;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export class ProtoProvider extends BaseProvider {
  getName(): string {
    return 'proto';
  }

  /**
   * Execute a query through the proto SDK.
   *
   * The SDK returns an `AsyncIterable<SDKMessage>`. We yield each message
   * through as a `ProviderMessage` — the upstream message-shape contract is
   * shared between Claude and Proto SDKs (both use the SDK*Message family).
   */
  async *executeQuery(options: ExecuteOptions): AsyncGenerator<ProviderMessage> {
    validateBareModelId(options.model, 'ProtoProvider');

    const {
      prompt,
      model,
      cwd,
      systemPrompt,
      maxTurns = 20,
      allowedTools,
      disallowedTools,
      abortController,
      canUseTool,
      mcpServers,
      hooks,
    } = options;

    const env = buildEnv();

    const queryOptions: QueryOptions = {
      model,
      cwd,
      env,
      // Field renames vs Claude SDK — see file header.
      maxSessionTurns: maxTurns,
      ...(allowedTools && { coreTools: allowedTools }),
      ...(disallowedTools && { excludeTools: disallowedTools }),
      ...(abortController && { abortController }),
      // Permission semantics: 'default' lets canUseTool gate; 'yolo' is the
      // full-trust autonomous fallback (closest analog to Claude's
      // bypassPermissions).
      permissionMode: canUseTool ? 'default' : 'yolo',
      ...(canUseTool && { canUseTool }),
      ...(mcpServers && { mcpServers }),
      // ExecuteOptions.systemPrompt is `string | SystemPromptPreset` where the
      // preset form is shaped for Claude SDK (`preset: 'claude_code'`). Proto
      // SDK takes a string or a `{ type: 'preset', preset: 'qwen_code' }`
      // shape. For PR 1 we only honor string form — preset forms are
      // translated to their `append` text or skipped, since the qwen preset
      // semantics differ from Claude Code's. PR 2 will surface a first-class
      // preset abstraction at the ExecuteOptions layer.
      ...(typeof systemPrompt === 'string' && { systemPrompt }),
      ...(() => {
        const hookCallbacks = adaptHooks(hooks);
        return hookCallbacks ? { hookCallbacks } : {};
      })(),
    };

    // Build prompt payload — proto SDK accepts the same string |
    // AsyncIterable<SDKUserMessage> union Claude did.
    let promptPayload: string | AsyncIterable<SDKUserMessage>;
    if (Array.isArray(prompt)) {
      promptPayload = (async function* () {
        yield {
          type: 'user',
          session_id: '',
          message: {
            role: 'user' as const,
            content: prompt,
          },
          parent_tool_use_id: null,
        } as SDKUserMessage;
      })();
    } else {
      promptPayload = prompt;
    }

    logger.debug('[ProtoProvider] SDK configuration', {
      model: queryOptions.model,
      baseURL: env.OPENAI_BASE_URL,
      hasApiKey: !!env.OPENAI_API_KEY,
      maxSessionTurns: queryOptions.maxSessionTurns,
      permissionMode: queryOptions.permissionMode,
      hookEvents: queryOptions.hookCallbacks ? Object.keys(queryOptions.hookCallbacks) : [],
    });

    try {
      const stream = query({ prompt: promptPayload, options: queryOptions });
      for await (const msg of stream) {
        yield msg as ProviderMessage;
      }
    } catch (error) {
      const errorInfo = classifyError(error);
      const userMessage = getUserFriendlyErrorMessage(error);
      logger.error('executeQuery() error during execution:', {
        type: errorInfo.type,
        message: errorInfo.message,
        isRateLimit: errorInfo.isRateLimit,
        retryAfter: errorInfo.retryAfter,
        stack: (error as Error).stack,
      });
      const message = errorInfo.isRateLimit
        ? `${userMessage}\n\nTip: gateway rate limit hit. Reduce concurrency or try a different model.`
        : userMessage;
      const enhancedError = new Error(message);
      Object.assign(enhancedError, {
        originalError: error,
        type: errorInfo.type,
        ...(errorInfo.isRateLimit &&
          errorInfo.retryAfter !== undefined && { retryAfter: errorInfo.retryAfter }),
      });
      throw enhancedError;
    }
  }

  /**
   * Detect installation. Proto SDK bundles its own CLI binary, so the only
   * real prerequisite is gateway credentials. "Installed" here means "we have
   * a route to a working LLM via the gateway."
   */
  async detectInstallation(): Promise<InstallationStatus> {
    const hasGatewayKey = !!(process.env.GATEWAY_API_KEY || process.env.OPENAI_API_KEY);
    return {
      installed: true,
      method: 'sdk',
      hasApiKey: hasGatewayKey,
      authenticated: hasGatewayKey,
    };
  }

  /**
   * Models exposed by ProtoProvider are the gateway-known set. The canonical
   * list is fetched live from the gateway's /v1/models endpoint elsewhere;
   * this method returns the curated defaults that ship with the product.
   */
  getAvailableModels(): ModelDefinition[] {
    return [
      {
        id: 'protolabs/smart',
        name: 'protoLabs Smart',
        modelString: 'protolabs/smart',
        provider: 'protolabs',
        description: 'Gateway-routed default — picks the best model for the task.',
        contextWindow: 200000,
        maxOutputTokens: 16000,
        supportsVision: true,
        supportsTools: true,
        tier: 'standard' as const,
        default: true,
      },
      {
        id: 'protolabs/fast',
        name: 'protoLabs Fast',
        modelString: 'protolabs/fast',
        provider: 'protolabs',
        description: 'Gateway-routed fast tier for quick agent loops.',
        contextWindow: 128000,
        maxOutputTokens: 8000,
        supportsVision: false,
        supportsTools: true,
        tier: 'basic' as const,
      },
    ] satisfies ModelDefinition[];
  }

  supportsFeature(feature: string): boolean {
    return ['tools', 'text', 'vision', 'thinking'].includes(feature);
  }
}

/**
 * Match any model that should route through the proto SDK. For PR 1 this is
 * conservative — only models that explicitly start with `protolabs/` are
 * claimed. PR 2 will widen this to "anything not claimed by a more-specific
 * provider" once we've validated the path end-to-end.
 */
export function isProtoModel(model: string): boolean {
  return model.startsWith('protolabs/');
}
