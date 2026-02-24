/**
 * Contract tests for FeatureStore interface conformance.
 * Verifies that FeatureLoader correctly implements the FeatureStore interface.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FeatureLoader } from '../../../src/services/feature-loader.js';
import type { FeatureStore } from '@protolabs-ai/types';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('FeatureStore Interface Contract', () => {
  let featureLoader: FeatureLoader;
  let tempDir: string;

  beforeEach(async () => {
    featureLoader = new FeatureLoader();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'feature-store-test-'));
    await fs.mkdir(path.join(tempDir, '.automaker', 'features'), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('FeatureLoader satisfies FeatureStore interface at type level', () => {
    // This is a compile-time check — if FeatureLoader doesn't implement
    // FeatureStore, TypeScript will error on this assignment
    const store: FeatureStore = featureLoader;
    expect(store).toBeDefined();
  });

  it('has all required FeatureStore methods', () => {
    expect(typeof featureLoader.getAll).toBe('function');
    expect(typeof featureLoader.get).toBe('function');
    expect(typeof featureLoader.findByTitle).toBe('function');
    expect(typeof featureLoader.create).toBe('function');
    expect(typeof featureLoader.update).toBe('function');
    expect(typeof featureLoader.delete).toBe('function');
    expect(typeof featureLoader.claim).toBe('function');
    expect(typeof featureLoader.release).toBe('function');
  });

  describe('claim/release', () => {
    it('should claim an unclaimed feature', async () => {
      const feature = await featureLoader.create(tempDir, {
        title: 'Test Feature',
        description: 'Test',
      });

      const claimed = await featureLoader.claim(tempDir, feature.id, 'instance-a');
      expect(claimed).toBe(true);

      const updated = await featureLoader.get(tempDir, feature.id);
      expect(updated?.claimedBy).toBe('instance-a');
    });

    it('should allow same instance to re-claim', async () => {
      const feature = await featureLoader.create(tempDir, {
        title: 'Test Feature',
        description: 'Test',
      });

      await featureLoader.claim(tempDir, feature.id, 'instance-a');
      const reClaimed = await featureLoader.claim(tempDir, feature.id, 'instance-a');
      expect(reClaimed).toBe(true);
    });

    it('should reject claim from different instance', async () => {
      const feature = await featureLoader.create(tempDir, {
        title: 'Test Feature',
        description: 'Test',
      });

      await featureLoader.claim(tempDir, feature.id, 'instance-a');
      const claimed = await featureLoader.claim(tempDir, feature.id, 'instance-b');
      expect(claimed).toBe(false);

      const updated = await featureLoader.get(tempDir, feature.id);
      expect(updated?.claimedBy).toBe('instance-a');
    });

    it('should return false for non-existent feature', async () => {
      const claimed = await featureLoader.claim(tempDir, 'nonexistent', 'instance-a');
      expect(claimed).toBe(false);
    });

    it('should release a claimed feature', async () => {
      const feature = await featureLoader.create(tempDir, {
        title: 'Test Feature',
        description: 'Test',
      });

      await featureLoader.claim(tempDir, feature.id, 'instance-a');
      await featureLoader.release(tempDir, feature.id);

      const updated = await featureLoader.get(tempDir, feature.id);
      expect(updated?.claimedBy).toBeUndefined();
    });

    it('should allow claim after release', async () => {
      const feature = await featureLoader.create(tempDir, {
        title: 'Test Feature',
        description: 'Test',
      });

      await featureLoader.claim(tempDir, feature.id, 'instance-a');
      await featureLoader.release(tempDir, feature.id);

      const claimed = await featureLoader.claim(tempDir, feature.id, 'instance-b');
      expect(claimed).toBe(true);

      const updated = await featureLoader.get(tempDir, feature.id);
      expect(updated?.claimedBy).toBe('instance-b');
    });
  });
});
