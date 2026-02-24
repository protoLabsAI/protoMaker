/**
 * CeremonyAuditLogService — Persistent, append-only audit log for ceremony events.
 *
 * Every ceremony fire is recorded to `.automaker/ceremony-log.jsonl` regardless
 * of whether Discord is configured. Discord delivery status is tracked via
 * correlationId round-trips through the integration:discord event bridge.
 */

import { createLogger } from '@protolabs-ai/utils';
import type { CeremonyAuditEntry, CeremonyDeliveryStatus } from '@protolabs-ai/types';
import fs from 'fs';
import path from 'path';

const logger = createLogger('CeremonyAuditLog');

export class CeremonyAuditLogService {
  /** In-memory index of recent entries keyed by id for fast delivery status updates */
  private entryIndex = new Map<string, { projectPath: string; line: number }>();

  /**
   * Record a new ceremony event to the audit log.
   */
  record(entry: CeremonyAuditEntry): void {
    try {
      const logPath = this.getLogPath(entry.projectPath);
      const dir = path.dirname(logPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const line = JSON.stringify(entry) + '\n';
      fs.appendFileSync(logPath, line, 'utf-8');

      // Track in memory for fast delivery updates
      this.entryIndex.set(entry.id, {
        projectPath: entry.projectPath,
        line: this.countLines(logPath) - 1,
      });

      logger.debug(`Recorded ceremony ${entry.ceremonyType} (${entry.id})`);
    } catch (error) {
      logger.error(`Failed to record ceremony audit entry:`, error);
    }
  }

  /**
   * Update delivery status for a ceremony entry (called after Discord delivery resolves).
   */
  updateDeliveryStatus(
    id: string,
    status: CeremonyDeliveryStatus,
    messageId?: string,
    error?: string
  ): void {
    const meta = this.entryIndex.get(id);
    if (!meta) {
      logger.debug(`No audit entry found for correlationId ${id}, skipping delivery update`);
      return;
    }

    try {
      const logPath = this.getLogPath(meta.projectPath);
      const lines = fs.readFileSync(logPath, 'utf-8').split('\n').filter(Boolean);

      // Find the entry by id (search from the end for efficiency)
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const entry = JSON.parse(lines[i]) as CeremonyAuditEntry;
          if (entry.id === id) {
            entry.deliveryStatus = status;
            if (messageId) entry.discordMessageId = messageId;
            if (error) entry.errorMessage = error;
            lines[i] = JSON.stringify(entry);
            break;
          }
        } catch {
          // Skip malformed lines
        }
      }

      fs.writeFileSync(logPath, lines.join('\n') + '\n', 'utf-8');
      this.entryIndex.delete(id);
      logger.debug(`Updated delivery status for ${id}: ${status}`);
    } catch (err) {
      logger.error(`Failed to update delivery status for ${id}:`, err);
    }
  }

  /**
   * Get recent audit log entries for a project.
   */
  getRecentEntries(projectPath: string, limit = 50): CeremonyAuditEntry[] {
    try {
      const logPath = this.getLogPath(projectPath);
      if (!fs.existsSync(logPath)) return [];

      const lines = fs.readFileSync(logPath, 'utf-8').split('\n').filter(Boolean);
      const entries: CeremonyAuditEntry[] = [];

      // Read from the end for most recent first
      for (let i = lines.length - 1; i >= 0 && entries.length < limit; i--) {
        try {
          entries.push(JSON.parse(lines[i]) as CeremonyAuditEntry);
        } catch {
          // Skip malformed lines
        }
      }

      return entries;
    } catch (error) {
      logger.error(`Failed to read ceremony audit log:`, error);
      return [];
    }
  }

  /**
   * Get audit entries filtered by ceremony type.
   */
  getEntriesByType(projectPath: string, ceremonyType: string, limit = 50): CeremonyAuditEntry[] {
    return this.getRecentEntries(projectPath, limit * 2)
      .filter((e) => e.ceremonyType === ceremonyType)
      .slice(0, limit);
  }

  /**
   * Get summary stats for the ceremony status endpoint.
   */
  getDeliverySummary(projectPath: string): {
    total: number;
    delivered: number;
    failed: number;
    skipped: number;
    pending: number;
    lastFiredAt: string | null;
  } {
    const entries = this.getRecentEntries(projectPath, 200);
    const summary = {
      total: 0,
      delivered: 0,
      failed: 0,
      skipped: 0,
      pending: 0,
      lastFiredAt: null as string | null,
    };

    for (const entry of entries) {
      summary.total++;
      summary[entry.deliveryStatus]++;
    }

    summary.lastFiredAt = entries[0]?.timestamp ?? null;
    return summary;
  }

  private getLogPath(projectPath: string): string {
    return path.join(projectPath, '.automaker', 'ceremony-log.jsonl');
  }

  private countLines(filePath: string): number {
    try {
      return fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean).length;
    } catch {
      return 0;
    }
  }
}
