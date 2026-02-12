/**
 * Linear OAuth Routes (actor=app)
 *
 * Implements the OAuth 2.0 flow for registering Automaker as a Linear agent.
 * Uses actor=app to create a dedicated agent user in the workspace.
 *
 * Flow:
 * 1. GET /authorize → redirects to Linear OAuth with actor=app
 * 2. GET /callback  → exchanges code for token, stores per-workspace
 * 3. POST /status   → checks if OAuth is configured
 * 4. POST /revoke   → revokes token
 *
 * Required env vars:
 *   LINEAR_CLIENT_ID, LINEAR_CLIENT_SECRET, LINEAR_REDIRECT_URI
 */

import { Router, type Request, type Response } from 'express';
import { randomBytes } from 'node:crypto';
import { createLogger } from '@automaker/utils';
import type { SettingsService } from '../../services/settings-service.js';

const logger = createLogger('linear:oauth');

/** Scopes needed for agent functionality */
const AGENT_SCOPES = [
  'read',
  'write',
  'issues:create',
  'comments:create',
  'app:assignable',
  'app:mentionable',
];

/** In-memory state store for CSRF protection (short-lived) */
const pendingStates = new Map<string, { projectPath: string; createdAt: number }>();

/** Clean up expired states older than 10 minutes */
function cleanExpiredStates(): void {
  const now = Date.now();
  for (const [state, data] of pendingStates) {
    if (now - data.createdAt > 10 * 60 * 1000) {
      pendingStates.delete(state);
    }
  }
}

export function createOAuthRoutes(settingsService: SettingsService): Router {
  const router = Router();

  /**
   * GET /api/linear/oauth/authorize
   * Initiates the OAuth flow — redirects to Linear's consent screen.
   * Query params: ?projectPath=/path/to/project
   */
  router.get('/authorize', (req: Request, res: Response) => {
    const projectPath = req.query.projectPath as string;
    const clientId = process.env.LINEAR_CLIENT_ID;
    const redirectUri = process.env.LINEAR_REDIRECT_URI;

    if (!clientId || !redirectUri) {
      res.status(500).json({
        error: 'LINEAR_CLIENT_ID and LINEAR_REDIRECT_URI must be set in environment',
      });
      return;
    }

    if (!projectPath) {
      res.status(400).json({ error: 'projectPath query parameter is required' });
      return;
    }

    // Generate CSRF state
    cleanExpiredStates();
    const state = randomBytes(32).toString('hex');
    pendingStates.set(state, { projectPath, createdAt: Date.now() });

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: AGENT_SCOPES.join(','),
      state,
      actor: 'app',
      prompt: 'consent',
    });

    const authorizeUrl = `https://linear.app/oauth/authorize?${params.toString()}`;

    logger.info('Redirecting to Linear OAuth', { projectPath });
    res.redirect(authorizeUrl);
  });

  /**
   * GET /api/linear/oauth/callback
   * Handles the OAuth callback — exchanges code for token.
   */
  router.get('/callback', async (req: Request, res: Response) => {
    const { code, state, error: oauthError } = req.query;

    if (oauthError) {
      logger.error('OAuth error from Linear', { error: oauthError });
      res.status(400).json({ error: `Linear OAuth error: ${oauthError}` });
      return;
    }

    if (!code || !state) {
      res.status(400).json({ error: 'Missing code or state parameter' });
      return;
    }

    // Validate CSRF state
    const stateData = pendingStates.get(state as string);
    if (!stateData) {
      res.status(400).json({ error: 'Invalid or expired state parameter' });
      return;
    }
    pendingStates.delete(state as string);

    const clientId = process.env.LINEAR_CLIENT_ID;
    const clientSecret = process.env.LINEAR_CLIENT_SECRET;
    const redirectUri = process.env.LINEAR_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      res.status(500).json({ error: 'OAuth env vars not configured' });
      return;
    }

    try {
      // Exchange code for token
      const tokenResponse = await fetch('https://api.linear.app/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: code as string,
          redirect_uri: redirectUri,
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'authorization_code',
        }),
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        logger.error('Token exchange failed', { status: tokenResponse.status, error: errorText });
        res.status(500).json({ error: 'Failed to exchange authorization code' });
        return;
      }

      const tokenData = (await tokenResponse.json()) as {
        access_token: string;
        token_type: string;
        expires_in: number;
        scope: string;
        refresh_token?: string;
      };

      // Store token in project settings
      const { projectPath } = stateData;
      await settingsService.updateProjectSettings(projectPath, {
        integrations: {
          linear: {
            enabled: true,
            agentToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token,
            tokenExpiresAt: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
            scopes: tokenData.scope.split(',').map((s) => s.trim()),
          },
        },
      });

      logger.info('Linear OAuth completed successfully', { projectPath });

      // Return success page
      res.send(`
        <!DOCTYPE html>
        <html>
        <head><title>Automaker - Linear Connected</title></head>
        <body style="font-family: system-ui; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #0a0a0a; color: #fff;">
          <div style="text-align: center;">
            <h1>Linear Agent Connected</h1>
            <p>Automaker is now registered as an agent in your Linear workspace.</p>
            <p style="color: #888;">You can close this window.</p>
          </div>
        </body>
        </html>
      `);
    } catch (error) {
      logger.error('OAuth callback failed', { error });
      res.status(500).json({ error: 'OAuth callback failed' });
    }
  });

  /**
   * POST /api/linear/oauth/status
   * Check if Linear OAuth is configured for a project.
   */
  router.post('/status', async (req: Request, res: Response) => {
    try {
      const { projectPath } = req.body;
      if (!projectPath) {
        res.status(400).json({ error: 'projectPath is required' });
        return;
      }

      const settings = await settingsService.getProjectSettings(projectPath);
      const linear = settings.integrations?.linear;

      const configured = !!(linear?.enabled && linear?.agentToken);
      const expired = linear?.tokenExpiresAt ? new Date(linear.tokenExpiresAt) < new Date() : true;

      res.json({
        configured,
        expired: configured ? expired : undefined,
        scopes: configured ? linear?.scopes : undefined,
        hasClientCredentials: !!(process.env.LINEAR_CLIENT_ID && process.env.LINEAR_CLIENT_SECRET),
      });
    } catch (error) {
      logger.error('Failed to check OAuth status', { error });
      res.status(500).json({ error: 'Failed to check OAuth status' });
    }
  });

  /**
   * POST /api/linear/oauth/revoke
   * Revoke the Linear agent token.
   */
  router.post('/revoke', async (req: Request, res: Response) => {
    try {
      const { projectPath } = req.body;
      if (!projectPath) {
        res.status(400).json({ error: 'projectPath is required' });
        return;
      }

      const settings = await settingsService.getProjectSettings(projectPath);
      const token = settings.integrations?.linear?.agentToken;

      if (token) {
        // Revoke at Linear
        await fetch('https://api.linear.app/oauth/revoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token }),
        });
      }

      // Clear from settings
      await settingsService.updateProjectSettings(projectPath, {
        integrations: {
          linear: {
            enabled: false,
            agentToken: undefined,
            refreshToken: undefined,
            tokenExpiresAt: undefined,
            scopes: undefined,
          },
        },
      });

      logger.info('Linear OAuth token revoked', { projectPath });
      res.json({ success: true });
    } catch (error) {
      logger.error('Failed to revoke token', { error });
      res.status(500).json({ error: 'Failed to revoke token' });
    }
  });

  return router;
}
