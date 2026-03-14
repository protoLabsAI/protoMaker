/**
 * GET /api/projects/:slug/timeline
 *
 * Returns all EventLedger events for a project, transformed into
 * display-ready TimelineEvent objects sorted chronologically (newest first).
 *
 * The transformation maps raw EventLedgerEntry (timestamp, eventType, payload)
 * to TimelineEvent (occurredAt, type, title, description, author) so the UI
 * can render them without needing to understand the raw ledger schema.
 *
 * When the ledger has no entries for a project, falls back to constructing
 * timeline events directly from feature metadata (creation dates, status
 * transitions). This ensures the timeline is populated even before ledger
 * enrichment begins.
 *
 * Query params:
 *   ?projectPath=<path>  — project root path (used for feature fallback)
 *   ?since=<ISO 8601>    — only return events after this timestamp (exclusive)
 *   ?type=<eventType>    — only return events of this type
 */

import type { Request, Response } from 'express';
import type { EventLedgerEntry, Feature } from '@protolabsai/types';
import type { EventLedgerService } from '../../../services/event-ledger-service.js';
import type { FeatureLoader } from '../../../services/feature-loader.js';

interface TimelineEvent {
  id: string;
  type: string;
  title: string;
  description?: string;
  occurredAt: string;
  author?: string;
  /** URL to an associated artifact (e.g. ceremony report markdown) */
  artifactUrl?: string;
  /** Human-readable ceremony type label, e.g. "Standup", "Milestone Retro" */
  ceremonyLabel?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Transform a raw EventLedgerEntry into a display-ready TimelineEvent.
 * Maps event types to UI-friendly categories and extracts titles/descriptions
 * from the unstructured payload.
 */
function toTimelineEvent(entry: EventLedgerEntry): TimelineEvent {
  const payload = entry.payload as Record<string, unknown>;

  switch (entry.eventType) {
    // ─── Feature lifecycle ────────────────────────────────────────
    case 'feature:status-changed': {
      const from = payload.from as string | undefined;
      const to = payload.to as string | undefined;
      const reason = payload.reason as string | undefined;
      const featureTitle =
        (payload.featureTitle as string) ?? entry.correlationIds.featureId ?? 'Feature';

      // Map to more specific display types
      let type = 'feature:status-changed';
      if (to === 'done') type = 'feature:done';
      else if (to === 'review') type = 'pr:merged';
      else if (to === 'blocked') type = 'escalation';

      return {
        id: entry.id,
        type,
        title: `${featureTitle}: ${from ?? '?'} → ${to ?? '?'}`,
        description: reason,
        occurredAt: entry.timestamp,
        author: entry.source,
      };
    }

    case 'feature:started': {
      const featureTitle =
        (payload.featureTitle as string) ?? entry.correlationIds.featureId ?? 'Feature';
      return {
        id: entry.id,
        type: 'feature:started',
        title: `Started: ${featureTitle}`,
        description: payload.model as string | undefined,
        occurredAt: entry.timestamp,
        author: entry.source,
      };
    }

    case 'feature:completed': {
      const featureTitle =
        (payload.featureTitle as string) ?? entry.correlationIds.featureId ?? 'Feature';
      return {
        id: entry.id,
        type: 'feature:done',
        title: `Completed: ${featureTitle}`,
        description: payload.prNumber ? `PR #${payload.prNumber}` : undefined,
        occurredAt: entry.timestamp,
        author: entry.source,
      };
    }

    case 'feature:error': {
      const featureTitle =
        (payload.featureTitle as string) ?? entry.correlationIds.featureId ?? 'Feature';
      const error = (payload.error as string) ?? (payload.message as string);
      return {
        id: entry.id,
        type: 'escalation',
        title: `Error: ${featureTitle}`,
        description: error,
        occurredAt: entry.timestamp,
        author: entry.source,
      };
    }

    case 'feature:pr-merged': {
      const featureTitle =
        (payload.featureTitle as string) ?? entry.correlationIds.featureId ?? 'Feature';
      const prNumber = payload.prNumber as number | undefined;
      return {
        id: entry.id,
        type: 'pr:merged',
        title: `PR merged: ${featureTitle}`,
        description: prNumber ? `PR #${prNumber}` : undefined,
        occurredAt: entry.timestamp,
        author: entry.source,
      };
    }

    // ─── Pipeline / Lead Engineer ─────────────────────────────────
    case 'lead-engineer:feature-processed': {
      const featureTitle =
        (payload.featureTitle as string) ?? entry.correlationIds.featureId ?? 'Feature';
      const state = payload.state as string | undefined;
      return {
        id: entry.id,
        type: 'feature:done',
        title: `Processed: ${featureTitle}`,
        description: state ? `State: ${state}` : undefined,
        occurredAt: entry.timestamp,
        author: 'Lead Engineer',
      };
    }

    case 'pipeline:state-entered': {
      const fromState = payload.fromState as string | undefined;
      const toState = payload.toState as string | undefined;
      return {
        id: entry.id,
        type: 'decision',
        title: `Pipeline: ${fromState ?? '?'} → ${toState ?? '?'}`,
        description: entry.correlationIds.featureId
          ? `Feature: ${entry.correlationIds.featureId}`
          : undefined,
        occurredAt: entry.timestamp,
        author: 'Pipeline',
      };
    }

    // ─── Project lifecycle ────────────────────────────────────────
    case 'project:lifecycle:initiated': {
      const title = (payload.title as string) ?? entry.correlationIds.projectSlug ?? 'Project';
      return {
        id: entry.id,
        type: 'project:initiated',
        title: `Project created: ${title}`,
        description: payload.goal as string | undefined,
        occurredAt: entry.timestamp,
        author: (payload.initiatedBy as string) ?? entry.source,
      };
    }

    case 'project:lifecycle:prd-approved': {
      const title = (payload.title as string) ?? entry.correlationIds.projectSlug ?? 'Project';
      return {
        id: entry.id,
        type: 'project:prd-approved',
        title: `PRD approved: ${title}`,
        description: payload.approvedBy ? `Approved by ${payload.approvedBy}` : undefined,
        occurredAt: entry.timestamp,
        author: (payload.approvedBy as string) ?? entry.source,
      };
    }

    case 'project:scaffolded': {
      const slug = entry.correlationIds.projectSlug ?? 'Project';
      const featureCount = payload.featureCount as number | undefined;
      return {
        id: entry.id,
        type: 'project:scaffolded',
        title: `Project scaffolded: ${slug}`,
        description: featureCount
          ? `${featureCount} features created`
          : 'Milestones and features created',
        occurredAt: entry.timestamp,
        author: entry.source,
      };
    }

    case 'project:lifecycle:launched': {
      const title = (payload.title as string) ?? entry.correlationIds.projectSlug ?? 'Project';
      return {
        id: entry.id,
        type: 'project:launched',
        title: `Project launched: ${title}`,
        occurredAt: entry.timestamp,
        author: entry.source,
      };
    }

    case 'project:completed': {
      const title = (payload.title as string) ?? entry.correlationIds.projectSlug ?? 'Project';
      return {
        id: entry.id,
        type: 'project:completed',
        title: `Project completed: ${title}`,
        occurredAt: entry.timestamp,
        author: entry.source,
      };
    }

    // ─── Milestones & ceremonies ──────────────────────────────────
    case 'milestone:completed': {
      const milestoneTitle =
        (payload.title as string) ?? entry.correlationIds.milestoneSlug ?? 'Milestone';
      return {
        id: entry.id,
        type: 'milestone:completed',
        title: `Milestone completed: ${milestoneTitle}`,
        occurredAt: entry.timestamp,
        author: entry.source,
      };
    }

    case 'ceremony:fired': {
      const ceremonyType =
        (payload.ceremonyType as string) ?? (payload.type as string) ?? 'ceremony';

      // Human-readable labels for known ceremony types
      const CEREMONY_LABELS: Record<string, string> = {
        standup: 'Standup',
        milestone_retro: 'Milestone Retro',
        project_retro: 'Project Retro',
        epic_delivery: 'Epic Delivery',
        epic_kickoff: 'Epic Kickoff',
        content_brief: 'Content Brief',
        post_project_docs: 'Post-Project Docs',
      };
      const ceremonyLabel = CEREMONY_LABELS[ceremonyType] ?? ceremonyType;

      // Map to more specific types for filtering
      let type: string = 'ceremony:fired';
      if (ceremonyType === 'standup') type = 'standup';
      else if (
        ceremonyType === 'retro' ||
        ceremonyType === 'milestone_retro' ||
        ceremonyType === 'project_retro'
      )
        type = 'retro';

      // Extract artifact URL from payload if present (ceremony report)
      const artifactUrl =
        (payload.artifactUrl as string | undefined) ??
        (payload.reportUrl as string | undefined) ??
        (payload.reportPath as string | undefined) ??
        undefined;

      return {
        id: entry.id,
        type,
        title: `Ceremony: ${ceremonyLabel}`,
        ceremonyLabel,
        description: entry.correlationIds.milestoneSlug
          ? `Milestone: ${entry.correlationIds.milestoneSlug}`
          : undefined,
        occurredAt: entry.timestamp,
        author: entry.source,
        ...(artifactUrl !== undefined ? { artifactUrl } : {}),
      };
    }

    // ─── Escalations ──────────────────────────────────────────────
    case 'escalation:signal-received': {
      const signal = (payload.type as string) ?? 'escalation';
      const reason = (payload.reason as string) ?? (payload.message as string);
      return {
        id: entry.id,
        type: 'escalation',
        title: `Escalation: ${signal}`,
        description: reason,
        occurredAt: entry.timestamp,
        author: (payload.source as string) ?? entry.source,
      };
    }

    // ─── Auto-mode feature events ─────────────────────────────────
    case 'auto-mode:event': {
      const subType = (payload.type as string) ?? 'event';
      const featureTitle =
        (payload.featureTitle as string) ?? (payload.featureId as string) ?? 'Feature';
      return {
        id: entry.id,
        type: subType === 'feature_error' ? 'escalation' : 'feature:done',
        title: `Auto-mode: ${subType.replace(/_/g, ' ')} — ${featureTitle}`,
        occurredAt: entry.timestamp,
        author: 'Auto-mode',
      };
    }

    // ─── Catch-all ────────────────────────────────────────────────
    default: {
      return {
        id: entry.id,
        type: entry.eventType,
        title: entry.eventType.replace(/[:.]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        description: JSON.stringify(payload).slice(0, 200),
        occurredAt: entry.timestamp,
        author: entry.source,
      };
    }
  }
}

/**
 * Synthesise TimelineEvent objects directly from a feature's metadata fields.
 * Used as a fallback when the event ledger has no entries for a project.
 *
 * Emits one event per meaningful lifecycle timestamp present on the feature:
 *   createdAt       → feature:created
 *   startedAt       → feature:started
 *   reviewStartedAt → pr:merged   (entered review / PR open phase)
 *   completedAt     → feature:done
 */
function featureToTimelineEvents(feature: Feature): TimelineEvent[] {
  const title = feature.title ?? feature.id;
  const events: TimelineEvent[] = [];

  if (feature.createdAt) {
    events.push({
      id: `${feature.id}:created`,
      type: 'feature:created',
      title: `Created: ${title}`,
      occurredAt: feature.createdAt,
      author: 'system',
    });
  }

  if (feature.startedAt) {
    events.push({
      id: `${feature.id}:started`,
      type: 'feature:started',
      title: `Started: ${title}`,
      occurredAt: feature.startedAt,
      author: 'system',
    });
  }

  if (feature.reviewStartedAt) {
    events.push({
      id: `${feature.id}:review`,
      type: 'pr:merged',
      title: `In review: ${title}`,
      occurredAt: feature.reviewStartedAt,
      author: 'system',
    });
  }

  if (feature.completedAt) {
    events.push({
      id: `${feature.id}:done`,
      type: 'feature:done',
      title: `Completed: ${title}`,
      description: feature.prNumber ? `PR #${feature.prNumber}` : undefined,
      occurredAt: feature.completedAt,
      author: 'system',
    });
  }

  return events;
}

export function createTimelineHandler(
  eventLedger: EventLedgerService,
  featureLoader?: FeatureLoader
) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { slug } = req.params as { slug: string };

      if (!slug) {
        res.status(400).json({ success: false, error: 'Project slug is required' });
        return;
      }

      const projectPath = req.query.projectPath as string | undefined;
      const since = req.query.since as string | undefined;
      const type = req.query.type as string | undefined;

      if (since !== undefined && isNaN(new Date(since).getTime())) {
        res.status(400).json({ success: false, error: 'Invalid "since" timestamp' });
        return;
      }

      const entries = await eventLedger.queryByProject(slug, { since, type });

      // Transform raw ledger entries to display-ready timeline events
      let events = entries.map(toTimelineEvent);

      // ── Feature-metadata fallback ──────────────────────────────────────────
      // When the ledger has no entries for this project (e.g. before enrichment
      // starts, or for projects that pre-date the ledger), synthesise events
      // from feature metadata so the timeline is never completely empty.
      if (events.length === 0 && featureLoader && projectPath) {
        const features = await featureLoader.getAll(projectPath);

        if (features.length > 0) {
          const sinceMs = since ? new Date(since).getTime() : undefined;

          const fallbackEvents = features.flatMap(featureToTimelineEvents).filter((e) => {
            // Apply the same `since` filter used by the ledger query
            if (sinceMs !== undefined) {
              return new Date(e.occurredAt).getTime() > sinceMs;
            }
            return true;
          });

          // Apply type filter when requested
          events = type ? fallbackEvents.filter((e) => e.type === type) : fallbackEvents;
        }
      }

      // Sort newest first for the UI feed
      events.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

      res.json({ success: true, events });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  };
}
