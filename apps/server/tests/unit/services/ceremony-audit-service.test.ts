/**
 * CeremonyAuditLogService Unit Tests
 *
 * Tests for the JSONL-backed ceremony audit log:
 * - Recording entries to disk
 * - Updating delivery status
 * - Querying recent entries and filtering
 * - Delivery summary stats
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CeremonyAuditLogService } from '../../../src/services/ceremony-audit-service.js';
import type { CeremonyAuditEntry } from '@protolabs-ai/types';
import fs from 'fs';
import path from 'path';
import os from 'os';

vi.mock('@protolabs-ai/utils', async () => {
  const actual = await vi.importActual('@protolabs-ai/utils');
  return {
    ...actual,
    createLogger: vi.fn(() => ({
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  };
});

function createTestEntry(overrides: Partial<CeremonyAuditEntry> = {}): CeremonyAuditEntry {
  return {
    id: `entry-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    timestamp: new Date().toISOString(),
    ceremonyType: 'standup',
    projectPath: '/tmp/test-project',
    deliveryStatus: 'pending',
    payload: { title: 'Test Ceremony' },
    ...overrides,
  };
}

describe('CeremonyAuditLogService', () => {
  let service: CeremonyAuditLogService;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ceremony-audit-'));
    service = new CeremonyAuditLogService();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('record()', () => {
    it('should write an entry to the JSONL log file', () => {
      const entry = createTestEntry({ projectPath: tmpDir });
      service.record(entry);

      const logPath = path.join(tmpDir, '.automaker', 'ceremony-log.jsonl');
      expect(fs.existsSync(logPath)).toBe(true);

      const content = fs.readFileSync(logPath, 'utf-8');
      const parsed = JSON.parse(content.trim());
      expect(parsed.id).toBe(entry.id);
      expect(parsed.ceremonyType).toBe('standup');
    });

    it('should create .automaker directory if it does not exist', () => {
      const entry = createTestEntry({ projectPath: tmpDir });
      service.record(entry);

      expect(fs.existsSync(path.join(tmpDir, '.automaker'))).toBe(true);
    });

    it('should append multiple entries', () => {
      const e1 = createTestEntry({ projectPath: tmpDir, id: 'entry-1' });
      const e2 = createTestEntry({ projectPath: tmpDir, id: 'entry-2' });

      service.record(e1);
      service.record(e2);

      const logPath = path.join(tmpDir, '.automaker', 'ceremony-log.jsonl');
      const lines = fs.readFileSync(logPath, 'utf-8').split('\n').filter(Boolean);
      expect(lines).toHaveLength(2);
    });
  });

  describe('getRecentEntries()', () => {
    it('should return entries in reverse chronological order', () => {
      const e1 = createTestEntry({ projectPath: tmpDir, id: 'first' });
      const e2 = createTestEntry({ projectPath: tmpDir, id: 'second' });

      service.record(e1);
      service.record(e2);

      const entries = service.getRecentEntries(tmpDir);
      expect(entries).toHaveLength(2);
      expect(entries[0].id).toBe('second');
      expect(entries[1].id).toBe('first');
    });

    it('should respect the limit parameter', () => {
      for (let i = 0; i < 10; i++) {
        service.record(createTestEntry({ projectPath: tmpDir, id: `entry-${i}` }));
      }

      const entries = service.getRecentEntries(tmpDir, 3);
      expect(entries).toHaveLength(3);
    });

    it('should return empty array when no log file exists', () => {
      const entries = service.getRecentEntries('/nonexistent/path');
      expect(entries).toEqual([]);
    });
  });

  describe('getEntriesByType()', () => {
    it('should filter entries by ceremony type', () => {
      service.record(createTestEntry({ projectPath: tmpDir, ceremonyType: 'standup' }));
      service.record(createTestEntry({ projectPath: tmpDir, ceremonyType: 'milestone_retro' }));
      service.record(createTestEntry({ projectPath: tmpDir, ceremonyType: 'standup' }));

      const standups = service.getEntriesByType(tmpDir, 'standup');
      expect(standups).toHaveLength(2);
      expect(standups.every((e) => e.ceremonyType === 'standup')).toBe(true);
    });
  });

  describe('updateDeliveryStatus()', () => {
    it('should update delivery status for a recorded entry', () => {
      const entry = createTestEntry({ projectPath: tmpDir, id: 'update-test' });
      service.record(entry);
      service.updateDeliveryStatus('update-test', 'delivered', 'msg-123');

      const entries = service.getRecentEntries(tmpDir);
      expect(entries[0].deliveryStatus).toBe('delivered');
      expect(entries[0].discordMessageId).toBe('msg-123');
    });

    it('should update delivery status with error message', () => {
      const entry = createTestEntry({ projectPath: tmpDir, id: 'fail-test' });
      service.record(entry);
      service.updateDeliveryStatus('fail-test', 'failed', undefined, 'Bot token invalid');

      const entries = service.getRecentEntries(tmpDir);
      expect(entries[0].deliveryStatus).toBe('failed');
      expect(entries[0].errorMessage).toBe('Bot token invalid');
    });

    it('should silently skip unknown entry ids', () => {
      // No entries recorded — should not throw
      service.updateDeliveryStatus('nonexistent', 'delivered');
    });
  });

  describe('getDeliverySummary()', () => {
    it('should return correct summary stats', () => {
      service.record(
        createTestEntry({ projectPath: tmpDir, deliveryStatus: 'delivered', id: 'a' })
      );
      service.record(
        createTestEntry({ projectPath: tmpDir, deliveryStatus: 'delivered', id: 'b' })
      );
      service.record(createTestEntry({ projectPath: tmpDir, deliveryStatus: 'failed', id: 'c' }));
      service.record(createTestEntry({ projectPath: tmpDir, deliveryStatus: 'skipped', id: 'd' }));
      service.record(createTestEntry({ projectPath: tmpDir, deliveryStatus: 'pending', id: 'e' }));

      const summary = service.getDeliverySummary(tmpDir);
      expect(summary.total).toBe(5);
      expect(summary.delivered).toBe(2);
      expect(summary.failed).toBe(1);
      expect(summary.skipped).toBe(1);
      expect(summary.pending).toBe(1);
      expect(summary.lastFiredAt).toBeTruthy();
    });

    it('should return zero counts when no entries exist', () => {
      const summary = service.getDeliverySummary('/nonexistent/path');
      expect(summary.total).toBe(0);
      expect(summary.lastFiredAt).toBeNull();
    });
  });
});
