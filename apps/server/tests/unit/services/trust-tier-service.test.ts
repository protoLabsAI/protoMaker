import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { TrustTierService } from '@/services/trust-tier-service.js';
import type { TrustTier } from '@protolabsai/types';

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

  describe('concurrent writes', () => {
    it('should preserve both records when setTier is called concurrently', async () => {
      // Fire two setTier calls concurrently — both should survive the mutex serialization
      const [recordAlice, recordBob] = await Promise.all([
        trustTierService.setTier('alice', 2, 'admin', 'Alice'),
        trustTierService.setTier('bob', 3, 'admin', 'Bob'),
      ]);

      expect(recordAlice.githubUsername).toBe('alice');
      expect(recordAlice.tier).toBe(2);
      expect(recordBob.githubUsername).toBe('bob');
      expect(recordBob.tier).toBe(3);

      // Both users must be retrievable
      expect(await trustTierService.getTierForUser('alice')).toBe(2);
      expect(await trustTierService.getTierForUser('bob')).toBe(3);

      const all = await trustTierService.getAll();
      expect(all).toHaveLength(2);
    });

    it('should preserve both records when setTier and revokeTier run concurrently', async () => {
      // Pre-populate so revokeTier has something to delete
      await trustTierService.setTier('charlie', 1, 'admin');

      const [recordAlice] = await Promise.all([
        trustTierService.setTier('alice', 2, 'admin', 'Alice'),
        trustTierService.revokeTier('charlie'),
      ]);

      expect(recordAlice.githubUsername).toBe('alice');
      expect(await trustTierService.getTierForUser('alice')).toBe(2);
      expect(await trustTierService.getTierForUser('charlie')).toBe(0);

      const all = await trustTierService.getAll();
      expect(all).toHaveLength(1);
      expect(all[0].githubUsername).toBe('alice');
    });

    it('preserves all records when N=8 setTier calls fire concurrently (thundering-herd check)', async () => {
      // The 2-caller test passes a naive mutex (`if (existing) await existing`)
      // even when it has the thundering-herd bug — only 1 waiter exists, so it
      // gets the lock cleanly. The bug surfaces with 3+ concurrent callers,
      // where multiple waiters all unblock on the first release and then race.
      const usernames = ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'u8'];
      await Promise.all(
        usernames.map((u, i) =>
          trustTierService.setTier(u, ((i % 4) + 1) as 1 | 2 | 3 | 4, 'admin')
        )
      );

      const all = await trustTierService.getAll();
      expect(all).toHaveLength(8);
      const got = new Set(all.map((r) => r.githubUsername));
      for (const u of usernames) {
        expect(got.has(u)).toBe(true);
      }
    });

    it('handles a setTier-then-revoke chain on the same user without losing the final state', async () => {
      // Race two operations against the SAME user. With a broken mutex, the
      // revoke could land before the set persists, leaving 'dave' with a tier
      // that should have been revoked, or vice versa. With proper ordering,
      // whichever call queued last wins.
      await trustTierService.setTier('dave', 1, 'admin');

      // Fire 4 concurrent ops in a deterministic Promise.all order
      const ops = [
        trustTierService.setTier('dave', 2, 'admin'),
        trustTierService.setTier('dave', 3, 'admin'),
        trustTierService.setTier('dave', 4, 'admin'),
        trustTierService.revokeTier('dave'),
      ];
      await Promise.all(ops);

      // Last queued op was the revoke — final state must reflect that.
      expect(await trustTierService.getTierForUser('dave')).toBe(0);
    });
  });
});
