/**
 * In-memory trace store.
 *
 * Stores the most recent MAX_TRACES traces in a ring-buffer-style array.
 * Traces are prepended so the list is always newest-first.
 *
 * This is intentionally simple — suitable for local development debugging.
 * For production use, replace with a persistent backend (SQLite, Postgres, etc.).
 */

import type { Trace } from './types.js';

const MAX_TRACES = 100;

class TraceStore {
  private readonly traces: Trace[] = [];

  /** Add a completed trace. Oldest traces are evicted once MAX_TRACES is reached. */
  add(trace: Trace): void {
    this.traces.unshift(trace);
    if (this.traces.length > MAX_TRACES) {
      this.traces.splice(MAX_TRACES);
    }
  }

  /** Return a copy of all stored traces (newest first). */
  list(): Trace[] {
    return [...this.traces];
  }

  /** Look up a single trace by ID. Returns undefined if not found. */
  get(id: string): Trace | undefined {
    return this.traces.find((t) => t.id === id);
  }

  /** Clear all traces (useful for tests). */
  clear(): void {
    this.traces.splice(0);
  }
}

/** Singleton trace store shared by the chat route and the traces API route. */
export const traceStore = new TraceStore();
