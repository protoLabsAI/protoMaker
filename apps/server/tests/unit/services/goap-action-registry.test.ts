/**
 * GOAP Action Registry Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { GOAPActionRegistry } from '../../../src/services/goap-action-registry.js';
import type { GOAPActionDefinition } from '@automaker/types';

function makeDefinition(
  id: string,
  category: GOAPActionDefinition['category'] = 'maintenance'
): GOAPActionDefinition {
  return {
    id,
    name: `Action ${id}`,
    description: `Test action ${id}`,
    category,
    preconditions: [{ key: 'ready', value: true }],
    effects: [{ key: `${id}_done`, value: true }],
    cost: 1,
  };
}

describe('GOAPActionRegistry', () => {
  it('should register and retrieve action definitions', () => {
    const registry = new GOAPActionRegistry();
    const def = makeDefinition('test_action');
    const handler = vi.fn();

    registry.register(def, handler);

    expect(registry.getDefinition('test_action')).toEqual(def);
    expect(registry.getHandler('test_action')).toBe(handler);
  });

  it('should return undefined for unregistered actions', () => {
    const registry = new GOAPActionRegistry();

    expect(registry.getDefinition('nonexistent')).toBeUndefined();
    expect(registry.getHandler('nonexistent')).toBeUndefined();
  });

  it('should list all registered definitions', () => {
    const registry = new GOAPActionRegistry();

    registry.register(makeDefinition('a1'), vi.fn());
    registry.register(makeDefinition('a2', 'auto-mode'), vi.fn());
    registry.register(makeDefinition('a3', 'pipeline'), vi.fn());

    const all = registry.getAllDefinitions();
    expect(all).toHaveLength(3);
    expect(all.map((d) => d.id).sort()).toEqual(['a1', 'a2', 'a3']);
  });

  it('should overwrite existing registrations', () => {
    const registry = new GOAPActionRegistry();
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    const def1 = makeDefinition('test');
    const def2 = { ...makeDefinition('test'), description: 'updated' };

    registry.register(def1, handler1);
    registry.register(def2, handler2);

    expect(registry.getDefinition('test')!.description).toBe('updated');
    expect(registry.getHandler('test')).toBe(handler2);
  });

  it('should execute handlers correctly', async () => {
    const registry = new GOAPActionRegistry();
    const handler = vi.fn().mockResolvedValue(undefined);

    registry.register(makeDefinition('my_action'), handler);

    const fn = registry.getHandler('my_action')!;
    await fn('/test/project', 'feature-branch');

    expect(handler).toHaveBeenCalledWith('/test/project', 'feature-branch');
  });
});
