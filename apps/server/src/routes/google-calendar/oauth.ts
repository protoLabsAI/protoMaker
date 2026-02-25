/**
 * Google Calendar OAuth Routes — standard OAuth 2.0 flow with plain fetch.
 * Env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI
 */

import { Router, type Request, type Response } from 'express';
import { randomBytes } from 'node:crypto';
import { createLogger } from '@protolabs-ai/utils';
import type { SettingsService } from '../../services/settings-service.js';
import type { GoogleCalendarSyncService } from '../../services/google-calendar-sync-service.js';

const logger = createLogger('google-calendar:oauth');
const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];
const pendingStates = new Map<string, { projectPath: string; createdAt: number }>();

function cleanExpiredStates(): void {
  const now = Date.now();
  for (const [state, data] of pendingStates) {
    if (now - data.createdAt > 10 * 60 * 1000) pendingStates.delete(state);
  }
}

export function createGoogleOAuthRoutes(
  settingsService: SettingsService,
  googleCalendarSyncService?: GoogleCalendarSyncService
): Router {
  const router = Router();

  // GET /authorize — redirect to Google OAuth consent screen
  router.get('/authorize', (req: Request, res: Response) => {
    const projectPath = req.query.projectPath as string;
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;

    if (!clientId || !redirectUri) {
      res.status(500).json({ error: 'GOOGLE_CLIENT_ID and GOOGLE_REDIRECT_URI must be set' });
      return;
    }
    if (!projectPath) {
      res.status(400).json({ error: 'projectPath query parameter is required' });
      return;
    }

    cleanExpiredStates();
    const state = randomBytes(32).toString('hex');
    pendingStates.set(state, { projectPath, createdAt: Date.now() });

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: SCOPES.join(' '),
      state,
      access_type: 'offline',
      prompt: 'consent',
    });

    logger.info('Redirecting to Google OAuth', { projectPath });
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  });

  // GET /callback — exchange code for tokens
  router.get('/callback', async (req: Request, res: Response) => {
    const { code, state, error: oauthError } = req.query;

    if (oauthError) {
      logger.error('OAuth error from Google', { error: oauthError });
      res.status(400).json({ error: `Google OAuth error: ${oauthError}` });
      return;
    }
    if (!code || !state) {
      res.status(400).json({ error: 'Missing code or state parameter' });
      return;
    }

    const stateData = pendingStates.get(state as string);
    if (!stateData) {
      res.status(400).json({ error: 'Invalid or expired state parameter' });
      return;
    }
    pendingStates.delete(state as string);

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;
    if (!clientId || !clientSecret || !redirectUri) {
      res.status(500).json({ error: 'Google OAuth env vars not configured' });
      return;
    }

    try {
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: code as string,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
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
        refresh_token?: string;
        expires_in: number;
      };

      let email: string | undefined;
      try {
        const resp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });
        if (resp.ok) email = ((await resp.json()) as { email?: string }).email;
      } catch {
        logger.warn('Failed to fetch user email');
      }

      const { projectPath } = stateData;
      await settingsService.updateProjectSettings(projectPath, {
        integrations: {
          google: {
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token,
            tokenExpiry: Date.now() + tokenData.expires_in * 1000,
            email,
            calendarId: 'primary',
          },
        },
      });

      logger.info('Google Calendar OAuth completed', { projectPath, email });
      res.send(
        '<html><body style="font-family:system-ui;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#0a0a0a;color:#fff"><div style="text-align:center"><h1>Google Calendar Connected</h1><p style="color:#888">You can close this window.</p></div></body></html>'
      );
    } catch (error) {
      logger.error('OAuth callback failed', { error });
      res.status(500).json({ error: 'OAuth callback failed' });
    }
  });

  // POST /status — check connection status
  router.post('/status', async (req: Request, res: Response) => {
    try {
      const { projectPath } = req.body;
      if (!projectPath) {
        res.status(400).json({ error: 'projectPath is required' });
        return;
      }

      const settings = await settingsService.getProjectSettings(projectPath);
      const google = settings.integrations?.google;
      const connected = !!(google?.accessToken && google?.refreshToken);

      res.json({
        connected,
        email: connected ? google?.email : undefined,
        hasClientCredentials: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
      });
    } catch (error) {
      logger.error('Failed to check Google OAuth status', { error });
      res.status(500).json({ error: 'Failed to check OAuth status' });
    }
  });

  // POST /revoke — revoke token and clear credentials
  router.post('/revoke', async (req: Request, res: Response) => {
    try {
      const { projectPath } = req.body;
      if (!projectPath) {
        res.status(400).json({ error: 'projectPath is required' });
        return;
      }

      const settings = await settingsService.getProjectSettings(projectPath);
      const token = settings.integrations?.google?.accessToken;

      if (token) {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });
      }

      await settingsService.updateProjectSettings(projectPath, {
        integrations: {
          google: {
            accessToken: undefined,
            refreshToken: undefined,
            tokenExpiry: undefined,
            email: undefined,
            calendarId: undefined,
          },
        },
      });

      logger.info('Google Calendar OAuth token revoked', { projectPath });
      res.json({ success: true });
    } catch (error) {
      logger.error('Failed to revoke Google token', { error });
      res.status(500).json({ error: 'Failed to revoke token' });
    }
  });

  // POST /sync — trigger a one-time sync from Google Calendar
  router.post('/sync', async (req: Request, res: Response) => {
    try {
      const { projectPath } = req.body;
      if (!projectPath) {
        res.status(400).json({ error: 'projectPath is required' });
        return;
      }

      if (!googleCalendarSyncService) {
        res.status(503).json({ error: 'Google Calendar sync service not available' });
        return;
      }

      const settings = await settingsService.getProjectSettings(projectPath);
      const google = settings.integrations?.google;
      if (!google?.accessToken || !google?.refreshToken) {
        res.status(400).json({ error: 'Google Calendar not connected. Complete OAuth first.' });
        return;
      }

      const result = await googleCalendarSyncService.syncFromGoogle(projectPath);

      logger.info('Google Calendar sync completed', { projectPath, ...result });
      res.json({ synced: result.synced, created: result.created });
    } catch (error) {
      logger.error('Google Calendar sync failed', { error });
      const message = error instanceof Error ? error.message : 'Sync failed';
      res.status(500).json({ error: message });
    }
  });

  return router;
}
