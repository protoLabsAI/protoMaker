/**
 * Google Calendar Sync Service — syncs events from Google Calendar into CalendarService.
 *
 * Uses plain fetch against Google Calendar API v3. Reads OAuth tokens from project
 * settings (stored by the Google Calendar OAuth flow). Handles automatic token refresh
 * when the access token is expired or about to expire.
 */

import { createLogger } from '@protolabs-ai/utils';
import type { SettingsService } from './settings-service.js';
import type { CalendarService, CalendarEvent } from './calendar-service.js';

const logger = createLogger('GoogleCalendarSync');

const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

/** Minimum remaining lifetime before we proactively refresh (5 minutes) */
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

/**
 * Shape of a Google Calendar event from the API (subset of fields we use)
 */
interface GoogleCalendarEvent {
  id: string;
  summary?: string;
  description?: string;
  status?: string;
  htmlLink?: string;
  colorId?: string;
  start?: {
    date?: string; // All-day event: YYYY-MM-DD
    dateTime?: string; // Timed event: RFC 3339
  };
  end?: {
    date?: string;
    dateTime?: string;
  };
  created?: string;
  updated?: string;
}

/**
 * Google Calendar API list response
 */
interface GoogleCalendarListResponse {
  items?: GoogleCalendarEvent[];
  nextPageToken?: string;
}

/**
 * Google token refresh response
 */
interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  refresh_token?: string;
}

export class GoogleCalendarSyncService {
  constructor(
    private settingsService: SettingsService,
    private calendarService: CalendarService
  ) {}

  /**
   * Refresh the access token if it is expired or about to expire.
   * Updates project settings with the new token on success.
   */
  async refreshTokenIfNeeded(projectPath: string): Promise<string> {
    const settings = await this.settingsService.getProjectSettings(projectPath);
    const google = settings.integrations?.google;

    if (!google?.accessToken || !google?.refreshToken) {
      throw new Error('Google Calendar not connected — missing OAuth tokens');
    }

    const now = Date.now();
    const expiry = google.tokenExpiry ?? 0;

    // Token still valid with buffer
    if (now < expiry - TOKEN_REFRESH_BUFFER_MS) {
      return google.accessToken;
    }

    logger.info('Access token expired or expiring soon, refreshing...');

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set for token refresh');
    }

    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: google.refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Token refresh failed', { status: response.status, error: errorText });
      throw new Error(`Google token refresh failed (${response.status}): ${errorText}`);
    }

    const tokenData = (await response.json()) as GoogleTokenResponse;
    const newExpiry = now + tokenData.expires_in * 1000;

    // Persist new tokens (refresh token may or may not be returned)
    await this.settingsService.updateProjectSettings(projectPath, {
      integrations: {
        google: {
          ...google,
          accessToken: tokenData.access_token,
          tokenExpiry: newExpiry,
          ...(tokenData.refresh_token ? { refreshToken: tokenData.refresh_token } : {}),
        },
      },
    });

    logger.info('Access token refreshed successfully');
    return tokenData.access_token;
  }

  /**
   * Fetch events from Google Calendar API within a time range.
   * Handles pagination to retrieve all matching events.
   */
  async listGoogleEvents(
    projectPath: string,
    timeMin: string,
    timeMax: string
  ): Promise<GoogleCalendarEvent[]> {
    const accessToken = await this.refreshTokenIfNeeded(projectPath);

    const settings = await this.settingsService.getProjectSettings(projectPath);
    const calendarId = settings.integrations?.google?.calendarId || 'primary';

    const allEvents: GoogleCalendarEvent[] = [];
    let pageToken: string | undefined;

    do {
      const params = new URLSearchParams({
        timeMin,
        timeMax,
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: '250',
      });

      if (pageToken) {
        params.set('pageToken', pageToken);
      }

      const url = `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`;

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('Google Calendar API request failed', {
          status: response.status,
          error: errorText,
        });
        throw new Error(`Google Calendar API error (${response.status}): ${errorText}`);
      }

      const data = (await response.json()) as GoogleCalendarListResponse;

      if (data.items) {
        allEvents.push(...data.items);
      }

      pageToken = data.nextPageToken;
    } while (pageToken);

    return allEvents;
  }

  /**
   * Sync events from Google Calendar into CalendarService.
   * Fetches events for a 90-day window (30 days back, 60 days forward) and
   * upserts them as 'google' type CalendarEvent records keyed by sourceId.
   *
   * Returns the count of events synced (created + updated).
   */
  async syncFromGoogle(projectPath: string): Promise<{ synced: number; created: number }> {
    const now = new Date();
    const timeMin = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const timeMax = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000).toISOString();

    logger.info('Starting Google Calendar sync', { projectPath, timeMin, timeMax });

    const googleEvents = await this.listGoogleEvents(projectPath, timeMin, timeMax);
    let synced = 0;
    let created = 0;

    for (const gEvent of googleEvents) {
      // Skip cancelled events
      if (gEvent.status === 'cancelled') {
        continue;
      }

      // Determine start date
      const startDate = gEvent.start?.date || gEvent.start?.dateTime;
      if (!startDate) {
        logger.warn('Skipping Google Calendar event with no start date', { id: gEvent.id });
        continue;
      }

      // Normalize to YYYY-MM-DD for all-day events or keep ISO for timed events
      const date = startDate.length === 10 ? startDate : startDate.substring(0, 10);

      // Determine end date (optional)
      const endRaw = gEvent.end?.date || gEvent.end?.dateTime;
      const endDate = endRaw
        ? endRaw.length === 10
          ? endRaw
          : endRaw.substring(0, 10)
        : undefined;

      const eventData: Omit<CalendarEvent, 'id' | 'projectPath' | 'createdAt' | 'updatedAt'> = {
        title: gEvent.summary || '(No title)',
        date,
        endDate: endDate !== date ? endDate : undefined,
        type: 'google',
        description: gEvent.description?.substring(0, 500) || undefined,
        url: gEvent.htmlLink || undefined,
        sourceId: gEvent.id,
      };

      const result = await this.calendarService.upsertBySourceId(projectPath, gEvent.id, eventData);
      synced++;
      if (result.created) {
        created++;
      }
    }

    logger.info('Google Calendar sync complete', {
      projectPath,
      total: googleEvents.length,
      synced,
      created,
      updated: synced - created,
    });

    return { synced, created };
  }
}
