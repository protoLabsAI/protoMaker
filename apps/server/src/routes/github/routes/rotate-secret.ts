/**
 * POST /api/github/rotate-secret
 *
 * Generates a new GitHub webhook secret, moves the current secret to
 * previousGithub with a 24-hour expiry window, and returns the new secret.
 *
 * The 24-hour overlap window allows GitHub to continue delivering webhooks
 * signed with the old secret while the operator updates the webhook
 * configuration in GitHub settings.
 */

import { randomBytes } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { createLogger } from '@protolabsai/utils';
import type { SettingsService } from '../../../services/settings-service.js';

const logger = createLogger('GitHubRotateSecret');

/** Duration the previous secret remains valid after rotation (24 hours) */
const PREVIOUS_SECRET_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Generate a cryptographically secure random secret string.
 * Returns 32 random bytes encoded as hex (64 characters).
 */
function generateSecret(): string {
  return randomBytes(32).toString('hex');
}

export function createRotateSecretHandler(
  settingsService: SettingsService
): (req: Request, res: Response, next: NextFunction) => Promise<void> {
  return async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const credentials = await settingsService.getCredentials();
      const currentSecret = credentials.webhookSecrets?.github;

      const newSecret = generateSecret();
      const expiresAt = new Date(Date.now() + PREVIOUS_SECRET_TTL_MS).toISOString();

      await settingsService.updateCredentials({
        webhookSecrets: {
          ...credentials.webhookSecrets,
          github: newSecret,
          previousGithub: currentSecret ?? undefined,
          previousGithubExpiresAt: currentSecret ? expiresAt : undefined,
        },
      });

      logger.info(
        currentSecret
          ? `GitHub webhook secret rotated. Previous secret valid until ${expiresAt}`
          : 'GitHub webhook secret generated (first-time setup)'
      );

      res.json({
        success: true,
        newSecret,
        previousSecretExpiresAt: currentSecret ? expiresAt : null,
        message: currentSecret
          ? 'Secret rotated. Update your GitHub webhook configuration with the new secret. The previous secret remains valid for 24 hours.'
          : 'New webhook secret generated. Configure it in your GitHub webhook settings.',
      });
    } catch (error) {
      logger.error('Failed to rotate webhook secret:', error);
      next(error);
    }
  };
}
