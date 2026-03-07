import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'node:fs';
import os from 'node:os';
import { loadProtoConfig, writeProtoConfig } from '../src/proto-config.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'proto-config-test-'));
}

function writeFile(dir: string, relPath: string, content: string): void {
  const full = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf-8');
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('loadProtoConfig', () => {
  let tmpDir: string;
  let savedEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    tmpDir = makeTempDir();
    savedEnv = { ...process.env };
    // Clear any PROTO_* env vars that might bleed between tests
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('PROTO_')) delete process.env[key];
    }
  });

  afterEach(() => {
    process.env = savedEnv;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns null when proto.config.yaml does not exist (single-instance mode)', async () => {
    const result = await loadProtoConfig(tmpDir);
    expect(result).toBeNull();
  });

  it('parses a valid proto.config.yaml', async () => {
    writeFile(tmpDir, 'proto.config.yaml', 'name: my-project\ndescription: A test project\n');
    const result = await loadProtoConfig(tmpDir);
    expect(result).not.toBeNull();
    expect(result?.name).toBe('my-project');
    expect(result?.description).toBe('A test project');
  });

  it('parses nested YAML fields', async () => {
    writeFile(
      tmpDir,
      'proto.config.yaml',
      'name: nested\nbrand:\n  studio: protoLabs.studio\n  domain: protolabs.studio\n'
    );
    const result = await loadProtoConfig(tmpDir);
    expect(result?.brand?.studio).toBe('protoLabs.studio');
    expect(result?.brand?.domain).toBe('protolabs.studio');
  });

  describe('layered merge: settings.json overrides', () => {
    it('merges proto key from settings.json over YAML base', async () => {
      writeFile(tmpDir, 'proto.config.yaml', 'name: base-name\ndescription: base-desc\n');
      writeFile(
        tmpDir,
        '.automaker/settings.json',
        JSON.stringify({ version: 1, proto: { name: 'overridden-name' } })
      );
      const result = await loadProtoConfig(tmpDir);
      expect(result?.name).toBe('overridden-name');
      // Other base fields survive
      expect(result?.description).toBe('base-desc');
    });

    it('deep-merges nested objects from settings.json', async () => {
      writeFile(
        tmpDir,
        'proto.config.yaml',
        'brand:\n  studio: original\n  domain: original.com\n'
      );
      writeFile(
        tmpDir,
        '.automaker/settings.json',
        JSON.stringify({ proto: { brand: { studio: 'updated' } } })
      );
      const result = await loadProtoConfig(tmpDir);
      expect(result?.brand?.studio).toBe('updated');
      expect(result?.brand?.domain).toBe('original.com');
    });

    it('ignores settings.json when proto key is absent', async () => {
      writeFile(tmpDir, 'proto.config.yaml', 'name: from-yaml\n');
      writeFile(
        tmpDir,
        '.automaker/settings.json',
        JSON.stringify({ version: 1, someOtherKey: true })
      );
      const result = await loadProtoConfig(tmpDir);
      expect(result?.name).toBe('from-yaml');
    });

    it('handles missing settings.json gracefully', async () => {
      writeFile(tmpDir, 'proto.config.yaml', 'name: from-yaml\n');
      const result = await loadProtoConfig(tmpDir);
      expect(result?.name).toBe('from-yaml');
    });

    it('handles malformed settings.json gracefully', async () => {
      writeFile(tmpDir, 'proto.config.yaml', 'name: from-yaml\n');
      writeFile(tmpDir, '.automaker/settings.json', '{ this is not valid json }');
      const result = await loadProtoConfig(tmpDir);
      expect(result?.name).toBe('from-yaml');
    });
  });

  describe('layered merge: env var overrides', () => {
    it('applies PROTO_NAME env var', async () => {
      writeFile(tmpDir, 'proto.config.yaml', 'name: from-yaml\n');
      process.env.PROTO_NAME = 'env-name';
      const result = await loadProtoConfig(tmpDir);
      expect(result?.name).toBe('env-name');
    });

    it('applies PROTO_DESCRIPTION env var', async () => {
      writeFile(tmpDir, 'proto.config.yaml', 'description: yaml-desc\n');
      process.env.PROTO_DESCRIPTION = 'env-desc';
      const result = await loadProtoConfig(tmpDir);
      expect(result?.description).toBe('env-desc');
    });

    it('applies PROTO_BRAND_STUDIO and PROTO_BRAND_DOMAIN env vars', async () => {
      writeFile(tmpDir, 'proto.config.yaml', 'name: test\n');
      process.env.PROTO_BRAND_STUDIO = 'env-studio';
      process.env.PROTO_BRAND_DOMAIN = 'env.domain';
      const result = await loadProtoConfig(tmpDir);
      expect(result?.brand?.studio).toBe('env-studio');
      expect(result?.brand?.domain).toBe('env.domain');
    });

    it('applies PROTO_DISCORD_SERVER_ID env var', async () => {
      writeFile(tmpDir, 'proto.config.yaml', 'name: test\n');
      process.env.PROTO_DISCORD_SERVER_ID = '123456';
      const result = await loadProtoConfig(tmpDir);
      expect(result?.discord?.serverId).toBe('123456');
    });

    it('applies PROTO_SERVER_PORT env var as integer', async () => {
      writeFile(tmpDir, 'proto.config.yaml', 'name: test\n');
      process.env.PROTO_SERVER_PORT = '4200';
      const result = await loadProtoConfig(tmpDir);
      expect(result?.server?.port).toBe(4200);
    });

    it('ignores invalid PROTO_SERVER_PORT', async () => {
      writeFile(tmpDir, 'proto.config.yaml', 'name: test\n');
      process.env.PROTO_SERVER_PORT = 'not-a-number';
      const result = await loadProtoConfig(tmpDir);
      expect(result?.server?.port).toBeUndefined();
    });

    it('env vars win over settings.json which wins over YAML', async () => {
      writeFile(tmpDir, 'proto.config.yaml', 'name: yaml\n');
      writeFile(
        tmpDir,
        '.automaker/settings.json',
        JSON.stringify({ proto: { name: 'settings' } })
      );
      process.env.PROTO_NAME = 'env';
      const result = await loadProtoConfig(tmpDir);
      expect(result?.name).toBe('env');
    });
  });
});

describe('writeProtoConfig', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes proto.config.yaml to projectPath', async () => {
    await writeProtoConfig(tmpDir, { name: 'written', description: 'hello' });
    const filePath = path.join(tmpDir, 'proto.config.yaml');
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('writes valid YAML that can be read back', async () => {
    const config = {
      name: 'round-trip',
      description: 'test round-trip',
      brand: { studio: 'protoLabs.studio', domain: 'protolabs.studio' },
    };
    await writeProtoConfig(tmpDir, config);
    const result = await loadProtoConfig(tmpDir);
    expect(result?.name).toBe('round-trip');
    expect(result?.description).toBe('test round-trip');
    expect(result?.brand?.studio).toBe('protoLabs.studio');
  });

  it('overwrites an existing proto.config.yaml', async () => {
    await writeProtoConfig(tmpDir, { name: 'first' });
    await writeProtoConfig(tmpDir, { name: 'second' });
    const result = await loadProtoConfig(tmpDir);
    expect(result?.name).toBe('second');
  });
});
