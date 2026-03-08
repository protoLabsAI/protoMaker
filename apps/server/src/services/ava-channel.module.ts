// Ava Channel module — wires EventBus events to AvaChannelService for automated cross-instance posts.
// Posts are suppressed in single-instance mode (0 peers) to avoid noise when hivemind is not active.

import { createLogger } from '@protolabsai/utils';
import type { ServiceContainer } from '../server/services.js';

const logger = createLogger('AvaChannelModule');

/** Debounce window for batching rapid-fire feature:status-changed events (ms). */
const STATUS_DEBOUNCE_MS = 5_000;

interface PendingStatusChange {
  featureId: string;
  featureTitle?: string;
  newStatus?: string;
  oldStatus?: string;
}

export async function register(container: ServiceContainer): Promise<void> {
  const { events, avaChannelService, crdtSyncService } = container;

  /** Returns true when the hivemind has at least one connected peer. */
  function hasPeers(): boolean {
    const peers = crdtSyncService.getPeers();
    return peers.length > 0;
  }

  /** Post a system message, suppressing in single-instance mode. */
  async function post(content: string, source: 'system' | 'ava' = 'system'): Promise<void> {
    if (!hasPeers()) return;
    try {
      await avaChannelService.postMessage(content, source);
    } catch (err) {
      logger.error('[AvaChannel] Failed to post message:', err);
    }
  }

  // ── feature:status-changed ──────────────────────────────────────────────────
  // Batch rapid-fire status changes into a single post after the debounce window.

  const pendingStatusChanges = new Map<string, PendingStatusChange>();
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  function flushStatusChanges(): void {
    if (pendingStatusChanges.size === 0) return;
    const entries = [...pendingStatusChanges.values()];
    pendingStatusChanges.clear();
    debounceTimer = null;

    if (!hasPeers()) return;

    let content: string;
    if (entries.length === 1) {
      const e = entries[0];
      const title = e.featureTitle ?? e.featureId;
      content = `Feature status update: "${title}" → ${e.newStatus ?? 'unknown'}${e.oldStatus ? ` (was ${e.oldStatus})` : ''}`;
    } else {
      const lines = entries.map((e) => {
        const title = e.featureTitle ?? e.featureId;
        return `  • "${title}" → ${e.newStatus ?? 'unknown'}`;
      });
      content = `${entries.length} feature status updates:\n${lines.join('\n')}`;
    }

    post(content, 'system').catch(() => {
      // already logged inside post()
    });
  }

  events.on('feature:status-changed', (payload) => {
    const { featureId, featureTitle, newStatus, oldStatus } = payload as {
      featureId: string;
      featureTitle?: string;
      newStatus?: string;
      oldStatus?: string;
    };

    // Only narrate meaningful terminal/notable statuses.
    const notableStatuses = new Set(['in_progress', 'review', 'done', 'blocked']);
    if (newStatus && !notableStatuses.has(newStatus)) return;

    pendingStatusChanges.set(featureId, { featureId, featureTitle, newStatus, oldStatus });

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(flushStatusChanges, STATUS_DEBOUNCE_MS);
  });

  // ── feature:error (agent failure / escalation) ───────────────────────────────

  events.on('feature:error', (payload) => {
    const { featureId, featureTitle, error } = payload as {
      featureId: string;
      featureTitle?: string;
      error?: string;
    };
    const title = featureTitle ?? featureId;
    const diagnosis = error ? ` Diagnosis: ${error}` : '';
    post(`Agent failure on "${title}".${diagnosis}`, 'system').catch(() => {});
  });

  // ── auto-mode:started / auto-mode:stopped ───────────────────────────────────

  events.on('auto-mode:started', (payload) => {
    const { projectPath } = payload as { projectPath?: string };
    const project = projectPath ? ` for ${projectPath}` : '';
    post(`Auto-mode started${project} — instance is now accepting work.`, 'system').catch(() => {});
  });

  events.on('auto-mode:stopped', (payload) => {
    const { projectPath, reason } = payload as { projectPath?: string; reason?: string };
    const project = projectPath ? ` for ${projectPath}` : '';
    const why = reason ? ` Reason: ${reason}.` : '';
    post(`Auto-mode stopped${project}.${why} Instance capacity reduced.`, 'system').catch(() => {});
  });

  // ── milestone:completed ──────────────────────────────────────────────────────

  events.on('milestone:completed', (payload) => {
    const { milestone, projectPath } = payload as { milestone?: string; projectPath?: string };
    const name = milestone ? `"${milestone}"` : 'Milestone';
    const project = projectPath ? ` in ${projectPath}` : '';
    post(`${name} completed${project}. Cascade check in progress.`, 'ava').catch(() => {});
  });

  // ── project:completed ────────────────────────────────────────────────────────

  events.on('project:completed', (payload) => {
    const { project, projectPath } = payload as { project?: string; projectPath?: string };
    const name = project ? `"${project}"` : 'Project';
    const path = projectPath ? ` (${projectPath})` : '';
    post(`${name}${path} is complete. All milestones and epics delivered.`, 'ava').catch(() => {});
  });

  // ── sync:peer-unreachable ────────────────────────────────────────────────────

  events.on('sync:peer-unreachable', (payload) => {
    const { instanceId, instanceName } = payload as {
      instanceId?: string;
      instanceName?: string;
    };
    const peer = instanceName ?? instanceId ?? 'unknown peer';
    post(
      `Connectivity alert: instance "${peer}" is unreachable. Hivemind partition may be in effect.`,
      'system'
    ).catch(() => {});
  });

  // ── sync:partition-recovered ─────────────────────────────────────────────────

  events.on('sync:partition-recovered', (payload) => {
    const { instanceId, instanceName } = payload as {
      instanceId?: string;
      instanceName?: string;
    };
    const peer = instanceName ?? instanceId ?? 'unknown peer';
    post(`Connectivity restored: partition with "${peer}" has recovered.`, 'system').catch(
      () => {}
    );
  });

  logger.info('[AvaChannel] Module registered — EventBus wired to Ava Channel');
}
