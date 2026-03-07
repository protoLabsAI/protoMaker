/**
 * Unit tests for TodoService
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

// --------------------------------------------------------------------------
// Mock @protolabsai/platform
// Use real path computation and real fs operations in temp dir.
// --------------------------------------------------------------------------
vi.mock('@protolabsai/platform', () => {
  return {
    getTodoWorkspacePath: (projectPath: string) =>
      path.join(projectPath, '.automaker', 'todos', 'workspace.json'),
    ensureTodoDir: async (projectPath: string) => {
      const dir = path.join(projectPath, '.automaker', 'todos');
      await fs.promises.mkdir(dir, { recursive: true });
      return dir;
    },
  };
});

// --------------------------------------------------------------------------
// Mock @protolabsai/utils
// Use real fs for readJsonFile / atomicWriteJson; mock only createLogger.
// --------------------------------------------------------------------------
vi.mock('@protolabsai/utils', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
  readJsonFile: async <T>(filePath: string, defaultValue: T): Promise<T> => {
    try {
      const raw = await fs.promises.readFile(filePath, 'utf-8');
      return JSON.parse(raw) as T;
    } catch {
      return defaultValue;
    }
  },
  atomicWriteJson: async (
    filePath: string,
    data: unknown,
    opts?: { indent?: number; createDirs?: boolean }
  ) => {
    if (opts?.createDirs) {
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    }
    await fs.promises.writeFile(filePath, JSON.stringify(data, null, opts?.indent ?? 2), 'utf-8');
  },
}));

import { TodoService } from '../../../src/services/todo-service.js';

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function workspacePath(tempDir: string) {
  return path.join(tempDir, '.automaker', 'todos', 'workspace.json');
}

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------

describe('TodoService', () => {
  let service: TodoService;
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-service-test-'));
    service = new TodoService();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Default workspace
  // -------------------------------------------------------------------------
  describe('default workspace creation', () => {
    it('creates a default workspace with one shared "Todo" list on first access', async () => {
      const lists = await service.getAllLists(tempDir);

      expect(lists).toHaveLength(1);
      expect(lists[0].name).toBe('Todo');
      expect(lists[0].ownerType).toBe('shared');
      expect(lists[0].items).toHaveLength(0);
    });

    it('persists the default workspace so subsequent reads return the same list', async () => {
      const firstRead = await service.getAllLists(tempDir);
      const secondRead = await service.getAllLists(tempDir);

      expect(firstRead[0].id).toBe(secondRead[0].id);
    });

    it('saves workspace.json to disk on first access', async () => {
      await service.getAllLists(tempDir);
      const exists = fs.existsSync(workspacePath(tempDir));
      expect(exists).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // createList
  // -------------------------------------------------------------------------
  describe('createList()', () => {
    it('creates a new list and appends it to listOrder', async () => {
      const list = await service.createList(tempDir, 'Sprint Tasks', 'user');

      expect(list.id).toBeTruthy();
      expect(list.name).toBe('Sprint Tasks');
      expect(list.ownerType).toBe('user');
      expect(list.items).toHaveLength(0);

      const all = await service.getAllLists(tempDir);
      expect(all.some((l) => l.id === list.id)).toBe(true);
    });

    it('emits todo:list-created event', async () => {
      const handler = vi.fn();
      service.on('todo:list-created', handler);

      const list = await service.createList(tempDir, 'My List');

      expect(handler).toHaveBeenCalledOnce();
      expect(handler.mock.calls[0][0].list.id).toBe(list.id);
    });

    it('defaults ownerType to "shared"', async () => {
      const list = await service.createList(tempDir, 'Shared Tasks');
      expect(list.ownerType).toBe('shared');
    });
  });

  // -------------------------------------------------------------------------
  // deleteList
  // -------------------------------------------------------------------------
  describe('deleteList()', () => {
    it('removes the list from the workspace and listOrder', async () => {
      const list = await service.createList(tempDir, 'To Delete');
      await service.deleteList(tempDir, list.id);

      const found = await service.getList(tempDir, list.id);
      expect(found).toBeNull();

      const all = await service.getAllLists(tempDir);
      expect(all.every((l) => l.id !== list.id)).toBe(true);
    });

    it('throws if list does not exist', async () => {
      await expect(service.deleteList(tempDir, 'nonexistent-id')).rejects.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // getList / getAllLists
  // -------------------------------------------------------------------------
  describe('getList()', () => {
    it('returns null for an unknown list ID', async () => {
      await service.getAllLists(tempDir); // trigger default workspace creation
      const result = await service.getList(tempDir, 'unknown-id');
      expect(result).toBeNull();
    });

    it('returns the correct list by ID', async () => {
      const list = await service.createList(tempDir, 'My List');
      const found = await service.getList(tempDir, list.id);
      expect(found?.id).toBe(list.id);
      expect(found?.name).toBe('My List');
    });
  });

  describe('getAllLists()', () => {
    it('returns lists in listOrder', async () => {
      const a = await service.createList(tempDir, 'A');
      const b = await service.createList(tempDir, 'B');
      const all = await service.getAllLists(tempDir);

      // The default list comes first, then A, then B
      const names = all.map((l) => l.name);
      expect(names.indexOf('A')).toBeLessThan(names.indexOf('B'));
      expect(all.some((l) => l.id === a.id)).toBe(true);
      expect(all.some((l) => l.id === b.id)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // addItem
  // -------------------------------------------------------------------------
  describe('addItem()', () => {
    it('adds an item to the specified list', async () => {
      const list = await service.createList(tempDir, 'Work');
      const item = await service.addItem(tempDir, list.id, { title: 'Do the thing' });

      expect(item.id).toBeTruthy();
      expect(item.title).toBe('Do the thing');
      expect(item.completed).toBe(false);
      expect(item.priority).toBe(0);

      const found = await service.getList(tempDir, list.id);
      expect(found?.items).toHaveLength(1);
      expect(found?.items[0].id).toBe(item.id);
    });

    it('emits todo:item-added event', async () => {
      const list = await service.createList(tempDir, 'Test');
      const handler = vi.fn();
      service.on('todo:item-added', handler);

      const item = await service.addItem(tempDir, list.id, { title: 'New Task' });

      expect(handler).toHaveBeenCalledOnce();
      expect(handler.mock.calls[0][0].item.id).toBe(item.id);
    });

    it('stores optional fields when provided', async () => {
      const list = await service.createList(tempDir, 'Work');
      const item = await service.addItem(tempDir, list.id, {
        title: 'Important',
        description: 'Details here',
        priority: 3,
        dueDate: '2026-04-01T00:00:00.000Z',
        linkedFeatureId: 'feature-123',
      });

      expect(item.description).toBe('Details here');
      expect(item.priority).toBe(3);
      expect(item.dueDate).toBe('2026-04-01T00:00:00.000Z');
      expect(item.linkedFeatureId).toBe('feature-123');
    });

    it('throws if list does not exist', async () => {
      await expect(service.addItem(tempDir, 'no-such-list', { title: 'x' })).rejects.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // updateItem
  // -------------------------------------------------------------------------
  describe('updateItem()', () => {
    it('updates item fields', async () => {
      const list = await service.createList(tempDir, 'Work');
      const item = await service.addItem(tempDir, list.id, { title: 'Old Title' });

      const updated = await service.updateItem(tempDir, list.id, item.id, {
        title: 'New Title',
        priority: 2,
      });

      expect(updated.title).toBe('New Title');
      expect(updated.priority).toBe(2);
      // updatedAt should be a valid ISO string; may equal original if same ms
      expect(typeof updated.updatedAt).toBe('string');
      expect(new Date(updated.updatedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(item.updatedAt).getTime()
      );
    });

    it('emits todo:item-updated event', async () => {
      const list = await service.createList(tempDir, 'Work');
      const item = await service.addItem(tempDir, list.id, { title: 'T' });
      const handler = vi.fn();
      service.on('todo:item-updated', handler);

      await service.updateItem(tempDir, list.id, item.id, { title: 'Updated' });

      expect(handler).toHaveBeenCalledOnce();
    });

    it('throws if list does not exist', async () => {
      await expect(
        service.updateItem(tempDir, 'bad-list', 'bad-item', { title: 'x' })
      ).rejects.toThrow();
    });

    it('throws if item does not exist', async () => {
      const list = await service.createList(tempDir, 'Work');
      await expect(
        service.updateItem(tempDir, list.id, 'bad-item-id', { title: 'x' })
      ).rejects.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // deleteItem
  // -------------------------------------------------------------------------
  describe('deleteItem()', () => {
    it('removes the item from the list', async () => {
      const list = await service.createList(tempDir, 'Work');
      const item = await service.addItem(tempDir, list.id, { title: 'Remove me' });

      await service.deleteItem(tempDir, list.id, item.id);

      const found = await service.getList(tempDir, list.id);
      expect(found?.items).toHaveLength(0);
    });

    it('throws if item does not exist', async () => {
      const list = await service.createList(tempDir, 'Work');
      await expect(service.deleteItem(tempDir, list.id, 'ghost-id')).rejects.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // completeItem
  // -------------------------------------------------------------------------
  describe('completeItem()', () => {
    it('marks item completed and sets completedAt timestamp', async () => {
      const list = await service.createList(tempDir, 'Work');
      const item = await service.addItem(tempDir, list.id, { title: 'Finish this' });

      expect(item.completed).toBe(false);
      expect(item.completedAt).toBeUndefined();

      const completed = await service.completeItem(tempDir, list.id, item.id);

      expect(completed.completed).toBe(true);
      expect(completed.completedAt).toBeTruthy();
      expect(typeof completed.completedAt).toBe('string');
    });

    it('emits todo:item-completed event', async () => {
      const list = await service.createList(tempDir, 'Work');
      const item = await service.addItem(tempDir, list.id, { title: 'T' });
      const handler = vi.fn();
      service.on('todo:item-completed', handler);

      await service.completeItem(tempDir, list.id, item.id);

      expect(handler).toHaveBeenCalledOnce();
      expect(handler.mock.calls[0][0].item.completed).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // reorderItems
  // -------------------------------------------------------------------------
  describe('reorderItems()', () => {
    it('reorders items correctly', async () => {
      const list = await service.createList(tempDir, 'Work');
      const a = await service.addItem(tempDir, list.id, { title: 'A' });
      const b = await service.addItem(tempDir, list.id, { title: 'B' });
      const c = await service.addItem(tempDir, list.id, { title: 'C' });

      const reordered = await service.reorderItems(tempDir, list.id, [c.id, a.id, b.id]);

      expect(reordered.items[0].id).toBe(c.id);
      expect(reordered.items[1].id).toBe(a.id);
      expect(reordered.items[2].id).toBe(b.id);
    });

    it('preserves all items even if some IDs are missing from the reorder list', async () => {
      const list = await service.createList(tempDir, 'Work');
      const a = await service.addItem(tempDir, list.id, { title: 'A' });
      const b = await service.addItem(tempDir, list.id, { title: 'B' });
      const c = await service.addItem(tempDir, list.id, { title: 'C' });

      // Only pass 2 of 3 IDs
      const reordered = await service.reorderItems(tempDir, list.id, [b.id, a.id]);

      expect(reordered.items).toHaveLength(3);
      expect(reordered.items.some((i) => i.id === c.id)).toBe(true);
    });

    it('throws if list does not exist', async () => {
      await expect(service.reorderItems(tempDir, 'no-such-list', [])).rejects.toThrow();
    });
  });
});
