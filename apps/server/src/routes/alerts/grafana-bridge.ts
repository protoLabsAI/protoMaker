/**
 * Grafana Webhook to Linear Issue Bridge
 *
 * Receives Grafana alert webhooks and automatically creates Linear issues.
 * Maps alert severity to Linear priority and applies appropriate labels.
 * Includes deduplication logic to avoid creating duplicate issues.
 */

import type { Request, Response } from 'express';
import { createLogger } from '@protolabs-ai/utils';
import { LinearMCPClient } from '../../services/linear-mcp-client.js';
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
 * Map Grafana alert severity to Linear priority
 * Linear priority: 0=none, 1=urgent, 2=high, 3=normal, 4=low
 * Grafana severity: critical, warning, info
 */
function mapSeverityToPriority(severity: string | undefined): number {
  if (!severity) return 3; // default to normal

  const severityLower = severity.toLowerCase();
  if (severityLower === 'critical' || severityLower === 'p1') return 1; // urgent
  if (severityLower === 'warning' || severityLower === 'p2') return 2; // high
  if (severityLower === 'info' || severityLower === 'p3') return 3; // normal

  return 3; // default to normal
}

/**
 * Determine labels based on alert source/type
 * Expected alert label patterns: alertname, service, source, etc.
 */
function determineLabels(alert: GrafanaAlert): string[] {
  const labels: string[] = [];
  const alertLabels = alert.labels;

  // Check for common source indicators
  if (
    alertLabels.service?.includes('infra') ||
    alertLabels.alertname?.toLowerCase().includes('infra') ||
    alertLabels.source?.includes('infra')
  ) {
    labels.push('infra');
  }

  if (
    alertLabels.service?.includes('deploy') ||
    alertLabels.alertname?.toLowerCase().includes('deploy') ||
    alertLabels.source?.includes('deploy')
  ) {
    labels.push('deploy');
  }

  if (
    alertLabels.service?.includes('agent') ||
    alertLabels.alertname?.toLowerCase().includes('agent') ||
    alertLabels.source?.includes('agent')
  ) {
    labels.push('agent');
  }

  if (
    alertLabels.service?.includes('cost') ||
    alertLabels.alertname?.toLowerCase().includes('cost') ||
    alertLabels.source?.includes('cost')
  ) {
    labels.push('cost');
  }

  // Default to infra if no specific label matched
  if (labels.length === 0) {
    labels.push('infra');
  }

  return labels;
}

/**
 * Format issue description with alert details
 */
function formatIssueDescription(alert: GrafanaAlert): string {
  const lines: string[] = [];

  lines.push('## Alert Details\n');
  lines.push(`**Status:** ${alert.status}`);
  lines.push(`**Started:** ${new Date(alert.startsAt).toISOString()}`);
  if (alert.endsAt) {
    lines.push(`**Ended:** ${new Date(alert.endsAt).toISOString()}`);
  }
  lines.push('');

  // Add annotations
  if (alert.annotations.description) {
    lines.push('## Description\n');
    lines.push(alert.annotations.description);
    lines.push('');
  }

  if (alert.annotations.summary) {
    lines.push('## Summary\n');
    lines.push(alert.annotations.summary);
    lines.push('');
  }

  // Add labels
  if (Object.keys(alert.labels).length > 0) {
    lines.push('## Labels\n');
    for (const [key, value] of Object.entries(alert.labels)) {
      lines.push(`- **${key}:** ${value}`);
    }
    lines.push('');
  }

  // Add dashboard link
  if (alert.dashboardURL || alert.generatorURL) {
    lines.push('## Links\n');
    if (alert.dashboardURL) {
      lines.push(`[View Dashboard](${alert.dashboardURL})`);
    }
    if (alert.panelURL) {
      lines.push(`[View Panel](${alert.panelURL})`);
    }
    if (alert.generatorURL && alert.generatorURL !== alert.dashboardURL) {
      lines.push(`[Alert Source](${alert.generatorURL})`);
    }
    lines.push('');
  }

  // Add values if present
  if (alert.values && Object.keys(alert.values).length > 0) {
    lines.push('## Values\n');
    for (const [key, value] of Object.entries(alert.values)) {
      lines.push(`- **${key}:** ${value}`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('_Auto-created from Grafana alert webhook_');

  return lines.join('\n');
}

/**
 * Check if an issue already exists for this alert rule
 * Returns the existing issue ID if found, null otherwise
 */
async function findExistingIssue(
  client: LinearMCPClient,
  alertName: string
): Promise<string | null> {
  try {
    // Search for issues with the alert name in the title
    // Linear's search will find issues with matching titles
    const searchQuery = `[Alert] ${alertName}`;
    const issues = await client.searchIssuesText(searchQuery);

    // If we find any matches with exact title, assume it's a duplicate
    // (Simple deduplication - doesn't check if resolved)
    for (const issue of issues) {
      if (issue.title === searchQuery) {
        logger.info(`Found existing issue for alert "${alertName}": ${issue.identifier}`);
        return issue.id;
      }
    }

    return null;
  } catch (error) {
    logger.warn(`Failed to search for existing issues:`, error);
    // On error, proceed to create new issue (better to have duplicate than miss alert)
    return null;
  }
}

/**
 * Create Grafana webhook handler
 */
export function createGrafanaWebhookHandler(
  settingsService: SettingsService,
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

      // Get project path from settings (use current project or default)
      const projectPath = process.cwd();

      // Initialize Linear client
      const linearClient = new LinearMCPClient(settingsService, projectPath);

      // Get team ID from settings (required for creating issues)
      const projectSettings = await settingsService.getProjectSettings(projectPath);
      const linearSettings = projectSettings.integrations?.linear;

      if (!linearSettings?.enabled || !linearSettings?.teamId) {
        logger.error('Linear integration not configured or disabled in project settings');
        res.status(500).json({
          success: false,
          error:
            'Linear integration not configured. Please configure Linear integration in project settings.',
        });
        return;
      }

      const results: Array<{ alertName: string; issueId?: string; error?: string }> = [];

      // Process each firing alert
      for (const alert of firingAlerts) {
        const alertName = alert.labels.alertname || alert.annotations.summary || 'Unknown Alert';

        try {
          // Check for existing issue
          const existingIssueId = await findExistingIssue(linearClient, alertName);

          if (existingIssueId) {
            logger.info(`Skipping duplicate alert "${alertName}" - issue already exists`);
            results.push({
              alertName,
              issueId: existingIssueId,
            });
            continue;
          }

          // Determine priority and labels
          const severity = alert.labels.severity || alert.annotations.severity;
          const priority = mapSeverityToPriority(severity);
          const labelNames = determineLabels(alert);

          // Create issue title
          const title = `[Alert] ${alertName}`;

          // Format description with label tags
          const description = `${formatIssueDescription(alert)}\n\n**Tags:** ${labelNames.join(', ')}`;

          // Create Linear issue
          const result = await linearClient.createIssue({
            title,
            description,
            teamId: linearSettings.teamId,
            priority,
          });

          logger.info(
            `Created Linear issue for alert "${alertName}": ${result.identifier || result.issueId}`
          );
          results.push({ alertName, issueId: result.issueId });

          // Post notification to Discord #infra channel
          if (discordBotService) {
            const infraChannelId = process.env.DISCORD_CHANNEL_INFRA || '';
            if (infraChannelId) {
              const issueUrl = result.url || `https://linear.app/issue/${result.issueId}`;
              const discordMessage = `🚨 **Auto-created bug from Grafana alert**\n\n**Alert:** ${alertName}\n**Priority:** ${severity || 'normal'}\n**Issue:** ${issueUrl}`;

              await discordBotService.sendToChannel(infraChannelId, discordMessage);
              logger.info(`Posted Discord notification for alert "${alertName}"`);
            }
          }
        } catch (error) {
          logger.error(`Failed to process alert "${alertName}":`, error);
          results.push({
            alertName,
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
