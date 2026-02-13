import { describe, it, expect } from 'vitest';
import {
  fileReducer,
  todoReducer,
  appendReducer,
  replaceReducer,
  setUnionReducer,
  mapMergeReducer,
  counterReducer,
  maxReducer,
  minReducer,
  type FileOperation,
  type TodoItem,
} from '../../src/graphs/reducers.js';

describe('reducers', () => {
  describe('fileReducer', () => {
    it('should merge file arrays by path', () => {
      const left: FileOperation[] = [
        { path: 'file1.ts', content: 'old', operation: 'update' },
        { path: 'file2.ts', content: 'data', operation: 'create' },
      ];
      const right: FileOperation[] = [
        { path: 'file1.ts', content: 'new', operation: 'update' },
        { path: 'file3.ts', content: 'more', operation: 'create' },
      ];

      const result = fileReducer(left, right);

      expect(result).toHaveLength(3);
      expect(result.find((f) => f.path === 'file1.ts')?.content).toBe('new');
      expect(result.find((f) => f.path === 'file2.ts')?.content).toBe('data');
      expect(result.find((f) => f.path === 'file3.ts')?.content).toBe('more');
    });

    it('should use timestamps when available', () => {
      const left: FileOperation[] = [
        { path: 'file1.ts', content: 'newer', operation: 'update', timestamp: 2000 },
      ];
      const right: FileOperation[] = [
        { path: 'file1.ts', content: 'older', operation: 'update', timestamp: 1000 },
      ];

      const result = fileReducer(left, right);

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('newer');
      expect(result[0].timestamp).toBe(2000);
    });

    it('should handle undefined inputs', () => {
      expect(fileReducer(undefined, undefined)).toEqual([]);
      expect(
        fileReducer([{ path: 'a', content: 'x', operation: 'create' }], undefined)
      ).toHaveLength(1);
      expect(
        fileReducer(undefined, [{ path: 'b', content: 'y', operation: 'create' }])
      ).toHaveLength(1);
    });
  });

  describe('todoReducer', () => {
    it('should merge todo arrays by id', () => {
      const left: TodoItem[] = [
        { id: '1', title: 'Task 1', completed: false },
        { id: '2', title: 'Task 2', completed: true },
      ];
      const right: TodoItem[] = [
        { id: '1', title: 'Task 1 Updated', completed: true },
        { id: '3', title: 'Task 3', completed: false },
      ];

      const result = todoReducer(left, right);

      expect(result).toHaveLength(3);
      expect(result.find((t) => t.id === '1')?.title).toBe('Task 1 Updated');
      expect(result.find((t) => t.id === '1')?.completed).toBe(true);
      expect(result.find((t) => t.id === '2')?.completed).toBe(true);
      expect(result.find((t) => t.id === '3')?.title).toBe('Task 3');
    });

    it('should preserve createdAt when merging', () => {
      const left: TodoItem[] = [{ id: '1', title: 'Task 1', completed: false, createdAt: 1000 }];
      const right: TodoItem[] = [{ id: '1', title: 'Task 1', completed: true }];

      const result = todoReducer(left, right);

      expect(result[0].createdAt).toBe(1000);
      expect(result[0].completed).toBe(true);
    });

    it('should handle undefined inputs', () => {
      expect(todoReducer(undefined, undefined)).toEqual([]);
      expect(todoReducer([{ id: '1', title: 'A', completed: false }], undefined)).toHaveLength(1);
      expect(todoReducer(undefined, [{ id: '2', title: 'B', completed: true }])).toHaveLength(1);
    });
  });

  describe('appendReducer', () => {
    it('should concatenate arrays', () => {
      const left = [1, 2, 3];
      const right = [4, 5];

      const result = appendReducer(left, right);

      expect(result).toEqual([1, 2, 3, 4, 5]);
    });

    it('should handle undefined inputs', () => {
      expect(appendReducer(undefined, undefined)).toEqual([]);
      expect(appendReducer([1, 2], undefined)).toEqual([1, 2]);
      expect(appendReducer(undefined, [3, 4])).toEqual([3, 4]);
    });
  });

  describe('replaceReducer', () => {
    it('should replace left with right', () => {
      const left = [1, 2, 3];
      const right = [4, 5];

      const result = replaceReducer(left, right);

      expect(result).toEqual([4, 5]);
    });

    it('should return left when right is undefined', () => {
      const left = [1, 2, 3];

      const result = replaceReducer(left, undefined);

      expect(result).toEqual([1, 2, 3]);
    });

    it('should return empty array when both undefined', () => {
      const result = replaceReducer(undefined, undefined);

      expect(result).toEqual([]);
    });
  });

  describe('setUnionReducer', () => {
    it('should merge two sets', () => {
      const left = new Set([1, 2, 3]);
      const right = new Set([3, 4, 5]);

      const result = setUnionReducer(left, right);

      expect(result.size).toBe(5);
      expect(result.has(1)).toBe(true);
      expect(result.has(5)).toBe(true);
    });

    it('should handle undefined inputs', () => {
      expect(setUnionReducer(undefined, undefined).size).toBe(0);
      expect(setUnionReducer(new Set([1, 2]), undefined).size).toBe(2);
      expect(setUnionReducer(undefined, new Set([3, 4])).size).toBe(2);
    });
  });

  describe('mapMergeReducer', () => {
    it('should merge maps with right taking precedence', () => {
      const left = new Map([
        ['a', 1],
        ['b', 2],
      ]);
      const right = new Map([
        ['b', 20],
        ['c', 3],
      ]);

      const result = mapMergeReducer(left, right);

      expect(result.size).toBe(3);
      expect(result.get('a')).toBe(1);
      expect(result.get('b')).toBe(20);
      expect(result.get('c')).toBe(3);
    });

    it('should handle undefined inputs', () => {
      expect(mapMergeReducer(undefined, undefined).size).toBe(0);
      expect(mapMergeReducer(new Map([['a', 1]]), undefined).size).toBe(1);
      expect(mapMergeReducer(undefined, new Map([['b', 2]])).size).toBe(1);
    });
  });

  describe('counterReducer', () => {
    it('should add numeric values', () => {
      expect(counterReducer(5, 3)).toBe(8);
      expect(counterReducer(10, 20)).toBe(30);
    });

    it('should handle undefined inputs', () => {
      expect(counterReducer(undefined, undefined)).toBe(0);
      expect(counterReducer(5, undefined)).toBe(5);
      expect(counterReducer(undefined, 3)).toBe(3);
    });

    it('should handle zero values', () => {
      expect(counterReducer(0, 0)).toBe(0);
      expect(counterReducer(5, 0)).toBe(5);
      expect(counterReducer(0, 3)).toBe(3);
    });
  });

  describe('maxReducer', () => {
    it('should return maximum value', () => {
      expect(maxReducer(5, 3)).toBe(5);
      expect(maxReducer(3, 5)).toBe(5);
      expect(maxReducer(10, 10)).toBe(10);
    });

    it('should handle undefined inputs', () => {
      expect(maxReducer(undefined, undefined)).toBe(0);
      expect(maxReducer(5, undefined)).toBe(5);
      expect(maxReducer(undefined, 3)).toBe(3);
    });

    it('should handle negative values', () => {
      expect(maxReducer(-5, -3)).toBe(-3);
      expect(maxReducer(-5, 3)).toBe(3);
    });
  });

  describe('minReducer', () => {
    it('should return minimum value', () => {
      expect(minReducer(5, 3)).toBe(3);
      expect(minReducer(3, 5)).toBe(3);
      expect(minReducer(10, 10)).toBe(10);
    });

    it('should handle undefined inputs', () => {
      expect(minReducer(undefined, undefined)).toBe(0);
      expect(minReducer(5, undefined)).toBe(5);
      expect(minReducer(undefined, 3)).toBe(3);
    });

    it('should handle negative values', () => {
      expect(minReducer(-5, -3)).toBe(-5);
      expect(minReducer(-5, 3)).toBe(-5);
    });
  });
});
