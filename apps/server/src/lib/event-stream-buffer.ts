/**
 * Event Stream Ring Buffer
 *
 * In-memory ring buffer for engine events. Provides server-side persistence
 * beyond the UI's 200-event WebSocket buffer, enabling scroll-back and
 * filtered history queries.
 */

export interface BufferedEvent {
  type: string;
  service: string;
  timestamp: number;
  featureId?: string;
  preview: string;
  payload?: Record<string, unknown>;
}

export interface EventHistoryFilter {
  type?: string;
  service?: string;
  featureId?: string;
  since?: number;
  until?: number;
  limit?: number;
}

const SERVICE_PREFIXES: Record<string, string> = {
  'feature:': 'features',
  'agent:': 'agents',
  'auto-mode:': 'auto-mode',
  'pr:': 'pr-feedback',
  'github:': 'github',
  'linear:': 'linear',
  'discord:': 'discord',
  'signal:': 'signal-intake',
  'project:': 'projects',
  'lead-engineer:': 'lead-engineer',
  'content:': 'content',
};

function classifyService(eventType: string): string {
  for (const [prefix, service] of Object.entries(SERVICE_PREFIXES)) {
    if (eventType.startsWith(prefix)) return service;
  }
  return 'system';
}

function extractPreview(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const p = payload as Record<string, unknown>;
  const parts: string[] = [];
  if (p.featureId) parts.push(`feature:${String(p.featureId).slice(0, 8)}`);
  if (p.featureTitle) parts.push(String(p.featureTitle).slice(0, 30));
  if (p.prNumber) parts.push(`PR#${p.prNumber}`);
  if (p.status) parts.push(String(p.status));
  if (p.error) parts.push(String(p.error).slice(0, 40));
  return parts.join(' | ') || '';
}

export class EventStreamBuffer {
  private buffer: BufferedEvent[] = [];
  private readonly maxSize: number;

  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
  }

  /**
   * Push a new event into the buffer.
   */
  push(type: string, payload: unknown): void {
    const p = payload as Record<string, unknown> | null;

    const event: BufferedEvent = {
      type,
      service: classifyService(type),
      timestamp: Date.now(),
      featureId: (p?.featureId as string) || undefined,
      preview: extractPreview(payload),
    };

    this.buffer.push(event);

    // Ring buffer: trim from the front when over capacity
    if (this.buffer.length > this.maxSize) {
      this.buffer = this.buffer.slice(this.buffer.length - this.maxSize);
    }
  }

  /**
   * Query events with optional filters. Returns newest-first.
   */
  query(filter: EventHistoryFilter = {}): { events: BufferedEvent[]; total: number } {
    let results = this.buffer;

    if (filter.type) {
      results = results.filter((e) => e.type === filter.type);
    }
    if (filter.service) {
      results = results.filter((e) => e.service === filter.service);
    }
    if (filter.featureId) {
      results = results.filter((e) => e.featureId === filter.featureId);
    }
    if (filter.since) {
      results = results.filter((e) => e.timestamp >= filter.since!);
    }
    if (filter.until) {
      results = results.filter((e) => e.timestamp <= filter.until!);
    }

    const total = results.length;

    // Newest first
    results = [...results].reverse();

    if (filter.limit && filter.limit > 0) {
      results = results.slice(0, filter.limit);
    }

    return { events: results, total };
  }

  /**
   * Get total number of buffered events.
   */
  get size(): number {
    return this.buffer.length;
  }
}
