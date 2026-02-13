import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  createStateAnnotation,
  validateState,
  createStateUpdater,
  mergeState,
  deepMergeState,
  isValidStateUpdate,
} from '../../src/graphs/state-utils.js';

describe('state-utils', () => {
  describe('createStateAnnotation', () => {
    it('should create annotation from Zod schema', () => {
      const schema = z.object({
        count: z.number(),
        name: z.string(),
      });

      const annotation = createStateAnnotation(schema);
      expect(annotation).toBeDefined();
    });

    it('should create annotation with custom reducers', () => {
      const schema = z.object({
        count: z.number(),
        items: z.array(z.string()),
      });

      const annotation = createStateAnnotation(schema, {
        count: (left, right) => left + right,
        items: (left, right) => [...left, ...right],
      });

      expect(annotation).toBeDefined();
    });
  });

  describe('validateState', () => {
    const schema = z.object({
      id: z.string(),
      count: z.number(),
      active: z.boolean(),
    });

    it('should validate correct state', () => {
      const state = { id: '123', count: 42, active: true };
      const result = validateState(schema, state);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(state);
      }
    });

    it('should reject invalid state', () => {
      const state = { id: '123', count: 'invalid', active: true };
      const result = validateState(schema, state);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    });

    it('should reject missing required fields', () => {
      const state = { id: '123', count: 42 };
      const result = validateState(schema, state);

      expect(result.success).toBe(false);
    });
  });

  describe('createStateUpdater', () => {
    const schema = z.object({
      name: z.string(),
      age: z.number(),
      email: z.string().email(),
    });

    it('should create valid partial updates', () => {
      const updater = createStateUpdater(schema);
      const update = updater({ name: 'John' });

      expect(update).toEqual({ name: 'John' });
    });

    it('should throw on invalid updates', () => {
      const updater = createStateUpdater(schema);

      expect(() => {
        updater({ age: 'invalid' as any });
      }).toThrow();
    });

    it('should allow empty updates', () => {
      const updater = createStateUpdater(schema);
      const update = updater({});

      expect(update).toEqual({});
    });
  });

  describe('mergeState', () => {
    it('should merge simple objects', () => {
      const left = { a: 1, b: 2, c: 3 };
      const right = { b: 20, d: 4 };

      const result = mergeState(left, right);

      expect(result).toEqual({ a: 1, b: 20, c: 3, d: 4 });
    });

    it('should handle empty right object', () => {
      const left = { a: 1, b: 2 };
      const right = {};

      const result = mergeState(left, right);

      expect(result).toEqual(left);
    });

    it('should override with undefined', () => {
      const left = { a: 1, b: 2 };
      const right = { b: undefined };

      const result = mergeState(left, right);

      expect(result).toEqual({ a: 1, b: undefined });
    });
  });

  describe('deepMergeState', () => {
    it('should shallow merge simple objects', () => {
      const left = { a: 1, b: 2 };
      const right = { b: 20, c: 3 };

      const result = deepMergeState(left, right);

      expect(result).toEqual({ a: 1, b: 20, c: 3 });
    });

    it('should deep merge nested objects', () => {
      const left = {
        user: { name: 'John', age: 30 },
        settings: { theme: 'dark' },
      };
      const right = {
        user: { age: 31 },
        settings: { fontSize: 14 },
      };

      const result = deepMergeState(left, right);

      expect(result).toEqual({
        user: { name: 'John', age: 31 },
        settings: { theme: 'dark', fontSize: 14 },
      });
    });

    it('should not merge arrays (replace)', () => {
      const left = { items: [1, 2, 3] };
      const right = { items: [4, 5] };

      const result = deepMergeState(left, right);

      expect(result).toEqual({ items: [4, 5] });
    });

    it('should handle multiple nesting levels', () => {
      const left = {
        level1: {
          level2: {
            level3: { a: 1, b: 2 },
          },
        },
      };
      const right = {
        level1: {
          level2: {
            level3: { b: 20, c: 3 },
          },
        },
      };

      const result = deepMergeState(left, right);

      expect(result).toEqual({
        level1: {
          level2: {
            level3: { a: 1, b: 20, c: 3 },
          },
        },
      });
    });
  });

  describe('isValidStateUpdate', () => {
    const schema = z.object({
      id: z.string(),
      name: z.string(),
      count: z.number(),
    });

    it('should return true for valid partial updates', () => {
      expect(isValidStateUpdate(schema, { name: 'John' })).toBe(true);
      expect(isValidStateUpdate(schema, { count: 42 })).toBe(true);
      expect(isValidStateUpdate(schema, {})).toBe(true);
    });

    it('should return false for invalid types', () => {
      expect(isValidStateUpdate(schema, { count: 'invalid' })).toBe(false);
      expect(isValidStateUpdate(schema, { name: 123 })).toBe(false);
    });

    it('should return true for valid complete state', () => {
      const fullState = { id: '123', name: 'John', count: 42 };
      expect(isValidStateUpdate(schema, fullState)).toBe(true);
    });
  });
});
