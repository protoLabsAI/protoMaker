/**
 * Integration tests for GET /api/projects/:slug/timeline
 *
 * Verifies that:
 * 1. All EventLedger events with matching projectSlug are returned
 * 2. ?since= filters events correctly (exclusive)
 * 3. ?type= filters events by eventType
 * 4. Events are returned in chronological order
 *
 * Uses seeded JSONL data written to a temporary directory.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { Request, Response } from 'express';

import { EventLedgerService } from '@/services/event-ledger-service.js';
import { createTimelineHandler } from '@/routes/projects/routes/timeline.js';
import type { EventLedgerEntry } from '@protolabsai/types';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const PROJECT_SLUG = 'test-project';
const OTHER_SLUG = 'other-project';

const T1 = '2026-01-01T10:00:00.000Z';
const T2 = '2026-01-01T11:00:00.000Z';
const T3 = '2026-01-01T12:00:00.000Z';
const T4 = '2026-01-01T13:00:00.000Z';

function makeEntry(
  id: string,
  timestamp: string,
  eventType: string,
  projectSlug: string,
  payload: object = {}
): EventLedgerEntry {
  return {
    id,
    timestamp,
    eventType,
    correlationIds: { projectSlug },
    payload,
    source: 'test',
  };
}

/** Seed a ledger JSONL file with the given entries */
async function seedLedger(dataDir: string, entries: EventLedgerEntry[]): Promise<void> {
  const ledgerDir = path.join(dataDir, 'ledger');
  await fs.mkdir(ledgerDir, { recursive: true });
  const ledgerPath = path.join(ledgerDir, 'events.jsonl');
  const lines = entries.map((e) => JSON.stringify(e)).join('\n') + '\n';
  await fs.writeFile(ledgerPath, lines, 'utf-8');
}

/** Create a minimal mock Express response */
function mockRes() {
  const res = {
    _status: 200,
    _body: null as unknown,
    json(body: unknown) {
      this._body = body;
      return this;
    },
    status(code: number) {
      this._status = code;
      return this;
    },
  };
  return res as unknown as Response & { _status: number; _body: unknown };
}

/** Create a minimal mock Express request for GET /:slug/timeline */
function mockReq(slug: string, query: Record<string, string> = {}): Request {
  return {
    params: { slug },
    query,
  } as unknown as Request;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/projects/:slug/timeline (integration)', () => {
  let dataDir: string;
  let service: EventLedgerService;
  let handler: (req: Request, res: Response) => Promise<void>;

  // Seeded entries for the target project (in non-chronological insert order)
  const entries: EventLedgerEntry[] = [
    makeEntry('evt-003', T3, 'milestone:completed', PROJECT_SLUG, { milestone: 'm1' }),
    makeEntry('evt-001', T1, 'project:lifecycle:launched', PROJECT_SLUG, { phase: 'alpha' }),
    makeEntry('evt-004', T4, 'project:completed', PROJECT_SLUG),
    makeEntry('evt-002', T2, 'feature:started', PROJECT_SLUG, { featureId: 'f-001' }),
    // Different project — must be excluded
    makeEntry('other-001', T1, 'project:lifecycle:launched', OTHER_SLUG),
  ];

  beforeEach(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'timeline-test-'));
    await seedLedger(dataDir, entries);

    service = new EventLedgerService(dataDir);
    handler = createTimelineHandler(service);
  });

  afterEach(async () => {
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  // ─── Basic query ──────────────────────────────────────────────────────────

  it('returns all events for the project in chronological order', async () => {
    const req = mockReq(PROJECT_SLUG);
    const res = mockRes();

    await handler(req, res as unknown as Response);

    expect(res._status).toBe(200);
    const body = res._body as { success: boolean; events: EventLedgerEntry[] };
    expect(body.success).toBe(true);

    const { events } = body;
    expect(events).toHaveLength(4);

    // Must be sorted ascending by timestamp
    expect(events[0].id).toBe('evt-001');
    expect(events[1].id).toBe('evt-002');
    expect(events[2].id).toBe('evt-003');
    expect(events[3].id).toBe('evt-004');

    // Must include type, timestamp, correlationIds, payload on each event
    for (const event of events) {
      expect(event).toHaveProperty('eventType');
      expect(event).toHaveProperty('timestamp');
      expect(event).toHaveProperty('correlationIds');
      expect(event).toHaveProperty('payload');
    }
  });

  it('excludes events from other projects', async () => {
    const req = mockReq(PROJECT_SLUG);
    const res = mockRes();

    await handler(req, res as unknown as Response);

    const body = res._body as { events: EventLedgerEntry[] };
    const slugs = body.events.map((e) => e.correlationIds.projectSlug);
    expect(slugs.every((s) => s === PROJECT_SLUG)).toBe(true);
    expect(slugs).not.toContain(OTHER_SLUG);
  });

  // ─── ?since= filter ───────────────────────────────────────────────────────

  it('filters events after ?since= (exclusive)', async () => {
    // since=T2 should return T3 and T4 only
    const req = mockReq(PROJECT_SLUG, { since: T2 });
    const res = mockRes();

    await handler(req, res as unknown as Response);

    const body = res._body as { success: boolean; events: EventLedgerEntry[] };
    expect(body.success).toBe(true);

    const ids = body.events.map((e) => e.id);
    expect(ids).toContain('evt-003');
    expect(ids).toContain('evt-004');
    expect(ids).not.toContain('evt-001');
    expect(ids).not.toContain('evt-002'); // exactly at T2, excluded (exclusive boundary)
  });

  it('returns empty array when since is after all events', async () => {
    const req = mockReq(PROJECT_SLUG, { since: '2030-01-01T00:00:00.000Z' });
    const res = mockRes();

    await handler(req, res as unknown as Response);

    const body = res._body as { events: EventLedgerEntry[] };
    expect(body.events).toHaveLength(0);
  });

  it('returns 400 for an invalid since timestamp', async () => {
    const req = mockReq(PROJECT_SLUG, { since: 'not-a-date' });
    const res = mockRes();

    await handler(req, res as unknown as Response);

    expect(res._status).toBe(400);
    const body = res._body as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/since/i);
  });

  // ─── ?type= filter ────────────────────────────────────────────────────────

  it('filters events by ?type=', async () => {
    const req = mockReq(PROJECT_SLUG, { type: 'feature:started' });
    const res = mockRes();

    await handler(req, res as unknown as Response);

    const body = res._body as { success: boolean; events: EventLedgerEntry[] };
    expect(body.success).toBe(true);

    expect(body.events).toHaveLength(1);
    expect(body.events[0].id).toBe('evt-002');
    expect(body.events[0].eventType).toBe('feature:started');
  });

  it('returns empty array when type matches no events', async () => {
    const req = mockReq(PROJECT_SLUG, { type: 'nonexistent:event' });
    const res = mockRes();

    await handler(req, res as unknown as Response);

    const body = res._body as { events: EventLedgerEntry[] };
    expect(body.events).toHaveLength(0);
  });

  // ─── Combined filters ─────────────────────────────────────────────────────

  it('supports combining ?since= and ?type= filters', async () => {
    // since=T1, type=milestone:completed → should return evt-003 (T3) only
    const req = mockReq(PROJECT_SLUG, { since: T1, type: 'milestone:completed' });
    const res = mockRes();

    await handler(req, res as unknown as Response);

    const body = res._body as { success: boolean; events: EventLedgerEntry[] };
    expect(body.success).toBe(true);

    expect(body.events).toHaveLength(1);
    expect(body.events[0].id).toBe('evt-003');
  });

  // ─── Unknown project ──────────────────────────────────────────────────────

  it('returns empty events array for an unknown project slug', async () => {
    const req = mockReq('no-such-project');
    const res = mockRes();

    await handler(req, res as unknown as Response);

    const body = res._body as { success: boolean; events: EventLedgerEntry[] };
    expect(body.success).toBe(true);
    expect(body.events).toHaveLength(0);
  });

  // ─── Service method (unit-like) ───────────────────────────────────────────

  describe('EventLedgerService.queryByProject()', () => {
    it('returns entries in chronological order', async () => {
      const results = await service.queryByProject(PROJECT_SLUG);
      const timestamps = results.map((e) => e.timestamp);
      const sorted = [...timestamps].sort();
      expect(timestamps).toEqual(sorted);
    });

    it('filters by since (exclusive)', async () => {
      const results = await service.queryByProject(PROJECT_SLUG, { since: T2 });
      expect(results.every((e) => new Date(e.timestamp).getTime() > new Date(T2).getTime())).toBe(
        true
      );
    });

    it('filters by type', async () => {
      const results = await service.queryByProject(PROJECT_SLUG, { type: 'project:completed' });
      expect(results).toHaveLength(1);
      expect(results[0].eventType).toBe('project:completed');
    });

    it('excludes entries from other projects', async () => {
      const results = await service.queryByProject(PROJECT_SLUG);
      expect(results.every((e) => e.correlationIds.projectSlug === PROJECT_SLUG)).toBe(true);
    });
  });
});
