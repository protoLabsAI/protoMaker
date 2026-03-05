/**
 * Grafana Webhook Bridge
 *
 * Receives Grafana alert webhooks and posts notifications to Discord.
 */

import type { Request, Response } from 'express';
import { createLogger } from '@protolabsai/utils';
import type { SettingsService } from '../../services/settings-service.js';
import type { DiscordBotService } from '../../services/discord-bot-service.js';

const logger = createLogger('GrafanaBridge');

/**
 * Grafana webhook alert payload structure
 * Ref: https://grafana.com/docs/grafana/latest/alerting/configure-notifications/manage-contact-points/webhook-notifier/
 */
interface GrafanaAlert {
  status: string; // 'firing' | 'resolved'
  labels: Record<string, string>;
  annotations: Record<string, string>;
  startsAt: string;
  endsAt?: string;
  generatorURL: string;
  fingerprint: string;
  silenceURL?: string;
  dashboardURL?: string;
  panelURL?: string;
  values?: Record<string, number>;
}

interface GrafanaWebhookPayload {
  receiver: string;
  status: string;
  alerts: GrafanaAlert[];
  groupLabels: Record<string, string>;
  commonLabels: Record<string, string>;
  commonAnnotations: Record<string, string>;
  externalURL: string;
  version: string;
  groupKey: string;
  truncatedAlerts?: number;
}

/**
 * Format alert details for Discord notification
 */
function formatAlertMessage(alert: GrafanaAlert): string {
  const alertName = alert.labels.alertname || alert.annotations.summary || 'Unknown Alert';
  const severity = alert.labels.severity || alert.annotations.severity || 'normal';
  const description = alert.annotations.description || alert.annotations.summary || '';

  const lines: string[] = [];
  lines.push(`**Alert:** ${alertName}`);
  lines.push(`**Severity:** ${severity}`);
  lines.push(`**Status:** ${alert.status}`);
  lines.push(`**Started:** ${new Date(alert.startsAt).toISOString()}`);

  if (description) {
    lines.push(`**Description:** ${description}`);
  }

  if (alert.dashboardURL) {
    lines.push(`**Dashboard:** ${alert.dashboardURL}`);
  }

  return lines.join('\n');
}

/**
 * Create Grafana webhook handler
 */
export function createGrafanaWebhookHandler(
  _settingsService: SettingsService,
  discordBotService?: DiscordBotService
) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const payload = req.body as GrafanaWebhookPayload;

      logger.info('Received Grafana webhook', {
        status: payload.status,
        alertCount: payload.alerts.length,
        groupKey: payload.groupKey,
      });

      // Only process firing alerts
      const firingAlerts = payload.alerts.filter((alert) => alert.status === 'firing');

      if (firingAlerts.length === 0) {
        logger.info('No firing alerts to process');
        res.status(200).json({ success: true, message: 'No firing alerts' });
        return;
      }

      const results: Array<{ alertName: string; notified: boolean; error?: string }> = [];

      // Process each firing alert
      for (const alert of firingAlerts) {
        const alertName = alert.labels.alertname || alert.annotations.summary || 'Unknown Alert';

        try {
          // Post notification to Discord #infra channel
          if (discordBotService) {
            const infraChannelId = process.env.DISCORD_CHANNEL_INFRA || '';
            if (infraChannelId) {
              const discordMessage = `**Grafana Alert**\n\n${formatAlertMessage(alert)}`;
              await discordBotService.sendToChannel(infraChannelId, discordMessage);
              logger.info(`Posted Discord notification for alert "${alertName}"`);
              results.push({ alertName, notified: true });
            } else {
              logger.warn('DISCORD_CHANNEL_INFRA not configured, skipping notification');
              results.push({ alertName, notified: false, error: 'No infra channel configured' });
            }
          } else {
            logger.warn('Discord bot service not available, skipping notification');
            results.push({ alertName, notified: false, error: 'Discord bot not available' });
          }
        } catch (error) {
          logger.error(`Failed to process alert "${alertName}":`, error);
          results.push({
            alertName,
            notified: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      res.status(200).json({
        success: true,
        processed: results.length,
        results,
      });
    } catch (error) {
      logger.error('Failed to process Grafana webhook:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}
