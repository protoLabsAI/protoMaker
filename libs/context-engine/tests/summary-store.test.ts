/**
 * Unit tests for SummaryStore.
 *
 * All tests use an in-memory SQLite database (':memory:') so they are
 * fast, isolated, and leave no files on disk.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SummaryNode } from '../src/types.js';
import { SummaryStore } from '../src/store/summary-store.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let store: SummaryStore;

function makeNode(
  overrides: Partial<{
    id: string;
    content: string;
    tokenCount: number;
    depth: number;
    createdAt: number;
    coveredMessageIds: string[];
    childSummaryIds: string[];
    parentId: string | null;
    condensed: boolean;
  }> = {}
): SummaryNode {
  return {
    summary: {
      id: overrides.id ?? 'node-1',
      content: overrides.content ?? 'A test summary',
      tokenCount: overrides.tokenCount ?? 100,
      depth: overrides.depth ?? 0,
      createdAt: overrides.createdAt ?? Date.now(),
      coveredMessageIds: overrides.coveredMessageIds ?? [],
      childSummaryIds: overrides.childSummaryIds ?? [],
    },
    parentId: overrides.parentId ?? null,
    condensed: overrides.condensed ?? false,
  };
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  store = new SummaryStore(':memory:');
});

afterEach(() => {
  store.close();
});

// ---------------------------------------------------------------------------
// Basic persistence
// ---------------------------------------------------------------------------

describe('saveSummaryNodeForSession / getSummaryNode', () => {
  it('saves and retrieves a node by id', () => {
    const node = makeNode({ id: 'n1', content: 'Hello world', tokenCount: 42 });
    store.saveSummaryNodeForSession('session-a', node);

    const retrieved = store.getSummaryNode('n1');
    expect(retrieved).toBeDefined();
    expect(retrieved!.summary.id).toBe('n1');
    expect(retrieved!.summary.content).toBe('Hello world');
    expect(retrieved!.summary.tokenCount).toBe(42);
    expect(retrieved!.condensed).toBe(false);
    expect(retrieved!.parentId).toBeNull();
  });

  it('returns undefined for a missing node', () => {
    expect(store.getSummaryNode('nonexistent')).toBeUndefined();
  });

  it('replaces an existing node on re-save (upsert)', () => {
    const node = makeNode({ id: 'n1', content: 'Original' });
    store.saveSummaryNodeForSession('session-a', node);

    const updated = makeNode({ id: 'n1', content: 'Updated' });
    store.saveSummaryNodeForSession('session-a', updated);

    const retrieved = store.getSummaryNode('n1');
    expect(retrieved!.summary.content).toBe('Updated');
  });
});

// ---------------------------------------------------------------------------
// Session scoping
// ---------------------------------------------------------------------------

describe('getAllSummaryNodes / getActiveSummaryNodes', () => {
  it('returns only nodes for the requested session', () => {
    store.saveSummaryNodeForSession('session-a', makeNode({ id: 'a1' }));
    store.saveSummaryNodeForSession('session-a', makeNode({ id: 'a2' }));
    store.saveSummaryNodeForSession('session-b', makeNode({ id: 'b1' }));

    const nodesA = store.getAllSummaryNodes('session-a');
    expect(nodesA).toHaveLength(2);
    expect(nodesA.map((n) => n.summary.id)).toContain('a1');
    expect(nodesA.map((n) => n.summary.id)).toContain('a2');

    const nodesB = store.getAllSummaryNodes('session-b');
    expect(nodesB).toHaveLength(1);
  });

  it('getActiveSummaryNodes excludes condensed nodes', () => {
    store.saveSummaryNodeForSession('session-a', makeNode({ id: 'n1' }));
    store.saveSummaryNodeForSession('session-a', makeNode({ id: 'n2' }));
    store.markCondensed('n1');

    const active = store.getActiveSummaryNodes('session-a');
    expect(active).toHaveLength(1);
    expect(active[0].summary.id).toBe('n2');
  });
});

// ---------------------------------------------------------------------------
// markCondensed
// ---------------------------------------------------------------------------

describe('markCondensed', () => {
  it('marks a node as condensed', () => {
    store.saveSummaryNodeForSession('session-a', makeNode({ id: 'n1' }));
    store.markCondensed('n1');

    const node = store.getSummaryNode('n1');
    expect(node!.condensed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Provenance links — coveredMessageIds
// ---------------------------------------------------------------------------

describe('coveredMessageIds (summary_sources)', () => {
  it('persists covered message ids and retrieves them', () => {
    const node = makeNode({
      id: 'n1',
      coveredMessageIds: ['msg-1', 'msg-2', 'msg-3'],
    });
    store.saveSummaryNodeForSession('session-a', node);

    const retrieved = store.getSummaryNode('n1');
    expect(retrieved!.summary.coveredMessageIds).toHaveLength(3);
    expect(retrieved!.summary.coveredMessageIds).toContain('msg-1');
    expect(retrieved!.summary.coveredMessageIds).toContain('msg-3');
  });

  it('replaces message ids on re-save', () => {
    store.saveSummaryNodeForSession(
      'session-a',
      makeNode({ id: 'n1', coveredMessageIds: ['msg-1', 'msg-2'] })
    );
    store.saveSummaryNodeForSession(
      'session-a',
      makeNode({ id: 'n1', coveredMessageIds: ['msg-3'] })
    );

    const retrieved = store.getSummaryNode('n1');
    expect(retrieved!.summary.coveredMessageIds).toHaveLength(1);
    expect(retrieved!.summary.coveredMessageIds[0]).toBe('msg-3');
  });
});

// ---------------------------------------------------------------------------
// Provenance links — childSummaryIds
// ---------------------------------------------------------------------------

describe('childSummaryIds (summary_parents)', () => {
  it('persists child summary ids and retrieves them', () => {
    const child1 = makeNode({ id: 'child-1', depth: 0 });
    const child2 = makeNode({ id: 'child-2', depth: 0 });
    const parent = makeNode({ id: 'parent-1', depth: 1, childSummaryIds: ['child-1', 'child-2'] });

    store.saveSummaryNodeForSession('session-a', child1);
    store.saveSummaryNodeForSession('session-a', child2);
    store.saveSummaryNodeForSession('session-a', parent);

    const retrieved = store.getSummaryNode('parent-1');
    expect(retrieved!.summary.childSummaryIds).toHaveLength(2);
    expect(retrieved!.summary.childSummaryIds).toContain('child-1');
    expect(retrieved!.summary.childSummaryIds).toContain('child-2');
  });
});

// ---------------------------------------------------------------------------
// DAG traversal — getAncestors
// ---------------------------------------------------------------------------

describe('getAncestors', () => {
  /**
   * Build a three-level chain:
   *   leaf → mid → root
   */
  function buildChain() {
    const root = makeNode({ id: 'root', depth: 2, parentId: null });
    const mid = makeNode({ id: 'mid', depth: 1, parentId: 'root', childSummaryIds: [] });
    const leaf = makeNode({ id: 'leaf', depth: 0, parentId: 'mid', childSummaryIds: [] });

    store.saveSummaryNodeForSession('session-a', root);
    store.saveSummaryNodeForSession('session-a', mid);
    store.saveSummaryNodeForSession('session-a', leaf);
  }

  it('returns ancestors in parent-first order (closest to start first)', () => {
    buildChain();
    const ancestors = store.getAncestors('leaf');
    expect(ancestors.map((n) => n.summary.id)).toEqual(['mid', 'root']);
  });

  it('returns empty array when node has no parent', () => {
    buildChain();
    expect(store.getAncestors('root')).toHaveLength(0);
  });

  it('returns empty array when start node does not exist', () => {
    expect(store.getAncestors('ghost')).toHaveLength(0);
  });

  it('does not include the start node itself', () => {
    buildChain();
    const ancestors = store.getAncestors('mid');
    expect(ancestors.map((n) => n.summary.id)).toEqual(['root']);
  });
});

// ---------------------------------------------------------------------------
// DAG traversal — getDescendants
// ---------------------------------------------------------------------------

describe('getDescendants', () => {
  /**
   * Build a tree:
   *   root
   *   ├── child-1
   *   │   └── grandchild-1
   *   └── child-2
   */
  function buildTree() {
    const grandchild = makeNode({ id: 'gc-1', depth: 0 });
    const child1 = makeNode({ id: 'c-1', depth: 1, childSummaryIds: ['gc-1'] });
    const child2 = makeNode({ id: 'c-2', depth: 1, childSummaryIds: [] });
    const root = makeNode({ id: 'root', depth: 2, childSummaryIds: ['c-1', 'c-2'] });

    for (const node of [grandchild, child1, child2, root]) {
      store.saveSummaryNodeForSession('session-a', node);
    }
  }

  it('returns all descendants BFS-ordered', () => {
    buildTree();
    const descendants = store.getDescendants('root');
    const ids = descendants.map((n) => n.summary.id);
    // c-1 and c-2 must come before gc-1 (BFS)
    expect(ids).toContain('c-1');
    expect(ids).toContain('c-2');
    expect(ids).toContain('gc-1');
    expect(ids.indexOf('c-1')).toBeLessThan(ids.indexOf('gc-1'));
    expect(ids.indexOf('c-2')).toBeLessThan(ids.indexOf('gc-1'));
  });

  it('does not include the start node itself', () => {
    buildTree();
    const descendants = store.getDescendants('root');
    expect(descendants.map((n) => n.summary.id)).not.toContain('root');
  });

  it('returns empty array for a leaf node', () => {
    buildTree();
    expect(store.getDescendants('gc-1')).toHaveLength(0);
  });

  it('returns empty array for a nonexistent node', () => {
    expect(store.getDescendants('ghost')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// DAG traversal — getSourceMessages
// ---------------------------------------------------------------------------

describe('getSourceMessages', () => {
  it('returns message ids from the start node itself', () => {
    const node = makeNode({ id: 'n1', coveredMessageIds: ['msg-1', 'msg-2'] });
    store.saveSummaryNodeForSession('session-a', node);

    const msgs = store.getSourceMessages('n1');
    expect(msgs).toHaveLength(2);
    expect(msgs).toContain('msg-1');
    expect(msgs).toContain('msg-2');
  });

  it('collects message ids from entire subtree', () => {
    const leaf1 = makeNode({ id: 'l-1', depth: 0, coveredMessageIds: ['msg-1', 'msg-2'] });
    const leaf2 = makeNode({ id: 'l-2', depth: 0, coveredMessageIds: ['msg-3'] });
    const parent = makeNode({ id: 'p-1', depth: 1, childSummaryIds: ['l-1', 'l-2'] });

    for (const n of [leaf1, leaf2, parent]) {
      store.saveSummaryNodeForSession('session-a', n);
    }

    const msgs = store.getSourceMessages('p-1');
    expect(msgs).toHaveLength(3);
    expect(msgs).toContain('msg-1');
    expect(msgs).toContain('msg-2');
    expect(msgs).toContain('msg-3');
  });

  it('deduplicates message ids', () => {
    const leaf1 = makeNode({ id: 'l-1', depth: 0, coveredMessageIds: ['msg-1', 'msg-2'] });
    const leaf2 = makeNode({ id: 'l-2', depth: 0, coveredMessageIds: ['msg-2', 'msg-3'] });
    const parent = makeNode({ id: 'p-1', depth: 1, childSummaryIds: ['l-1', 'l-2'] });

    for (const n of [leaf1, leaf2, parent]) {
      store.saveSummaryNodeForSession('session-a', n);
    }

    const msgs = store.getSourceMessages('p-1');
    // msg-2 appears in both leaves; should only appear once
    expect(msgs).toHaveLength(3);
    expect(msgs.filter((m) => m === 'msg-2')).toHaveLength(1);
  });

  it('returns empty array for a node with no sources', () => {
    store.saveSummaryNodeForSession('session-a', makeNode({ id: 'n1' }));
    expect(store.getSourceMessages('n1')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// FTS5 search
// ---------------------------------------------------------------------------

describe('searchSummaries', () => {
  beforeEach(() => {
    store.saveSummaryNodeForSession(
      'session-a',
      makeNode({ id: 's1', content: 'The user asked about database performance tuning' })
    );
    store.saveSummaryNodeForSession(
      'session-a',
      makeNode({ id: 's2', content: 'Discussion about React component architecture' })
    );
    store.saveSummaryNodeForSession(
      'session-b',
      makeNode({ id: 's3', content: 'Database indexing strategies for large tables' })
    );
  });

  it('returns matching summaries', () => {
    const results = store.searchSummaries('database');
    expect(results.length).toBeGreaterThanOrEqual(1);
    const ids = results.map((r) => r.summaryNode.summary.id);
    expect(ids).toContain('s1');
  });

  it('filters by session when sessionId is provided', () => {
    const results = store.searchSummaries('database', 'session-a');
    const ids = results.map((r) => r.summaryNode.summary.id);
    expect(ids).toContain('s1');
    expect(ids).not.toContain('s3');
  });

  it('returns empty array for a query that matches nothing', () => {
    const results = store.searchSummaries('xyzzy_no_match_here');
    expect(results).toHaveLength(0);
  });

  it('returns empty array for an empty query', () => {
    const results = store.searchSummaries('');
    expect(results).toHaveLength(0);
  });

  it('respects the limit parameter', () => {
    const results = store.searchSummaries('database', undefined, 1);
    expect(results).toHaveLength(1);
  });

  it('includes a rank field', () => {
    const results = store.searchSummaries('database');
    for (const r of results) {
      expect(typeof r.rank).toBe('number');
    }
  });
});

// ---------------------------------------------------------------------------
// Context items (assembly scratch)
// ---------------------------------------------------------------------------

describe('upsertContextItems / getContextItems / clearContextItems', () => {
  it('stores and retrieves context items ordered by item_order', () => {
    store.upsertContextItems('session-a', [
      { kind: 'message', source_id: 'msg-1', content: 'Hello', token_count: 5, item_order: 0 },
      { kind: 'summary', source_id: 'sum-1', content: 'Summary', token_count: 20, item_order: 1 },
    ]);

    const items = store.getContextItems('session-a');
    expect(items).toHaveLength(2);
    expect(items[0].kind).toBe('message');
    expect(items[0].item_order).toBe(0);
    expect(items[1].kind).toBe('summary');
    expect(items[1].item_order).toBe(1);
  });

  it('replaces existing items atomically on re-upsert', () => {
    store.upsertContextItems('session-a', [
      { kind: 'message', source_id: 'msg-1', content: 'Old', token_count: 5, item_order: 0 },
    ]);
    store.upsertContextItems('session-a', [
      { kind: 'message', source_id: 'msg-2', content: 'New', token_count: 7, item_order: 0 },
      { kind: 'message', source_id: 'msg-3', content: 'Also new', token_count: 3, item_order: 1 },
    ]);

    const items = store.getContextItems('session-a');
    expect(items).toHaveLength(2);
    expect(items[0].source_id).toBe('msg-2');
  });

  it('scopes items to the session', () => {
    store.upsertContextItems('session-a', [
      { kind: 'message', source_id: 'msg-a', content: 'A', token_count: 1, item_order: 0 },
    ]);
    store.upsertContextItems('session-b', [
      { kind: 'message', source_id: 'msg-b', content: 'B', token_count: 1, item_order: 0 },
    ]);

    expect(store.getContextItems('session-a')).toHaveLength(1);
    expect(store.getContextItems('session-b')).toHaveLength(1);
    expect(store.getContextItems('session-a')[0].source_id).toBe('msg-a');
  });

  it('clearContextItems removes all items for a session', () => {
    store.upsertContextItems('session-a', [
      { kind: 'message', source_id: 'msg-1', content: 'Hello', token_count: 5, item_order: 0 },
    ]);
    store.clearContextItems('session-a');
    expect(store.getContextItems('session-a')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// deleteSummariesForSession
// ---------------------------------------------------------------------------

describe('deleteSummariesForSession', () => {
  it('removes all summaries for the given session', () => {
    store.saveSummaryNodeForSession('session-a', makeNode({ id: 'a1' }));
    store.saveSummaryNodeForSession('session-a', makeNode({ id: 'a2' }));
    store.saveSummaryNodeForSession('session-b', makeNode({ id: 'b1' }));

    store.deleteSummariesForSession('session-a');

    expect(store.getAllSummaryNodes('session-a')).toHaveLength(0);
    expect(store.getAllSummaryNodes('session-b')).toHaveLength(1);
  });
});
