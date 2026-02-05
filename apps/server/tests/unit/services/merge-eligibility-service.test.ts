/**
 * Tests for Merge Eligibility Service
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AutoMergeSettings } from '@automaker/types';
import { DEFAULT_AUTO_MERGE_SETTINGS } from '@automaker/types';
import {
  MergeEligibilityService,
  type MergeEligibilityResult,
  type PRCheckStatus,
} from '../../../src/services/merge-eligibility-service.js';

describe('MergeEligibilityService', () => {
  let service: MergeEligibilityService;

  beforeEach(() => {
    service = new MergeEligibilityService();
  });

  describe('Type Validation', () => {
    it('should have correct AutoMergeSettings structure', () => {
      const settings: AutoMergeSettings = {
        enabled: true,
        minApprovals: 2,
        requiredChecks: ['ci_passing', 'reviews_approved'],
        mergeMethod: 'squash',
      };

      expect(settings.enabled).toBe(true);
      expect(settings.minApprovals).toBe(2);
      expect(settings.requiredChecks).toHaveLength(2);
      expect(settings.mergeMethod).toBe('squash');
    });

    it('should have valid DEFAULT_AUTO_MERGE_SETTINGS', () => {
      expect(DEFAULT_AUTO_MERGE_SETTINGS.enabled).toBe(false);
      expect(DEFAULT_AUTO_MERGE_SETTINGS.minApprovals).toBe(1);
      expect(DEFAULT_AUTO_MERGE_SETTINGS.requiredChecks).toEqual([
        'ci_passing',
        'reviews_approved',
        'no_requested_changes',
        'up_to_date',
      ]);
      expect(DEFAULT_AUTO_MERGE_SETTINGS.mergeMethod).toBe('squash');
    });

    it('should have correct PRCheckStatus structure', () => {
      const checkStatus: PRCheckStatus = {
        checkType: 'ci_passing',
        passed: true,
        details: 'All CI checks passed',
      };

      expect(checkStatus.checkType).toBe('ci_passing');
      expect(checkStatus.passed).toBe(true);
      expect(checkStatus.details).toBe('All CI checks passed');
    });

    it('should have correct MergeEligibilityResult structure', () => {
      const result: MergeEligibilityResult = {
        eligible: true,
        checks: [
          {
            checkType: 'ci_passing',
            passed: true,
            details: 'All CI checks passed',
          },
        ],
        summary: 'PR is eligible for auto-merge',
        prNumber: 123,
      };

      expect(result.eligible).toBe(true);
      expect(result.checks).toHaveLength(1);
      expect(result.summary).toBe('PR is eligible for auto-merge');
      expect(result.prNumber).toBe(123);
    });
  });

  describe('Service Instantiation', () => {
    it('should create service instance', () => {
      expect(service).toBeInstanceOf(MergeEligibilityService);
    });

    it('should have evaluatePR method', () => {
      expect(service.evaluatePR).toBeDefined();
      expect(typeof service.evaluatePR).toBe('function');
    });
  });

  describe('Check Type Validation', () => {
    it('should accept all valid check types', () => {
      const validChecks: Array<AutoMergeSettings['requiredChecks']> = [
        ['ci_passing'],
        ['reviews_approved'],
        ['no_requested_changes'],
        ['conversations_resolved'],
        ['up_to_date'],
        ['ci_passing', 'reviews_approved', 'no_requested_changes', 'up_to_date'],
      ];

      validChecks.forEach((checks) => {
        const settings: AutoMergeSettings = {
          enabled: true,
          requiredChecks: checks,
        };
        expect(settings.requiredChecks).toEqual(checks);
      });
    });
  });

  describe('Settings Defaults', () => {
    it('should use default settings when not provided', () => {
      const settings: AutoMergeSettings = {};

      const resolvedSettings = {
        ...DEFAULT_AUTO_MERGE_SETTINGS,
        ...settings,
      };

      expect(resolvedSettings.enabled).toBe(false);
      expect(resolvedSettings.minApprovals).toBe(1);
      expect(resolvedSettings.requiredChecks).toHaveLength(4);
      expect(resolvedSettings.mergeMethod).toBe('squash');
    });

    it('should override defaults with provided settings', () => {
      const settings: AutoMergeSettings = {
        enabled: true,
        minApprovals: 3,
        requiredChecks: ['ci_passing'],
        mergeMethod: 'rebase',
      };

      const resolvedSettings = {
        ...DEFAULT_AUTO_MERGE_SETTINGS,
        ...settings,
      };

      expect(resolvedSettings.enabled).toBe(true);
      expect(resolvedSettings.minApprovals).toBe(3);
      expect(resolvedSettings.requiredChecks).toEqual(['ci_passing']);
      expect(resolvedSettings.mergeMethod).toBe('rebase');
    });
  });

  describe('Merge Method Validation', () => {
    it('should accept valid merge methods', () => {
      const methods: Array<AutoMergeSettings['mergeMethod']> = ['merge', 'squash', 'rebase'];

      methods.forEach((method) => {
        const settings: AutoMergeSettings = {
          mergeMethod: method,
        };
        expect(settings.mergeMethod).toBe(method);
      });
    });
  });
});
