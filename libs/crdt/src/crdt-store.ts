/**
 * CRDTStore - Automerge-backed document store
 *
 * Manages Automerge documents by domain key.
 * Handles in-memory document state, change application, subscriptions,
 * and binary persistence to/from the filesystem layer.
 */

import * as Automerge from '@automerge/automerge';

type ChangeCallback<T> = (doc: Automerge.Doc<T>) => void;

interface DocEntry<T> {
  doc: Automerge.Doc<T>;
  callbacks: Set<ChangeCallback<T>>;
}

export class CRDTStore {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private docs = new Map<string, DocEntry<any>>();

  /**
   * Get or create an Automerge document for the given key.
   * If no document exists, initializes one using the provided factory.
   */
  getOrCreate<T>(key: string, init: () => T): Automerge.Doc<T> {
    const entry = this.docs.get(key);
    // Entry may exist from a subscribe() call before the doc was created
    if (entry?.doc) {
      return entry.doc as Automerge.Doc<T>;
    }
    // Automerge.from<T> requires T extends Record<string, unknown>.
    // We cast through any to avoid the constraint — callers must pass object types.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const doc = Automerge.from(init() as any) as Automerge.Doc<T>;
    if (entry) {
      // Preserve existing callbacks from subscribe() calls
      entry.doc = doc;
    } else {
      this.docs.set(key, { doc, callbacks: new Set() });
    }
    return doc;
  }

  /**
   * Get an existing document, or null if it doesn't exist.
   */
  get<T>(key: string): Automerge.Doc<T> | null {
    const entry = this.docs.get(key);
    return entry ? (entry.doc as Automerge.Doc<T>) : null;
  }

  /**
   * Apply a mutation to a document, notifying all subscribers.
   * Creates the document if it doesn't exist using the provided factory.
   */
  change<T>(key: string, init: () => T, fn: Automerge.ChangeFn<T>): Automerge.Doc<T> {
    const existing = this.getOrCreate<T>(key, init);
    const updated = Automerge.change(existing, fn);
    const entry = this.docs.get(key)!;
    entry.doc = updated;
    this.notify(key, updated);
    return updated;
  }

  /**
   * Subscribe to changes on a document.
   * Returns an unsubscribe function.
   */
  subscribe<T>(key: string, callback: ChangeCallback<T>): () => void {
    let entry = this.docs.get(key);
    if (!entry) {
      // Create an entry without a doc so we can track subscriptions
      entry = { doc: null as unknown as Automerge.Doc<T>, callbacks: new Set() };
      this.docs.set(key, entry);
    }
    entry.callbacks.add(callback as ChangeCallback<unknown>);
    return () => {
      entry!.callbacks.delete(callback as ChangeCallback<unknown>);
    };
  }

  /**
   * Load a document from Automerge binary data, replacing any existing in-memory state.
   * Notifies subscribers after loading.
   */
  load<T>(key: string, data: Uint8Array): Automerge.Doc<T> {
    const doc = Automerge.load<T>(data);
    const existing = this.docs.get(key);
    const callbacks = existing?.callbacks ?? new Set();
    this.docs.set(key, { doc, callbacks });
    this.notify(key, doc);
    return doc;
  }

  /**
   * Serialize a document to Automerge binary format for persistence.
   * Returns null if the document doesn't exist.
   */
  save(key: string): Uint8Array | null {
    const entry = this.docs.get(key);
    if (!entry?.doc) return null;
    return Automerge.save(entry.doc);
  }

  /**
   * Apply Automerge sync changes received from a remote peer.
   * Notifies subscribers if the document changed.
   */
  applyChanges<T>(key: string, changes: Uint8Array[]): Automerge.Doc<T> | null {
    const entry = this.docs.get(key);
    if (!entry?.doc) return null;
    const [updated] = Automerge.applyChanges<T>(entry.doc as Automerge.Doc<T>, changes);
    entry.doc = updated;
    this.notify(key, updated);
    return updated;
  }

  /**
   * Check if a document exists in the store.
   */
  has(key: string): boolean {
    const entry = this.docs.get(key);
    return !!entry?.doc;
  }

  /**
   * Remove a document from the store.
   */
  delete(key: string): void {
    this.docs.delete(key);
  }

  private notify<T>(key: string, doc: Automerge.Doc<T>): void {
    const entry = this.docs.get(key);
    if (!entry) return;
    for (const callback of entry.callbacks) {
      callback(doc);
    }
  }
}
