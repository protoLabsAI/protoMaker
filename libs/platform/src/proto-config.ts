/**
 * proto.config.yaml Schema & Loader
 *
 * Handles reading, merging, and writing proto.config.yaml — the project-level
 * configuration file for Automaker/protoLabs projects.
 *
 * Merge order (later wins):
 *   1. proto.config.yaml  — base config
 *   2. .automaker/settings.json `proto` key — local overrides
 *   3. PROTO_* env vars — environment overrides
 *
 * Returns null from loadProtoConfig() when no proto.config.yaml exists,
 * which indicates single-instance mode (no multi-project config needed).
 */

import path from 'path';
import fs from 'node:fs';

// yaml is loaded lazily to avoid CJS/ESM compatibility issues
// ("Dynamic require of process is not supported") when platform
// is imported transitively through ESM packages like git-utils.
let _parseYaml: (typeof import('yaml'))['parse'] | undefined;
let _stringifyYaml: (typeof import('yaml'))['stringify'] | undefined;

async function getYaml(): Promise<{
  parse: (typeof import('yaml'))['parse'];
  stringify: (typeof import('yaml'))['stringify'];
}> {
  if (!_parseYaml || !_stringifyYaml) {
    const yaml = await import('yaml');
    _parseYaml = yaml.parse;
    _stringifyYaml = yaml.stringify;
  }
  return { parse: _parseYaml, stringify: _stringifyYaml };
}

// ─── Schema ──────────────────────────────────────────────────────────────────

export interface ProtoConfigBrand {
  studio?: string;
  domain?: string;
}

export interface ProtoConfigDiscord {
  serverId?: string;
  channelId?: string;
}

export interface ProtoConfigServer {
  port?: number;
}

/**
 * Top-level shape of proto.config.yaml.
 * Open-ended (`[key: string]: unknown`) so callers can store additional fields.
 */
export interface ProtoConfig {
  name?: string;
  description?: string;
  brand?: ProtoConfigBrand;
  discord?: ProtoConfigDiscord;
  server?: ProtoConfigServer;
  [key: string]: unknown;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const PROTO_CONFIG_FILENAME = 'proto.config.yaml';
const SETTINGS_OVERRIDE_PATH = path.join('.automaker', 'settings.json');

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Performs a shallow-recursive merge of `override` into `base`.
 * Object-valued keys are merged recursively; all other types are replaced.
 */
function deepMerge(
  base: Record<string, unknown>,
  override: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };
  for (const key of Object.keys(override)) {
    const ov = override[key];
    const bv = base[key];
    if (
      ov !== null &&
      ov !== undefined &&
      typeof ov === 'object' &&
      !Array.isArray(ov) &&
      typeof bv === 'object' &&
      bv !== null &&
      !Array.isArray(bv)
    ) {
      result[key] = deepMerge(bv as Record<string, unknown>, ov as Record<string, unknown>);
    } else if (ov !== undefined) {
      result[key] = ov;
    }
  }
  return result;
}

/**
 * Applies PROTO_* environment variable overrides to a config object.
 *
 * Supported env vars:
 *   PROTO_NAME                — config.name
 *   PROTO_DESCRIPTION         — config.description
 *   PROTO_BRAND_STUDIO        — config.brand.studio
 *   PROTO_BRAND_DOMAIN        — config.brand.domain
 *   PROTO_DISCORD_SERVER_ID   — config.discord.serverId
 *   PROTO_DISCORD_CHANNEL_ID  — config.discord.channelId
 *   PROTO_SERVER_PORT         — config.server.port (integer)
 */
function applyEnvOverrides(config: ProtoConfig): ProtoConfig {
  const result: ProtoConfig = { ...config };

  if (process.env.PROTO_NAME) result.name = process.env.PROTO_NAME;
  if (process.env.PROTO_DESCRIPTION) result.description = process.env.PROTO_DESCRIPTION;

  if (process.env.PROTO_BRAND_STUDIO || process.env.PROTO_BRAND_DOMAIN) {
    result.brand = { ...result.brand };
    if (process.env.PROTO_BRAND_STUDIO) result.brand.studio = process.env.PROTO_BRAND_STUDIO;
    if (process.env.PROTO_BRAND_DOMAIN) result.brand.domain = process.env.PROTO_BRAND_DOMAIN;
  }

  if (process.env.PROTO_DISCORD_SERVER_ID || process.env.PROTO_DISCORD_CHANNEL_ID) {
    result.discord = { ...result.discord };
    if (process.env.PROTO_DISCORD_SERVER_ID)
      result.discord.serverId = process.env.PROTO_DISCORD_SERVER_ID;
    if (process.env.PROTO_DISCORD_CHANNEL_ID)
      result.discord.channelId = process.env.PROTO_DISCORD_CHANNEL_ID;
  }

  if (process.env.PROTO_SERVER_PORT) {
    const port = parseInt(process.env.PROTO_SERVER_PORT, 10);
    if (!isNaN(port)) {
      result.server = { ...result.server, port };
    }
  }

  return result;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Reads and merges the proto.config.yaml for a project.
 *
 * Returns null when no `proto.config.yaml` exists at `projectPath`
 * (i.e. single-instance mode — no multi-project configuration required).
 *
 * Merge order (later wins):
 *   1. proto.config.yaml base values
 *   2. `.automaker/settings.json` → `proto` key overrides
 *   3. PROTO_* environment variable overrides
 *
 * @param projectPath - Absolute path to the project root directory
 */
export async function loadProtoConfig(projectPath: string): Promise<ProtoConfig | null> {
  const configPath = path.join(projectPath, PROTO_CONFIG_FILENAME);

  // Single-instance mode: no proto.config.yaml present
  if (!fs.existsSync(configPath)) {
    return null;
  }

  // Layer 1: parse YAML base
  const { parse: parseYaml } = await getYaml();
  const raw = fs.readFileSync(configPath, 'utf-8');
  const base: ProtoConfig = (parseYaml(raw) as ProtoConfig | null) ?? {};

  // Layer 2: .automaker/settings.json `proto` key overrides
  const settingsPath = path.join(projectPath, SETTINGS_OVERRIDE_PATH);
  let merged: Record<string, unknown> = base as Record<string, unknown>;

  if (fs.existsSync(settingsPath)) {
    try {
      const settingsRaw = fs.readFileSync(settingsPath, 'utf-8');
      const settings = JSON.parse(settingsRaw) as Record<string, unknown>;
      if (
        settings['proto'] &&
        typeof settings['proto'] === 'object' &&
        !Array.isArray(settings['proto'])
      ) {
        merged = deepMerge(merged, settings['proto'] as Record<string, unknown>);
      }
    } catch {
      // Malformed settings.json — skip, don't crash
    }
  }

  // Layer 3: env var overrides
  return applyEnvOverrides(merged as ProtoConfig);
}

/**
 * Writes a ProtoConfig to `proto.config.yaml` in the given project directory.
 * Creates the file if it does not exist; overwrites if it does.
 * Used by setuplab to generate the initial configuration file.
 *
 * @param projectPath - Absolute path to the project root directory
 * @param config      - Configuration object to serialise
 */
export async function writeProtoConfig(projectPath: string, config: ProtoConfig): Promise<void> {
  const configPath = path.join(projectPath, PROTO_CONFIG_FILENAME);
  const { stringify: stringifyYaml } = await getYaml();
  const yaml = stringifyYaml(config, { lineWidth: 0 });
  fs.writeFileSync(configPath, yaml, 'utf-8');
}
