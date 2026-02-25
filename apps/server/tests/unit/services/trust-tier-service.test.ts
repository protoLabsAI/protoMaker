import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { TrustTierService } from '@/services/trust-tier-service.js';
import type { TrustTier } from '@protolabs-ai/types';

describe('TrustTierService', () => {
  let testDataDir: string;
  let trustTierService: TrustTierService;

  beforeEach(async () => {
    testDataDir = path.join(os.tmpdir(), `trust-tier-test-${Date.now()}`);
    await fs.mkdir(testDataDir, { recursive: true });
    trustTierService = new TrustTierService(testDataDir);
  });

  afterEach(async () => {
    try {
      await fs.rm(testDataDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('classifyTrust', () => {
    it('should return tier 4 for mcp source', () => {
      const tier = trustTierService.classifyTrust('mcp');
      expect(tier).toBe(4);
    });

    it('should return tier 3 for ui source', () => {
      const tier = trustTierService.classifyTrust('ui');
      expect(tier).toBe(3);
    });

    it('should return tier 4 for internal source', () => {
      const tier = trustTierService.classifyTrust('internal');
      expect(tier).toBe(4);
    });

    it('should return tier 1 for api source with no stored tier', () => {
      const tier = trustTierService.classifyTrust('api');
      expect(tier).toBe(1);
    });

    it('should return stored tier for github_issue source with storedTier=2', () => {
      const tier = trustTierService.classifyTrust('github_issue', 'testuser', 2);
      expect(tier).toBe(2);
    });

    it('should return tier 1 for github_issue source with no stored tier', () => {
      const tier = trustTierService.classifyTrust('github_issue');
      expect(tier).toBe(1);
    });

    it('should return tier 1 for github_discussion source with no stored tier', () => {
      const tier = trustTierService.classifyTrust('github_discussion');
      expect(tier).toBe(1);
    });

    it('should return tier 0 for unknown source with no stored tier', () => {
      const tier = trustTierService.classifyTrust('external' as any);
      expect(tier).toBe(0);
    });

    it('should use stored tier over default tier for api source', () => {
      const tier = trustTierService.classifyTrust('api', 'testuser', 3);
      expect(tier).toBe(3);
    });
  });

  describe('setTier', () => {
    it('should persist TrustTierRecord with grantedAt timestamp', async () => {
      const username = 'testuser';
      const tier: TrustTier = 2;
      const grantedBy = 'admin';
      const reason = 'Trusted contributor';

      const record = await trustTierService.setTier(username, tier, grantedBy, reason);

      expect(record.githubUsername).toBe(username);
      expect(record.tier).toBe(tier);
      expect(record.grantedBy).toBe(grantedBy);
      expect(record.reason).toBe(reason);
      expect(record.grantedAt).toBeDefined();
      expect(new Date(record.grantedAt).getTime()).toBeLessThanOrEqual(Date.now());

      // Verify persistence
      const retrievedTier = await trustTierService.getTierForUser(username);
      expect(retrievedTier).toBe(tier);
    });

    it('should update existing tier for same user', async () => {
      const username = 'testuser';
      await trustTierService.setTier(username, 1, 'admin1', 'Initial grant');
      const updatedRecord = await trustTierService.setTier(username, 3, 'admin2', 'Promoted');

      expect(updatedRecord.tier).toBe(3);
      expect(updatedRecord.grantedBy).toBe('admin2');
      expect(updatedRecord.reason).toBe('Promoted');

      const tier = await trustTierService.getTierForUser(username);
      expect(tier).toBe(3);
    });

    it('should allow setting tier without reason', async () => {
      const username = 'testuser';
      const record = await trustTierService.setTier(username, 2, 'admin');

      expect(record.tier).toBe(2);
      expect(record.reason).toBeUndefined();
    });
  });

  describe('getTierForUser', () => {
    it('should return 0 for unknown user', async () => {
      const tier = await trustTierService.getTierForUser('unknownuser');
      expect(tier).toBe(0);
    });

    it('should return correct tier for known user', async () => {
      const username = 'knownuser';
      await trustTierService.setTier(username, 3, 'admin');

      const tier = await trustTierService.getTierForUser(username);
      expect(tier).toBe(3);
    });

    it('should return correct tiers for multiple users', async () => {
      await trustTierService.setTier('user1', 1, 'admin');
      await trustTierService.setTier('user2', 2, 'admin');
      await trustTierService.setTier('user3', 3, 'admin');

      expect(await trustTierService.getTierForUser('user1')).toBe(1);
      expect(await trustTierService.getTierForUser('user2')).toBe(2);
      expect(await trustTierService.getTierForUser('user3')).toBe(3);
    });
  });

  describe('revokeTier', () => {
    it('should remove record for user', async () => {
      const username = 'testuser';
      await trustTierService.setTier(username, 2, 'admin');

      // Verify tier exists
      expect(await trustTierService.getTierForUser(username)).toBe(2);

      // Revoke tier
      await trustTierService.revokeTier(username);

      // Verify tier is removed (returns 0 for unknown user)
      expect(await trustTierService.getTierForUser(username)).toBe(0);
    });

    it('should handle revoking non-existent user gracefully', async () => {
      await expect(trustTierService.revokeTier('nonexistent')).resolves.not.toThrow();
    });

    it('should not affect other users when revoking', async () => {
      await trustTierService.setTier('user1', 2, 'admin');
      await trustTierService.setTier('user2', 3, 'admin');

      await trustTierService.revokeTier('user1');

      expect(await trustTierService.getTierForUser('user1')).toBe(0);
      expect(await trustTierService.getTierForUser('user2')).toBe(3);
    });
  });

  describe('getAll', () => {
    it('should return empty array when no tiers are set', async () => {
      const records = await trustTierService.getAll();
      expect(records).toEqual([]);
    });

    it('should return all trust tier records', async () => {
      await trustTierService.setTier('user1', 1, 'admin1', 'First user');
      await trustTierService.setTier('user2', 2, 'admin2', 'Second user');
      await trustTierService.setTier('user3', 3, 'admin3', 'Third user');

      const records = await trustTierService.getAll();

      expect(records).toHaveLength(3);
      expect(records.find((r) => r.githubUsername === 'user1')?.tier).toBe(1);
      expect(records.find((r) => r.githubUsername === 'user2')?.tier).toBe(2);
      expect(records.find((r) => r.githubUsername === 'user3')?.tier).toBe(3);
    });
  });
});
