/**
 * GET /proto-status endpoint — Detect protoCLI installation + gateway auth.
 *
 * Surfaces:
 *   - whether `proto` is on PATH (standalone install via `npm i -g @protolabsai/proto`)
 *   - the proto CLI version
 *   - whether gateway env is wired (GATEWAY_API_KEY / OPENAI_API_KEY)
 *   - whether the configured gateway base URL responds to /v1/models
 *
 * Used by the protoCLI setup step in the onboarding wizard and the protoCLI
 * settings tab to render install/auth status. Mirrors the shape of
 * codex-status / cursor-status so the UI's existing status-card pattern
 * works without new component code.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Request, Response } from 'express';
import { getErrorMessage, logError } from '../common.js';

const execFileAsync = promisify(execFile);

const DISCONNECTED_MARKER_FILE = '.proto-disconnected';

const INSTALL_COMMAND = 'npm install -g @protolabsai/proto';
const LOGIN_COMMAND =
  '# proto reads GATEWAY_API_KEY / OPENAI_API_KEY from env; the OpenAI-compatible ' +
  'auth-type (→ gateway) is seeded in ~/.proto/settings.json at container start (#4042). ' +
  'Standalone: `proto qwen setup` or set security.auth.selectedType=openai in ~/.proto/settings.json.';
const DEFAULT_GATEWAY_BASE_URL = 'https://api.proto-labs.ai/v1';
/**
 * Cap the `proto --version` probe so a misbehaving install can't hang the
 * health check. The CLI normally returns in <100ms; 4s is well beyond that.
 */
const PROTO_VERSION_TIMEOUT_MS = 4000;
/**
 * Cap the gateway reachability check. Same logic as `proto --version` — fast
 * happy path, hard cap on the misbehaving case.
 */
const GATEWAY_REACHABILITY_TIMEOUT_MS = 5000;

function isProtoDisconnectedFromApp(): boolean {
  try {
    const projectRoot = process.cwd();
    const markerPath = path.join(projectRoot, '.automaker', DISCONNECTED_MARKER_FILE);
    return fs.existsSync(markerPath);
  } catch {
    return false;
  }
}

interface ProtoBinaryInfo {
  installed: boolean;
  version: string | null;
  path: string | null;
}

/**
 * Probe the `proto` CLI on PATH. Returns null version when the binary isn't
 * available or doesn't respond to `--version` within the timeout.
 */
async function detectProtoBinary(): Promise<ProtoBinaryInfo> {
  try {
    const { stdout } = await execFileAsync('proto', ['--version'], {
      timeout: PROTO_VERSION_TIMEOUT_MS,
      windowsHide: true,
    });
    const version = stdout.trim() || null;

    // Resolve the resolved path so settings UI can show where it lives — does
    // not fail the detection if `which` is unavailable (e.g. Windows).
    let resolvedPath: string | null = null;
    try {
      const { stdout: whichOut } = await execFileAsync(
        process.platform === 'win32' ? 'where' : 'which',
        ['proto'],
        { timeout: 1500, windowsHide: true }
      );
      resolvedPath = whichOut.split('\n')[0]?.trim() || null;
    } catch {
      // which/where unavailable; carry on without the path
    }

    return { installed: true, version, path: resolvedPath };
  } catch {
    return { installed: false, version: null, path: null };
  }
}

interface GatewayAuthInfo {
  hasApiKey: boolean;
  apiKeySource: 'GATEWAY_API_KEY' | 'OPENAI_API_KEY' | 'none';
  baseUrl: string;
}

function detectGatewayAuth(): GatewayAuthInfo {
  if (process.env.GATEWAY_API_KEY) {
    return {
      hasApiKey: true,
      apiKeySource: 'GATEWAY_API_KEY',
      baseUrl:
        process.env.GATEWAY_BASE_URL || process.env.OPENAI_BASE_URL || DEFAULT_GATEWAY_BASE_URL,
    };
  }
  if (process.env.OPENAI_API_KEY) {
    return {
      hasApiKey: true,
      apiKeySource: 'OPENAI_API_KEY',
      baseUrl:
        process.env.OPENAI_BASE_URL || process.env.GATEWAY_BASE_URL || DEFAULT_GATEWAY_BASE_URL,
    };
  }
  return {
    hasApiKey: false,
    apiKeySource: 'none',
    baseUrl:
      process.env.GATEWAY_BASE_URL || process.env.OPENAI_BASE_URL || DEFAULT_GATEWAY_BASE_URL,
  };
}

interface GatewayReachability {
  reachable: boolean;
  status: number | null;
  modelCount: number | null;
  error: string | null;
}

/**
 * Probe `${baseUrl}/models` with the resolved API key to confirm the gateway
 * is reachable AND the key is authorized. A 200 with a `data` array means
 * proto can actually do work; anything else is a configuration problem the
 * UI should surface.
 */
async function checkGatewayReachable(
  baseUrl: string,
  apiKey: string | null
): Promise<GatewayReachability> {
  if (!apiKey) {
    return { reachable: false, status: null, modelCount: null, error: 'no api key' };
  }
  const url = `${baseUrl.replace(/\/$/, '')}/models`;
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(GATEWAY_REACHABILITY_TIMEOUT_MS),
    });
    if (!response.ok) {
      return {
        reachable: false,
        status: response.status,
        modelCount: null,
        error: `gateway HTTP ${response.status}`,
      };
    }
    const data = (await response.json()) as { data?: unknown[] };
    return {
      reachable: true,
      status: response.status,
      modelCount: Array.isArray(data?.data) ? data.data.length : null,
      error: null,
    };
  } catch (err) {
    return {
      reachable: false,
      status: null,
      modelCount: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Creates handler for GET /api/setup/proto-status.
 *
 * Returns the union of:
 *   - proto CLI installation status (binary on PATH + version + path)
 *   - gateway auth status (api key presence + source env var + base URL)
 *   - gateway reachability (HTTP status from /models + model count)
 *   - install/login command hints for the UI's "fix it" CTA
 */
export function createProtoStatusHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      if (isProtoDisconnectedFromApp()) {
        res.json({
          success: true,
          installed: false,
          version: null,
          path: null,
          gateway: {
            hasApiKey: false,
            apiKeySource: 'none',
            baseUrl: DEFAULT_GATEWAY_BASE_URL,
            reachable: false,
            modelCount: null,
            error: 'disconnected',
          },
          installCommand: INSTALL_COMMAND,
          loginCommand: LOGIN_COMMAND,
        });
        return;
      }

      const binary = await detectProtoBinary();
      const auth = detectGatewayAuth();
      const apiKey =
        auth.apiKeySource === 'GATEWAY_API_KEY'
          ? (process.env.GATEWAY_API_KEY ?? null)
          : auth.apiKeySource === 'OPENAI_API_KEY'
            ? (process.env.OPENAI_API_KEY ?? null)
            : null;
      const reachability = await checkGatewayReachable(auth.baseUrl, apiKey);

      res.json({
        success: true,
        installed: binary.installed,
        version: binary.version,
        path: binary.path,
        gateway: {
          hasApiKey: auth.hasApiKey,
          apiKeySource: auth.apiKeySource,
          baseUrl: auth.baseUrl,
          reachable: reachability.reachable,
          status: reachability.status,
          modelCount: reachability.modelCount,
          error: reachability.error,
        },
        installCommand: INSTALL_COMMAND,
        loginCommand: LOGIN_COMMAND,
      });
    } catch (error) {
      logError(error, 'Get proto status failed');
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}
