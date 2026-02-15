import { describe, it, expect } from 'vitest';
import { idDedupAppendReducer, createLruReducer } from '../../src/graphs/reducers.js';

/**
 * Tests for ID-based deduplicating append reducer
 */
describe('idDedupAppendReducer', () => {
  interface Item {
    id: string;
    value: string;
    score?: number;
  }

  it('should handle both undefined inputs', () => {
    const result = idDedupAppendReducer<Item>(undefined, undefined);
    expect(result).toEqual([]);
  });

  it('should return right when left is undefined', () => {
    const right: Item[] = [{ id: '1', value: 'a' }];
    const result = idDedupAppendReducer<Item>(undefined, right);
    expect(result).toEqual(right);
  });

  it('should return left when right is undefined', () => {
    const left: Item[] = [{ id: '1', value: 'a' }];
    const result = idDedupAppendReducer<Item>(left, undefined);
    expect(result).toEqual(left);
  });

  it('should concatenate arrays when no duplicates by ID', () => {
    const left: Item[] = [{ id: '1', value: 'a' }];
    const right: Item[] = [{ id: '2', value: 'b' }];
    const result = idDedupAppendReducer(left, right);
    expect(result).toEqual([
      { id: '1', value: 'a' },
      { id: '2', value: 'b' },
    ]);
  });

  it('should deduplicate by ID with right taking precedence', () => {
    const left: Item[] = [{ id: '1', value: 'a', score: 1 }];
    const right: Item[] = [{ id: '1', value: 'a_updated', score: 2 }];
    const result = idDedupAppendReducer(left, right);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ id: '1', value: 'a_updated', score: 2 });
  });

  it('should preserve insertion order', () => {
    const left: Item[] = [
      { id: '1', value: 'a' },
      { id: '2', value: 'b' },
    ];
    const right: Item[] = [
      { id: '3', value: 'c' },
      { id: '1', value: 'a_updated' }, // Update to first item
      { id: '4', value: 'd' },
    ];
    const result = idDedupAppendReducer(left, right);

    // Should have 4 items in order: 1 (updated), 2, 3, 4
    expect(result).toHaveLength(4);
    expect(result[0].id).toBe('1');
    expect(result[0].value).toBe('a_updated');
    expect(result[1].id).toBe('2');
    expect(result[2].id).toBe('3');
    expect(result[3].id).toBe('4');
  });

  it('should handle empty arrays', () => {
    const left: Item[] = [];
    const right: Item[] = [{ id: '1', value: 'a' }];
    const result = idDedupAppendReducer(left, right);
    expect(result).toEqual([{ id: '1', value: 'a' }]);
  });

  it('should handle complex items with multiple fields', () => {
    const left: Item[] = [
      { id: 'a', value: 'text_a', score: 0.9 },
      { id: 'b', value: 'text_b', score: 0.8 },
    ];
    const right: Item[] = [
      { id: 'c', value: 'text_c', score: 0.95 },
      { id: 'a', value: 'text_a_revised', score: 0.95 },
    ];
    const result = idDedupAppendReducer(left, right);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ id: 'a', value: 'text_a_revised', score: 0.95 });
    expect(result[1]).toEqual({ id: 'b', value: 'text_b', score: 0.8 });
    expect(result[2]).toEqual({ id: 'c', value: 'text_c', score: 0.95 });
  });
});

/**
 * Tests for LRU-evicting reducer factory
 */
describe('createLruReducer', () => {
  interface Item {
    value: string;
  }

  it('should handle both undefined inputs', () => {
    const lru = createLruReducer<Item>(3);
    const result = lru(undefined, undefined);
    expect(result).toEqual([]);
  });

  it('should return right when left is undefined, trimmed to maxSize', () => {
    const lru = createLruReducer<Item>(2);
    const right: Item[] = [{ value: 'a' }, { value: 'b' }, { value: 'c' }];
    const result = lru(undefined, right);
    // Should keep only last 2 items
    expect(result).toEqual([{ value: 'b' }, { value: 'c' }]);
  });

  it('should return left when right is undefined', () => {
    const lru = createLruReducer<Item>(3);
    const left: Item[] = [{ value: 'a' }];
    const result = lru(left, undefined);
    expect(result).toEqual(left);
  });

  it('should append and trim to maxSize', () => {
    const lru = createLruReducer<Item>(3);
    const left: Item[] = [{ value: 'a' }, { value: 'b' }];
    const right: Item[] = [{ value: 'c' }, { value: 'd' }];
    const result = lru(left, right);

    // Combined: [a, b, c, d], keep last 3: [b, c, d]
    expect(result).toHaveLength(3);
    expect(result).toEqual([{ value: 'b' }, { value: 'c' }, { value: 'd' }]);
  });

  it('should keep exact maxSize items', () => {
    const lru = createLruReducer<Item>(2);
    const left: Item[] = [{ value: 'a' }];
    const right: Item[] = [{ value: 'b' }];
    const result = lru(left, right);

    expect(result).toHaveLength(2);
    expect(result).toEqual([{ value: 'a' }, { value: 'b' }]);
  });

  it('should evict oldest when exceeding maxSize', () => {
    const lru = createLruReducer<Item>(2);
    const left: Item[] = [{ value: 'a' }, { value: 'b' }, { value: 'c' }];
    const right: Item[] = [{ value: 'd' }];
    const result = lru(left, right);

    // Combined: [a, b, c, d], keep last 2: [c, d]
    expect(result).toHaveLength(2);
    expect(result).toEqual([{ value: 'c' }, { value: 'd' }]);
  });

  it('should work with different maxSize values', () => {
    const lru5 = createLruReducer<Item>(5);
    const items: Item[] = Array.from({ length: 10 }, (_, i) => ({ value: `item_${i}` }));
    const result = lru5(items.slice(0, 7), items.slice(7));

    // Combined: [item_0..item_6, item_7, item_8, item_9]
    // Keep last 5: [item_5, item_6, item_7, item_8, item_9]
    expect(result).toHaveLength(5);
    expect(result[0].value).toBe('item_5');
    expect(result[4].value).toBe('item_9');
  });

  it('should handle empty left and right arrays', () => {
    const lru = createLruReducer<Item>(3);
    const result = lru([], []);
    expect(result).toEqual([]);
  });

  it('should handle single maxSize', () => {
    const lru = createLruReducer<Item>(1);
    const left: Item[] = [{ value: 'a' }];
    const right: Item[] = [{ value: 'b' }];
    const result = lru(left, right);

    // Keep only last 1 item
    expect(result).toHaveLength(1);
    expect(result).toEqual([{ value: 'b' }]);
  });
});
