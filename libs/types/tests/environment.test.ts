import { describe, it, expect, vi, afterEach } from 'vitest';
import { getDeploymentEnvironment, ENVIRONMENT_PRESETS } from '../src/settings.js';

describe('DeploymentEnvironment', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllEnvs();
  });

  describe('ENVIRONMENT_PRESETS', () => {
    it('has presets for all three environments', () => {
      expect(ENVIRONMENT_PRESETS.development).toBeDefined();
      expect(ENVIRONMENT_PRESETS.staging).toBeDefined();
      expect(ENVIRONMENT_PRESETS.production).toBeDefined();
    });

    it('development has conservative limits', () => {
      expect(ENVIRONMENT_PRESETS.development.maxConcurrency).toBe(2);
      expect(ENVIRONMENT_PRESETS.development.heapLimitMb).toBe(8192);
      expect(ENVIRONMENT_PRESETS.development.enableMetrics).toBe(false);
    });

    it('staging has higher limits', () => {
      expect(ENVIRONMENT_PRESETS.staging.maxConcurrency).toBe(6);
      expect(ENVIRONMENT_PRESETS.staging.heapLimitMb).toBe(32768);
      expect(ENVIRONMENT_PRESETS.staging.enableMetrics).toBe(true);
    });

    it('production has stable limits', () => {
      expect(ENVIRONMENT_PRESETS.production.maxConcurrency).toBe(4);
      expect(ENVIRONMENT_PRESETS.production.enableMetrics).toBe(true);
    });
  });

  describe('getDeploymentEnvironment', () => {
    it('defaults to development when no env var set', () => {
      vi.stubEnv('AUTOMAKER_ENV', '');
      vi.stubEnv('NODE_ENV', '');
      expect(getDeploymentEnvironment()).toBe('development');
    });

    it('reads AUTOMAKER_ENV first', () => {
      vi.stubEnv('AUTOMAKER_ENV', 'staging');
      vi.stubEnv('NODE_ENV', 'production');
      expect(getDeploymentEnvironment()).toBe('staging');
    });

    it('falls back to NODE_ENV', () => {
      vi.stubEnv('AUTOMAKER_ENV', '');
      vi.stubEnv('NODE_ENV', 'production');
      expect(getDeploymentEnvironment()).toBe('production');
    });

    it('normalizes "prod" to "production"', () => {
      vi.stubEnv('AUTOMAKER_ENV', 'prod');
      expect(getDeploymentEnvironment()).toBe('production');
    });

    it('normalizes "stage" to "staging"', () => {
      vi.stubEnv('AUTOMAKER_ENV', 'stage');
      expect(getDeploymentEnvironment()).toBe('staging');
    });

    it('normalizes "dev" to "development"', () => {
      vi.stubEnv('AUTOMAKER_ENV', 'dev');
      expect(getDeploymentEnvironment()).toBe('development');
    });

    it('is case insensitive', () => {
      vi.stubEnv('AUTOMAKER_ENV', 'PRODUCTION');
      expect(getDeploymentEnvironment()).toBe('production');
    });

    it('trims whitespace', () => {
      vi.stubEnv('AUTOMAKER_ENV', '  staging  ');
      expect(getDeploymentEnvironment()).toBe('staging');
    });

    it('returns development for unknown values', () => {
      vi.stubEnv('AUTOMAKER_ENV', 'preview');
      expect(getDeploymentEnvironment()).toBe('development');
    });
  });
});
