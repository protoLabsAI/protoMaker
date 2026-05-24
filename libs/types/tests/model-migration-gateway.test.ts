/**
 * Tests for the gateway-routing migration in `migrateModelId`.
 *
 * After the gateway cutover, all Claude-family aliases must resolve to a
 * `protolabs/*` tier — the gateway-issued API key rejects direct Anthropic
 * model strings. Regression coverage for #3661.
 */

import { describe, it, expect } from 'vitest';
import { migrateModelId } from '../src/model-migration.js';
import {
  CLAUDE_CANONICAL_MAP,
  CLAUDE_MODEL_MAP,
  LEGACY_CLAUDE_FULL_MODEL_MAP,
} from '../src/model.js';

describe('migrateModelId — gateway routing (#3661)', () => {
  describe('canonical claude-* IDs', () => {
    it('maps claude-sonnet to protolabs/smart', () => {
      expect(migrateModelId('claude-sonnet')).toBe('protolabs/smart');
    });

    it('maps claude-haiku to protolabs/fast', () => {
      expect(migrateModelId('claude-haiku')).toBe('protolabs/fast');
    });

    it('maps claude-opus to protolabs/reasoning', () => {
      expect(migrateModelId('claude-opus')).toBe('protolabs/reasoning');
    });
  });

  describe('bare short-name aliases', () => {
    it('maps sonnet to protolabs/smart', () => {
      expect(migrateModelId('sonnet')).toBe('protolabs/smart');
    });

    it('maps haiku to protolabs/fast', () => {
      expect(migrateModelId('haiku')).toBe('protolabs/fast');
    });

    it('maps opus to protolabs/reasoning', () => {
      expect(migrateModelId('opus')).toBe('protolabs/reasoning');
    });
  });

  describe('full versioned Claude model strings (legacy persisted values)', () => {
    it.each([
      ['claude-sonnet-4-6', 'protolabs/smart'],
      ['claude-sonnet-4-5-20250929', 'protolabs/smart'],
      ['claude-sonnet-4-5', 'protolabs/smart'],
      ['claude-haiku-4-5-20251001', 'protolabs/fast'],
      ['claude-haiku-4-5', 'protolabs/fast'],
      ['claude-opus-4-6', 'protolabs/reasoning'],
      ['claude-opus-4-5', 'protolabs/reasoning'],
    ])('migrates %s -> %s', (input, expected) => {
      expect(migrateModelId(input)).toBe(expected);
    });
  });

  describe('protolabs/* aliases pass through unchanged', () => {
    it.each(['protolabs/smart', 'protolabs/fast', 'protolabs/reasoning'])(
      'passes through %s',
      (model) => {
        expect(migrateModelId(model)).toBe(model);
      }
    );
  });

  describe('map consistency', () => {
    it('CLAUDE_CANONICAL_MAP values are all protolabs/* tiers', () => {
      for (const value of Object.values(CLAUDE_CANONICAL_MAP)) {
        expect(value.startsWith('protolabs/')).toBe(true);
      }
    });

    it('CLAUDE_MODEL_MAP values are all protolabs/* tiers', () => {
      for (const value of Object.values(CLAUDE_MODEL_MAP)) {
        expect(value.startsWith('protolabs/')).toBe(true);
      }
    });

    it('LEGACY_CLAUDE_FULL_MODEL_MAP covers every versioned variant in the codebase', () => {
      // Spot-check the entries that appeared in shipping settings.
      expect(LEGACY_CLAUDE_FULL_MODEL_MAP['claude-sonnet-4-6']).toBe('protolabs/smart');
      expect(LEGACY_CLAUDE_FULL_MODEL_MAP['claude-haiku-4-5-20251001']).toBe('protolabs/fast');
      expect(LEGACY_CLAUDE_FULL_MODEL_MAP['claude-opus-4-6']).toBe('protolabs/reasoning');
    });
  });

  describe('unrecognized strings pass through', () => {
    it('passes through non-Claude provider models unchanged', () => {
      expect(migrateModelId('cursor-auto')).toBe('cursor-auto');
      expect(migrateModelId('codex-gpt-5.5')).toBe('codex-gpt-5.5');
      expect(migrateModelId('opencode-big-pickle')).toBe('opencode-big-pickle');
    });

    it('passes through unknown protolabs/* aliases (forward compat)', () => {
      expect(migrateModelId('protolabs/some-future-tier')).toBe('protolabs/some-future-tier');
    });

    it('returns empty input as-is', () => {
      expect(migrateModelId(undefined)).toBeUndefined();
      expect(migrateModelId(null)).toBeNull();
      expect(migrateModelId('')).toBe('');
    });
  });
});
