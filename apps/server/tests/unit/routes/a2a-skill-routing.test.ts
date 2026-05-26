/**
 * Tests for A2A native-session skill routing (#3772).
 *
 * A skill that lists ANY Claude Code native tool (Bash, Read, Write, ...) must
 * route through executeNativeSkill (the Claude Code SDK path), NOT /api/chat
 * (the Vercel AI SDK path) which has no Bash. Mixed native+MCP skills like
 * board_health were silently degrading on the chat path — the model narrated a
 * shell command it couldn't run.
 *
 * `loadSkill` computes the two classification flags. These tests assert against
 * the real skill files shipped in .claude/skills/ plus temp fixtures for the
 * pure-MCP and pure-native cases.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadSkill, shouldRouteToNativeSession } from '@/routes/a2a/index.js';

// Repo root — .claude/skills/board_health.md lives here.
const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..');

describe('A2A loadSkill native-session classification (#3772)', () => {
  it('board_health (Bash + Read + MCP tools) needs a native session but is not all-native', async () => {
    const skill = await loadSkill(REPO_ROOT, 'board_health');
    expect(skill).not.toBeNull();
    // Mixed: lists Bash/Read (native) AND mcp__plugin_* (not native)
    expect(skill!.needsNativeSession).toBe(true);
    expect(skill!.isNativeTool).toBe(false);
    expect(skill!.allowedTools).toContain('Bash');
    expect(skill!.allowedTools.some((t) => t.startsWith('mcp__'))).toBe(true);
  });

  it('returns null for an unknown skill (falls through to chat path)', async () => {
    const skill = await loadSkill(REPO_ROOT, 'does-not-exist-skill');
    expect(skill).toBeNull();
  });

  // #3773: pin the dispatch routing contract, not just the classification flag.
  // The handler routes on shouldRouteToNativeSession(skill); board_health MUST
  // resolve to the native path or it regresses to the chat path that narrated a
  // shell command instead of returning board data (#3772).
  it('routes board_health to the native session (not the chat path)', async () => {
    const skill = await loadSkill(REPO_ROOT, 'board_health');
    expect(shouldRouteToNativeSession(skill)).toBe(true);
  });

  it('routes an unknown skill to the chat path', async () => {
    const skill = await loadSkill(REPO_ROOT, 'does-not-exist-skill');
    expect(shouldRouteToNativeSession(skill)).toBe(false);
  });

  describe('with temp fixtures', () => {
    let dir: string;

    beforeAll(() => {
      dir = mkdtempSync(join(tmpdir(), 'a2a-skill-routing-'));
      mkdirSync(join(dir, '.claude', 'skills'), { recursive: true });

      // Pure-native skill — every tool is a Claude Code native tool.
      writeFileSync(
        join(dir, '.claude', 'skills', 'pure-native.md'),
        `---
name: pure-native
allowed-tools:
  - Bash
  - Read
  - Write
---
Do native things.`
      );

      // Pure-MCP skill — no native tools, only MCP / board tools.
      writeFileSync(
        join(dir, '.claude', 'skills', 'pure-mcp.md'),
        `---
name: pure-mcp
allowed-tools:
  - mcp__plugin_protolabs_studio__list_features
  - mcp__plugin_protolabs_studio__create_feature
---
Do board things.`
      );

      // No allowed-tools at all.
      writeFileSync(
        join(dir, '.claude', 'skills', 'no-tools.md'),
        `---
name: no-tools
---
Just talk.`
      );
    });

    afterAll(() => {
      rmSync(dir, { recursive: true, force: true });
    });

    it('pure-native → needsNativeSession AND isNativeTool', async () => {
      const skill = await loadSkill(dir, 'pure-native');
      expect(skill!.needsNativeSession).toBe(true);
      expect(skill!.isNativeTool).toBe(true);
      expect(shouldRouteToNativeSession(skill)).toBe(true);
    });

    it('pure-mcp → neither (routes to chat path, which has board tools)', async () => {
      const skill = await loadSkill(dir, 'pure-mcp');
      expect(skill!.needsNativeSession).toBe(false);
      expect(skill!.isNativeTool).toBe(false);
      expect(shouldRouteToNativeSession(skill)).toBe(false);
    });

    it('no allowed-tools → neither', async () => {
      const skill = await loadSkill(dir, 'no-tools');
      expect(skill!.needsNativeSession).toBe(false);
      expect(skill!.isNativeTool).toBe(false);
    });
  });
});
