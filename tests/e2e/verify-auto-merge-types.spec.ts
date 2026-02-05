/**
 * Verification test for Auto-Merge Settings Types
 * This test verifies that the AutoMergeSettings types are correctly defined and exported
 * from @automaker/types and can be properly used in TypeScript code.
 */

import { test, expect } from '@playwright/test';
import type {
  AutoMergeSettings,
  MergeMethod,
  ProjectSettings,
} from '@automaker/types';
import { DEFAULT_AUTO_MERGE_SETTINGS } from '@automaker/types';

test.describe('Auto-Merge Settings Types', () => {
  test('should have valid DEFAULT_AUTO_MERGE_SETTINGS constant', () => {
    // Verify the default settings object exists and has correct structure
    expect(DEFAULT_AUTO_MERGE_SETTINGS).toBeDefined();
    expect(DEFAULT_AUTO_MERGE_SETTINGS.enabled).toBe(false);
    expect(DEFAULT_AUTO_MERGE_SETTINGS.mergeMethod).toBe('merge');
    expect(DEFAULT_AUTO_MERGE_SETTINGS.requiredApprovals).toBe(0);
    expect(DEFAULT_AUTO_MERGE_SETTINGS.requiredChecks).toEqual([]);
    expect(DEFAULT_AUTO_MERGE_SETTINGS.allowedLabels).toEqual([]);
    expect(DEFAULT_AUTO_MERGE_SETTINGS.allowedAuthors).toEqual([]);
    expect(DEFAULT_AUTO_MERGE_SETTINGS.deleteBranchAfterMerge).toBe(true);
  });

  test('should support all MergeMethod values', () => {
    const validMethods: MergeMethod[] = ['merge', 'squash', 'rebase'];

    validMethods.forEach(method => {
      const settings: AutoMergeSettings = {
        ...DEFAULT_AUTO_MERGE_SETTINGS,
        mergeMethod: method,
      };
      expect(settings.mergeMethod).toBe(method);
    });
  });

  test('should allow AutoMergeSettings to be part of ProjectSettings', () => {
    const projectSettings: ProjectSettings = {
      version: 1,
      autoMerge: {
        enabled: true,
        mergeMethod: 'squash',
        requiredApprovals: 2,
        requiredChecks: ['ci/test', 'ci/lint'],
        allowedLabels: ['automerge'],
        allowedAuthors: ['bot-user'],
        deleteBranchAfterMerge: false,
      },
    };

    expect(projectSettings.autoMerge).toBeDefined();
    expect(projectSettings.autoMerge?.enabled).toBe(true);
    expect(projectSettings.autoMerge?.mergeMethod).toBe('squash');
    expect(projectSettings.autoMerge?.requiredApprovals).toBe(2);
    expect(projectSettings.autoMerge?.requiredChecks).toHaveLength(2);
    expect(projectSettings.autoMerge?.allowedLabels).toEqual(['automerge']);
    expect(projectSettings.autoMerge?.allowedAuthors).toEqual(['bot-user']);
    expect(projectSettings.autoMerge?.deleteBranchAfterMerge).toBe(false);
  });

  test('should allow partial AutoMergeSettings override', () => {
    const customSettings: AutoMergeSettings = {
      ...DEFAULT_AUTO_MERGE_SETTINGS,
      enabled: true,
      requiredApprovals: 1,
    };

    expect(customSettings.enabled).toBe(true);
    expect(customSettings.requiredApprovals).toBe(1);
    // Other fields should use defaults
    expect(customSettings.mergeMethod).toBe('merge');
    expect(customSettings.deleteBranchAfterMerge).toBe(true);
  });

  test('should validate type safety for all fields', () => {
    const settings: AutoMergeSettings = {
      enabled: true,
      mergeMethod: 'squash',
      requiredApprovals: 3,
      requiredChecks: ['test', 'build', 'security-scan'],
      allowedLabels: ['safe-to-merge', 'automerge-ready'],
      allowedAuthors: ['dependabot', 'renovate-bot'],
      deleteBranchAfterMerge: true,
    };

    // Verify all types compile and work correctly
    expect(typeof settings.enabled).toBe('boolean');
    expect(typeof settings.mergeMethod).toBe('string');
    expect(typeof settings.requiredApprovals).toBe('number');
    expect(Array.isArray(settings.requiredChecks)).toBe(true);
    expect(Array.isArray(settings.allowedLabels)).toBe(true);
    expect(Array.isArray(settings.allowedAuthors)).toBe(true);
    expect(typeof settings.deleteBranchAfterMerge).toBe('boolean');
  });
});
