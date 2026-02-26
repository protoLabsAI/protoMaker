/**
 * Trust Tier Service - Manages trust tier assignments for GitHub users
 *
 * Provides persistent storage and classification for trust tiers:
 * - Tier 0: Anonymous (external, unknown)
 * - Tier 1: GitHub user (verified GitHub account, opened issue)
 * - Tier 2: Contributor (past merged contribution via idea)
 * - Tier 3: Maintainer (team member, bypasses quarantine)
 * - Tier 4: System (internal/MCP/CLI, full trust)
 *
 * Storage: JSON file at {DATA_DIR}/trust-tiers.json
 */

import { createLogger, atomicWriteJson, readJsonFile } from '@protolabs-ai/utils';
import type { TrustTier, TrustTierRecord } from '@protolabs-ai/types';
import type { Feature } from '@protolabs-ai/types';
import path from 'path';

const logger = createLogger('TrustTierService');

/**
 * Storage format for trust tiers
 * Maps GitHub username -> TrustTierRecord
 */
interface TrustTierStorage {
  [githubUsername: string]: TrustTierRecord;
}

export class TrustTierService {
  private filePath: string;

  constructor(dataDir: string) {
    this.filePath = path.join(dataDir, 'trust-tiers.json');
  }

  /**
   * Load all TrustTierRecord entries from storage
   */
  async getAll(): Promise<TrustTierRecord[]> {
    const storage = await this.loadStorage();
    return Object.values(storage);
  }

  /**
   * Get tier for a specific GitHub username
   * @returns Trust tier (0-4), returns 0 if user not found
   */
  async getTierForUser(githubUsername: string): Promise<TrustTier> {
    const storage = await this.loadStorage();
    const record = storage[githubUsername];
    return record ? record.tier : 0;
  }

  /**
   * Grant or upgrade a user's trust tier
   * @returns The created/updated TrustTierRecord
   */
  async setTier(
    githubUsername: string,
    tier: TrustTier,
    grantedBy: string,
    reason?: string
  ): Promise<TrustTierRecord> {
    const record: TrustTierRecord = {
      githubUsername,
      tier,
      grantedAt: new Date().toISOString(),
      grantedBy,
      reason,
    };

    const storage = await this.loadStorage();
    storage[githubUsername] = record;
    await this.saveStorage(storage);

    logger.info(`Granted tier ${tier} to ${githubUsername} by ${grantedBy}`, { reason });
    return record;
  }

  /**
   * Revoke a user's trust tier (removes entry from storage)
   */
  async revokeTier(githubUsername: string): Promise<void> {
    const storage = await this.loadStorage();

    if (!storage[githubUsername]) {
      logger.warn(`Attempted to revoke tier for unknown user: ${githubUsername}`);
      return;
    }

    delete storage[githubUsername];
    await this.saveStorage(storage);

    logger.info(`Revoked tier for ${githubUsername}`);
  }

  /**
   * Classify trust tier from feature source and optional GitHub username
   *
   * Rules:
   * - source === 'mcp' || 'internal' → tier 4
   * - source === 'ui' → tier 3
   * - storedTier exists → use storedTier
   * - source === 'api' with no stored tier → tier 1
   * - source === 'github_issue' with no stored tier → tier 1
   * - default → tier 0
   */
  classifyTrust(
    source: Feature['source'],
    githubUsername?: string,
    storedTier?: TrustTier
  ): TrustTier {
    // Rule 1: MCP/internal sources → tier 4 (system trust)
    if (source === 'mcp' || source === 'internal') {
      return 4;
    }

    // Rule 2: UI source → tier 3 (maintainer trust)
    if (source === 'ui') {
      return 3;
    }

    // Rule 3: Use stored tier if available
    if (storedTier !== undefined) {
      return storedTier;
    }

    // Rule 4: API source without stored tier → tier 1
    if (source === 'api') {
      return 1;
    }

    // Rule 5: GitHub issue/discussion without stored tier → tier 1
    if (source === 'github_issue' || source === 'github_discussion') {
      return 1;
    }

    // Default: tier 0 (anonymous)
    return 0;
  }

  /**
   * Load trust tier storage from disk
   */
  private async loadStorage(): Promise<TrustTierStorage> {
    return await readJsonFile<TrustTierStorage>(this.filePath, {});
  }

  /**
   * Save trust tier storage to disk atomically
   */
  private async saveStorage(storage: TrustTierStorage): Promise<void> {
    await atomicWriteJson(this.filePath, storage, { indent: 2, createDirs: true });
  }
}
