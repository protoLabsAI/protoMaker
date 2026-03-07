/**
 * POST /api/briefing/digest - Get briefing digest of events
 *
 * Request body: {
 *   projectPath: string,
 *   timeRange?: '1h' | '6h' | '24h' | '7d',
 *   since?: string (ISO timestamp),
 *   limit?: number (max events, default 200, capped at 1000)
 * }
 * Response: {
 *   success: true,
 *   signals: {
 *     critical: StoredEvent[],
 *     high: StoredEvent[],
 *     medium: StoredEvent[],
 *     low: StoredEvent[]
 *   },
 *   summary: { critical: number, high: number, medium: number, low: number, total: number },
 *   since: string,
 *   hasMore: boolean,
 *   projectPath: string
 * }
 */

import type { Request, Response } from 'express';
import type { EventHistoryService } from '../../../services/event-history-service.js';
import type { BriefingCursorService } from '../../../services/briefing-cursor-service.js';
import type { StoredEvent, StoredEventSummary, EventHookTrigger } from '@protolabsai/types';
import { getErrorMessage, logError } from '../common.js';

/**
 * Severity levels for briefing digest
 */
type BriefingSeverity = 'critical' | 'high' | 'medium' | 'low';

/**
 * Map event triggers to severity levels
 * Based on importance to Ava's briefing needs
 */
const TRIGGER_SEVERITY_MAP: Record<EventHookTrigger, BriefingSeverity> = {
  // Critical: System failures, blocked features, health checks
  auto_mode_error: 'critical',
  health_check_critical: 'critical',
  feature_permanently_blocked: 'critical',
  feature_pr_closed_unmerged: 'critical',
  headsdown_agent_work_failed: 'critical',
  pr_ci_failure: 'critical',

  // High: Feature failures, completions, retries, recoveries, key successes
  feature_error: 'high',
  feature_retry: 'high',
  feature_recovery: 'high',
  pr_feedback_received: 'high',
  feature_success: 'high',
  feature_completed: 'high',
  feature_pr_merged: 'high',
  pr_approved: 'high',
  headsdown_agent_work_completed: 'high',
  pr_remediation_completed: 'high',
  auto_mode_started: 'high',

  // Medium: Routine state changes, completions, ceremonies
  auto_mode_complete: 'medium',
  auto_mode_health_check: 'medium',
  auto_mode_stopped: 'medium',
  skill_created: 'medium',
  memory_learning: 'medium',
  project_scaffolded: 'medium',
  milestone_completed: 'medium',
  project_completed: 'medium',
  feature_started: 'medium',
  feature_stopped: 'medium',
  feature_committed: 'medium',
  feature_blocked: 'medium',
  feature_unblocked: 'medium',
  pr_changes_requested: 'medium',
  pr_remediation_started: 'medium',
  ceremony_triggered: 'medium',
  ceremony_milestone_update: 'medium',
  ceremony_project_retro: 'medium',

  // Low: Informational events, creation events, low-impact changes
  feature_created: 'low',
  project_deleted: 'low',
  feature_status_changed: 'low',
  feature_agent_suggested: 'low',
  headsdown_agent_started: 'low',
  headsdown_agent_stopped: 'low',
  worktree_drift_detected: 'low',
  coderabbit_review_received: 'low',
  issue_created: 'low',
  prd_created: 'low',
  project_analysis_completed: 'low',
  discord_message_detected: 'low',
  project_status_changed: 'low',
  pr_remediation_failed: 'low',
  health_issue_detected: 'low',
};

/**
 * Convert time range string to milliseconds
 */
function timeRangeToMs(timeRange: string): number {
  const ranges: Record<string, number> = {
    '1h': 60 * 60 * 1000,
    '6h': 6 * 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
  };
  return ranges[timeRange] ?? ranges['24h'];
}

/**
 * Calculate the "since" timestamp based on parameters
 */
async function calculateSince(
  briefingCursorService: BriefingCursorService,
  projectPath: string,
  timeRange?: string,
  since?: string
): Promise<string> {
  // If explicit since timestamp provided, validate and use it
  if (since) {
    if (isNaN(Date.parse(since))) {
      throw new Error('Invalid "since" timestamp format');
    }
    return since;
  }

  // If time range provided, calculate from now
  if (timeRange) {
    const ms = timeRangeToMs(timeRange);
    const timestamp = new Date(Date.now() - ms).toISOString();
    return timestamp;
  }

  // Otherwise, use cursor or default to 24h
  const cursor = await briefingCursorService.getCursor(projectPath);
  if (cursor) {
    return cursor;
  }

  // Default to 24h
  const ms = timeRangeToMs('24h');
  return new Date(Date.now() - ms).toISOString();
}

/**
 * Group event summaries by severity
 */
function groupSummariesBySeverity(events: StoredEventSummary[]): {
  critical: StoredEventSummary[];
  high: StoredEventSummary[];
  medium: StoredEventSummary[];
  low: StoredEventSummary[];
} {
  const grouped = {
    critical: [] as StoredEventSummary[],
    high: [] as StoredEventSummary[],
    medium: [] as StoredEventSummary[],
    low: [] as StoredEventSummary[],
  };

  for (const event of events) {
    const severity = TRIGGER_SEVERITY_MAP[event.trigger] || 'low';
    grouped[severity].push(event);
  }

  return grouped;
}

/**
 * Slim event shape for compact briefings (critical/high only)
 */
interface CompactEvent {
  trigger: EventHookTrigger;
  featureName?: string;
  featureId?: string;
  error?: string;
  timestamp: string;
}

/**
 * Build compact response: slim events for critical/high, aggregated counts for medium/low
 */
async function buildCompactSignals(
  grouped: ReturnType<typeof groupSummariesBySeverity>,
  eventHistoryService: EventHistoryService,
  projectPath: string
): Promise<{
  critical: CompactEvent[];
  high: CompactEvent[];
  medium: Record<string, number>;
  low: Record<string, number>;
}> {
  // For critical/high: load full events but only keep essential fields
  const importantSummaries = [...grouped.critical, ...grouped.high];
  const fullEvents = await Promise.all(
    importantSummaries.map((s) => eventHistoryService.getEvent(projectPath, s.id))
  );

  const slimEvents = fullEvents
    .filter((e): e is StoredEvent => e !== null)
    .map(
      (e): CompactEvent => ({
        trigger: e.trigger,
        featureName: e.featureName,
        featureId: e.featureId,
        error: e.error,
        timestamp: e.timestamp,
      })
    );

  const criticalCount = grouped.critical.length;

  // For medium/low: aggregate by trigger type
  const aggregateTriggers = (events: StoredEventSummary[]): Record<string, number> => {
    const counts: Record<string, number> = {};
    for (const e of events) {
      counts[e.trigger] = (counts[e.trigger] || 0) + 1;
    }
    return counts;
  };

  return {
    critical: slimEvents.slice(0, criticalCount),
    high: slimEvents.slice(criticalCount),
    medium: aggregateTriggers(grouped.medium),
    low: aggregateTriggers(grouped.low),
  };
}

export function createDigestHandler(
  eventHistoryService: EventHistoryService,
  briefingCursorService: BriefingCursorService
) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, timeRange, since, limit, compact } = req.body as {
        projectPath: string;
        timeRange?: '1h' | '6h' | '24h' | '7d';
        since?: string;
        limit?: number;
        compact?: boolean;
      };

      if (!projectPath || typeof projectPath !== 'string') {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      const useCompact = compact !== false; // default true

      // Calculate the since timestamp
      let sinceTimestamp: string;
      try {
        sinceTimestamp = await calculateSince(briefingCursorService, projectPath, timeRange, since);
      } catch (validationError) {
        res.status(400).json({ success: false, error: (validationError as Error).message });
        return;
      }

      // Get event summaries since timestamp
      const events = await eventHistoryService.getEvents(projectPath, {
        since: sinceTimestamp,
      });

      // Apply limit to prevent unbounded responses
      const maxEvents = Math.min(limit || 200, 1000);
      const hasMore = events.length > maxEvents;
      const limitedEvents = events.slice(0, maxEvents);

      // Group summaries by severity
      const grouped = groupSummariesBySeverity(limitedEvents);

      // Calculate summary counts
      const summary = {
        critical: grouped.critical.length,
        high: grouped.high.length,
        medium: grouped.medium.length,
        low: grouped.low.length,
        total: limitedEvents.length,
      };

      if (useCompact) {
        // Compact mode: slim events for critical/high, aggregated counts for medium/low
        const signals = await buildCompactSignals(grouped, eventHistoryService, projectPath);

        res.json({
          success: true,
          signals,
          summary,
          since: sinceTimestamp,
          hasMore,
        });
      } else {
        // Full mode: load all event details (legacy behavior)
        const fullEvents = await Promise.all(
          limitedEvents.map((s) => eventHistoryService.getEvent(projectPath, s.id))
        );
        const validEvents = fullEvents.filter((e): e is StoredEvent => e !== null);
        const fullGrouped = {
          critical: [] as StoredEvent[],
          high: [] as StoredEvent[],
          medium: [] as StoredEvent[],
          low: [] as StoredEvent[],
        };
        for (const event of validEvents) {
          const severity = TRIGGER_SEVERITY_MAP[event.trigger] || 'low';
          fullGrouped[severity].push(event);
        }

        res.json({
          success: true,
          signals: fullGrouped,
          summary,
          since: sinceTimestamp,
          hasMore,
          projectPath,
        });
      }
    } catch (error) {
      logError(error, 'Get briefing digest failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
