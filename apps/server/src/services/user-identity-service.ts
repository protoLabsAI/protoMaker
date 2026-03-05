/**
 * User Identity Service - Resolves current user's name from multiple sources
 *
 * Resolution chain (in priority order):
 * 1. Global settings 'userName' field
 * 2. AUTOMAKER_USER environment variable
 * 3. git config user.name
 *
 * The resolved identity is cached on first request for performance.
 */

import { createLogger } from '@protolabsai/utils';
import type { SettingsService } from './settings-service.js';
import { execSync } from 'node:child_process';

const logger = createLogger('UserIdentityService');

export type UserIdentitySource = 'settings' | 'env' | 'git';

export interface UserIdentity {
  userName: string;
  source: UserIdentitySource;
}

/**
 * UserIdentityService - Manages user identity resolution
 *
 * Resolves the current user's name from multiple sources with fallback logic.
 * The identity is cached after the first resolution for performance.
 */
export class UserIdentityService {
  private settingsService: SettingsService;
  private cachedIdentity: UserIdentity | null = null;

  /**
   * Create a new UserIdentityService instance
   *
   * @param settingsService - Settings service for accessing global settings
   */
  constructor(settingsService: SettingsService) {
    this.settingsService = settingsService;
  }

  /**
   * Get the current user's identity
   *
   * Resolves from the resolution chain and caches the result.
   * Returns null if no identity can be resolved from any source.
   *
   * @returns Promise resolving to UserIdentity or null
   */
  async getIdentity(): Promise<UserIdentity | null> {
    // Return cached identity if available
    if (this.cachedIdentity) {
      return this.cachedIdentity;
    }

    // Try resolution chain
    const identity = await this.resolveIdentity();

    // Cache the result (even if null)
    this.cachedIdentity = identity;

    return identity;
  }

  /**
   * Set the user's name in global settings and update cache
   *
   * @param userName - The user's name to set
   */
  async setUserName(userName: string): Promise<void> {
    // Update global settings
    await this.settingsService.updateGlobalSettings({ userName });

    // Update cache
    this.cachedIdentity = {
      userName,
      source: 'settings',
    };

    logger.info(`User name set to: ${userName}`);
  }

  /**
   * Clear the cached identity (useful for testing or manual refresh)
   */
  clearCache(): void {
    this.cachedIdentity = null;
  }

  /**
   * Resolve user identity from the resolution chain
   *
   * @private
   * @returns Promise resolving to UserIdentity or null
   */
  private async resolveIdentity(): Promise<UserIdentity | null> {
    // 1. Try global settings
    try {
      const settings = await this.settingsService.getGlobalSettings();
      if (settings.userName) {
        logger.debug('Resolved user name from settings:', settings.userName);
        return {
          userName: settings.userName,
          source: 'settings',
        };
      }
    } catch (error) {
      logger.error('Failed to read settings for user identity:', error);
    }

    // 2. Try AUTOMAKER_USER environment variable
    const envUser = process.env.AUTOMAKER_USER;
    if (envUser) {
      logger.debug('Resolved user name from env:', envUser);
      return {
        userName: envUser,
        source: 'env',
      };
    }

    // 3. Try git config user.name
    try {
      const gitUser = execSync('git config user.name', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();

      if (gitUser) {
        logger.debug('Resolved user name from git:', gitUser);
        return {
          userName: gitUser,
          source: 'git',
        };
      }
    } catch (error) {
      logger.debug('Failed to resolve user name from git config:', error);
    }

    // No identity found
    logger.warn('Could not resolve user identity from any source');
    return null;
  }
}
