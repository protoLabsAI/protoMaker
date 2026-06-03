/**
 * Tests for the app-level pause registry helper (#4062).
 *
 * `isProjectPathPaused` is the pure predicate auto-mode and startup use to
 * enforce/skip paused apps; cover it directly rather than instantiating the
 * heavy AutoModeService.
 */

import { describe, it, expect } from 'vitest';
import { DEFAULT_GLOBAL_SETTINGS, isProjectPathPaused } from '../src/global-settings.js';
import type { GlobalSettings } from '../src/global-settings.js';

describe('isProjectPathPaused (#4062)', () => {
  it('returns false when pausedProjects is undefined', () => {
    const settings = { ...DEFAULT_GLOBAL_SETTINGS, pausedProjects: undefined } as GlobalSettings;
    expect(isProjectPathPaused(settings, '/app/a')).toBe(false);
  });

  it('returns false by default (empty registry)', () => {
    expect(isProjectPathPaused(DEFAULT_GLOBAL_SETTINGS, '/app/a')).toBe(false);
  });

  it('returns true when the projectPath is in the registry', () => {
    const settings: GlobalSettings = {
      ...DEFAULT_GLOBAL_SETTINGS,
      pausedProjects: [
        { projectPath: '/app/a', pausedAt: '2026-01-01T00:00:00.000Z' },
        { projectPath: '/app/b', reason: 'x', pausedAt: '2026-01-01T00:00:00.000Z' },
      ],
    };
    expect(isProjectPathPaused(settings, '/app/a')).toBe(true);
    expect(isProjectPathPaused(settings, '/app/b')).toBe(true);
  });

  it('returns false for a projectPath not in the registry', () => {
    const settings: GlobalSettings = {
      ...DEFAULT_GLOBAL_SETTINGS,
      pausedProjects: [{ projectPath: '/app/a', pausedAt: '2026-01-01T00:00:00.000Z' }],
    };
    expect(isProjectPathPaused(settings, '/app/zzz')).toBe(false);
  });
});
