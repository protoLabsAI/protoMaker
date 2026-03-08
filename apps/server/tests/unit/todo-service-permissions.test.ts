/**
 * Unit tests for TodoService permission enforcement across ownership tiers.
 *
 * Tests the three permission tiers defined in the feature spec:
 *  (1) user lists — user read/write, all Avas read-only
 *  (2) ava-instance lists — writable by owning instance's Ava + user; other Avas rejected
 *  (3) shared lists — full read/write by anyone
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Mock declarations (hoisted so they're available in vi.mock factories) ───

const { mockAtomicWriteJson, mockReadJsonFile, mockGetTodoWorkspacePath, mockEnsureTodoDir } =
  vi.hoisted(() => ({
    mockAtomicWriteJson: vi.fn(),
    mockReadJsonFile: vi.fn(),
    mockGetTodoWorkspacePath: vi.fn(),
    mockEnsureTodoDir: vi.fn(),
  }));

vi.mock('@protolabsai/utils', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
  atomicWriteJson: mockAtomicWriteJson,
  readJsonFile: mockReadJsonFile,
}));

vi.mock('@protolabsai/platform', () => ({
  getTodoWorkspacePath: mockGetTodoWorkspacePath,
  ensureTodoDir: mockEnsureTodoDir,
}));

import { TodoService } from '../../src/services/todo-service.js';
import type { TodoWriterIdentity } from '../../src/services/todo-service.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const WORKSPACE_PATH = '/fake/.automaker/todos/workspace.json';

const USER: TodoWriterIdentity = { isAva: false };
const AVA_A: TodoWriterIdentity = { isAva: true, instanceId: 'instance-a' };
const AVA_B: TodoWriterIdentity = { isAva: true, instanceId: 'instance-b' };

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('TodoService — permission tiers', () => {
  let service: TodoService;
  // In-memory file store — reset per test
  let fileStore: Record<string, unknown>;

  beforeEach(() => {
    fileStore = {};
    service = new TodoService();

    mockGetTodoWorkspacePath.mockReturnValue(WORKSPACE_PATH);
    mockEnsureTodoDir.mockResolvedValue(undefined);

    // atomicWriteJson stores data to our in-memory store
    mockAtomicWriteJson.mockImplementation((filePath: string, data: unknown) => {
      fileStore[filePath] = JSON.parse(JSON.stringify(data));
      return Promise.resolve();
    });

    // readJsonFile reads from our in-memory store
    mockReadJsonFile.mockImplementation((filePath: string, defaultVal: unknown) => {
      return Promise.resolve(fileStore[filePath] !== undefined ? fileStore[filePath] : defaultVal);
    });
  });

  // ─── shared lists (ownerType='shared') ────────────────────────────────────

  describe('shared lists', () => {
    it('allows user to create items', async () => {
      const list = await service.createList('/project', 'Shared', 'shared');
      const item = await service.addItem('/project', list.id, { title: 'task' }, USER);
      expect(item.title).toBe('task');
    });

    it('allows Ava (any instance) to create items', async () => {
      const list = await service.createList('/project', 'Shared', 'shared');
      const item = await service.addItem('/project', list.id, { title: 'ava task' }, AVA_A);
      expect(item.title).toBe('ava task');
    });

    it('allows a different Ava instance to create items', async () => {
      const list = await service.createList('/project', 'Shared', 'shared');
      const item = await service.addItem('/project', list.id, { title: 'ava-b task' }, AVA_B);
      expect(item.title).toBe('ava-b task');
    });

    it('allows user to update items', async () => {
      const list = await service.createList('/project', 'Shared', 'shared');
      const item = await service.addItem('/project', list.id, { title: 'original' }, USER);
      const updated = await service.updateItem(
        '/project',
        list.id,
        item.id,
        { title: 'updated' },
        USER
      );
      expect(updated.title).toBe('updated');
    });

    it('allows Ava to delete items', async () => {
      const list = await service.createList('/project', 'Shared', 'shared');
      const item = await service.addItem('/project', list.id, { title: 'doomed' }, USER);
      await expect(
        service.deleteItem('/project', list.id, item.id, AVA_A)
      ).resolves.toBeUndefined();
    });
  });

  // ─── user lists (ownerType='user') ────────────────────────────────────────

  describe('user lists', () => {
    it('allows user to create items', async () => {
      const list = await service.createList('/project', 'My Todos', 'user');
      const item = await service.addItem('/project', list.id, { title: 'user task' }, USER);
      expect(item.title).toBe('user task');
    });

    it('allows user to update items', async () => {
      const list = await service.createList('/project', 'My Todos', 'user');
      const item = await service.addItem('/project', list.id, { title: 'original' }, USER);
      const updated = await service.updateItem(
        '/project',
        list.id,
        item.id,
        { title: 'updated' },
        USER
      );
      expect(updated.title).toBe('updated');
    });

    it('allows user to delete items', async () => {
      const list = await service.createList('/project', 'My Todos', 'user');
      const item = await service.addItem('/project', list.id, { title: 'private' }, USER);
      await expect(service.deleteItem('/project', list.id, item.id, USER)).resolves.toBeUndefined();
    });

    it('rejects Ava writes to user-private list', async () => {
      const list = await service.createList('/project', 'My Todos', 'user');
      await expect(
        service.addItem('/project', list.id, { title: 'ava intrusion' }, AVA_A)
      ).rejects.toThrow('Permission denied');
    });

    it('rejects Ava updates to user-private list', async () => {
      const list = await service.createList('/project', 'My Todos', 'user');
      const item = await service.addItem('/project', list.id, { title: 'user task' }, USER);
      await expect(
        service.updateItem('/project', list.id, item.id, { title: 'ava edit' }, AVA_B)
      ).rejects.toThrow('Permission denied');
    });

    it('rejects Ava deletes on user-private list', async () => {
      const list = await service.createList('/project', 'My Todos', 'user');
      const item = await service.addItem('/project', list.id, { title: 'user task' }, USER);
      await expect(service.deleteItem('/project', list.id, item.id, AVA_A)).rejects.toThrow(
        'Permission denied'
      );
    });
  });

  // ─── ava-instance lists (ownerType='ava-instance') ────────────────────────

  describe('ava-instance lists', () => {
    it('allows the owning Ava instance to create items', async () => {
      const list = await service.createList(
        '/project',
        'Ava (instance-a)',
        'ava-instance',
        'instance-a'
      );
      const item = await service.addItem('/project', list.id, { title: 'my task' }, AVA_A);
      expect(item.title).toBe('my task');
    });

    it('allows the user to create items on any ava-instance list', async () => {
      const list = await service.createList(
        '/project',
        'Ava (instance-a)',
        'ava-instance',
        'instance-a'
      );
      const item = await service.addItem(
        '/project',
        list.id,
        { title: 'user task on ava list' },
        USER
      );
      expect(item.title).toBe('user task on ava list');
    });

    it("rejects a different Ava instance writing to another instance's list", async () => {
      const list = await service.createList(
        '/project',
        'Ava (instance-a)',
        'ava-instance',
        'instance-a'
      );
      await expect(
        service.addItem('/project', list.id, { title: 'cross-instance write' }, AVA_B)
      ).rejects.toThrow('Permission denied');
    });

    it("rejects a different Ava instance updating items on another instance's list", async () => {
      const list = await service.createList(
        '/project',
        'Ava (instance-a)',
        'ava-instance',
        'instance-a'
      );
      const item = await service.addItem('/project', list.id, { title: 'original' }, AVA_A);
      await expect(
        service.updateItem('/project', list.id, item.id, { title: 'hijacked' }, AVA_B)
      ).rejects.toThrow('Permission denied');
    });

    it("rejects a different Ava instance deleting items on another instance's list", async () => {
      const list = await service.createList(
        '/project',
        'Ava (instance-a)',
        'ava-instance',
        'instance-a'
      );
      const item = await service.addItem('/project', list.id, { title: 'task' }, AVA_A);
      await expect(service.deleteItem('/project', list.id, item.id, AVA_B)).rejects.toThrow(
        'Permission denied'
      );
    });

    it('allows the owning Ava to complete items', async () => {
      const list = await service.createList(
        '/project',
        'Ava (instance-a)',
        'ava-instance',
        'instance-a'
      );
      const item = await service.addItem('/project', list.id, { title: 'task' }, AVA_A);
      const completed = await service.completeItem('/project', list.id, item.id, AVA_A);
      expect(completed.completed).toBe(true);
    });

    it('rejects other Ava completing items', async () => {
      const list = await service.createList(
        '/project',
        'Ava (instance-a)',
        'ava-instance',
        'instance-a'
      );
      const item = await service.addItem('/project', list.id, { title: 'task' }, AVA_A);
      await expect(service.completeItem('/project', list.id, item.id, AVA_B)).rejects.toThrow(
        'Permission denied'
      );
    });
  });

  // ─── ensureAvaInstanceList ─────────────────────────────────────────────────

  describe('ensureAvaInstanceList', () => {
    it('creates an ava-instance list on first call', async () => {
      const list = await service.ensureAvaInstanceList('/project', 'instance-x');
      expect(list.ownerType).toBe('ava-instance');
      expect(list.ownerInstanceId).toBe('instance-x');
    });

    it('returns existing list on subsequent calls without duplicating', async () => {
      const first = await service.ensureAvaInstanceList('/project', 'instance-x');
      const second = await service.ensureAvaInstanceList('/project', 'instance-x');
      expect(first.id).toBe(second.id);
      // Verify only one ava-instance list for this instance was created
      const allLists = await service.getAllLists('/project');
      const avaLists = allLists.filter(
        (l) => l.ownerType === 'ava-instance' && l.ownerInstanceId === 'instance-x'
      );
      expect(avaLists).toHaveLength(1);
    });

    it('creates separate lists for different instances', async () => {
      const listA = await service.ensureAvaInstanceList('/project', 'instance-a');
      const listB = await service.ensureAvaInstanceList('/project', 'instance-b');
      expect(listA.id).not.toBe(listB.id);
      expect(listA.ownerInstanceId).toBe('instance-a');
      expect(listB.ownerInstanceId).toBe('instance-b');
    });
  });
});
