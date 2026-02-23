/**
 * Unit tests for HITLFormService — form lifecycle, validation, disk persistence
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HITLFormService } from '../../../src/services/hitl-form-service.js';
import type { HITLFormServiceDeps } from '../../../src/services/hitl-form-service.js';
import type { HITLFormRequestInput } from '@automaker/types';
import fs from 'fs/promises';

vi.mock('fs/promises', () => ({
  default: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    rename: vi.fn(),
  },
}));

vi.mock('@automaker/platform', () => ({
  ensureAutomakerDir: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@automaker/utils', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

function createMockDeps(overrides: Partial<HITLFormServiceDeps> = {}): HITLFormServiceDeps {
  return {
    events: {
      emit: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    } as unknown as HITLFormServiceDeps['events'],
    followUpFeature: vi.fn().mockResolvedValue(undefined),
    getKnownProjectPaths: () => [],
    ...overrides,
  };
}

function createValidInput(overrides: Partial<HITLFormRequestInput> = {}): HITLFormRequestInput {
  return {
    title: 'Test Form',
    projectPath: '/test/project',
    callerType: 'api',
    steps: [
      {
        schema: { type: 'object', properties: { name: { type: 'string' } } },
      },
    ],
    ...overrides,
  };
}

describe('HITLFormService', () => {
  let service: HITLFormService;
  let deps: HITLFormServiceDeps;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // Prevent loadPersistedForms from running in constructor
    vi.mocked(fs.readFile).mockRejectedValue({ code: 'ENOENT' });
    deps = createMockDeps();
    service = new HITLFormService(deps);
  });

  afterEach(() => {
    service.shutdown();
    vi.useRealTimers();
  });

  // ---------- create() ----------

  describe('create', () => {
    it('should create a form with valid input', () => {
      const form = service.create(createValidInput());

      expect(form.id).toMatch(/^hitl-/);
      expect(form.status).toBe('pending');
      expect(form.title).toBe('Test Form');
      expect(form.steps).toHaveLength(1);
      expect(form.createdAt).toBeDefined();
      expect(form.expiresAt).toBeDefined();
    });

    it('should emit hitl:form-requested event', () => {
      const form = service.create(createValidInput());

      expect(deps.events.emit).toHaveBeenCalledWith(
        'hitl:form-requested',
        expect.objectContaining({
          formId: form.id,
          title: 'Test Form',
          callerType: 'api',
          stepCount: 1,
        })
      );
    });

    it('should throw if title is missing', () => {
      expect(() => service.create(createValidInput({ title: '' }))).toThrow(
        'title and at least one step are required'
      );
    });

    it('should throw if steps are empty', () => {
      expect(() => service.create(createValidInput({ steps: [] }))).toThrow(
        'title and at least one step are required'
      );
    });

    it('should throw if agent caller has no featureId', () => {
      expect(() =>
        service.create(createValidInput({ callerType: 'agent', featureId: undefined }))
      ).toThrow('featureId is required for agent caller type');
    });

    it('should accept agent caller with featureId', () => {
      const form = service.create(createValidInput({ callerType: 'agent', featureId: 'feat-123' }));
      expect(form.callerType).toBe('agent');
      expect(form.featureId).toBe('feat-123');
    });

    it('should clamp TTL to minimum 60 seconds', () => {
      const form = service.create(createValidInput({ ttlSeconds: 10 }));
      const created = new Date(form.createdAt).getTime();
      const expires = new Date(form.expiresAt).getTime();
      expect(expires - created).toBe(60 * 1000);
    });

    it('should clamp TTL to maximum 24 hours', () => {
      const form = service.create(createValidInput({ ttlSeconds: 999999 }));
      const created = new Date(form.createdAt).getTime();
      const expires = new Date(form.expiresAt).getTime();
      expect(expires - created).toBe(86400 * 1000);
    });

    it('should use default TTL of 1 hour when not specified', () => {
      const form = service.create(createValidInput());
      const created = new Date(form.createdAt).getTime();
      const expires = new Date(form.expiresAt).getTime();
      expect(expires - created).toBe(3600 * 1000);
    });

    it('should persist form to disk', async () => {
      service.create(createValidInput());

      // Flush async fire-and-forget saveToDisk
      await vi.advanceTimersByTimeAsync(0);

      expect(fs.writeFile).toHaveBeenCalled();
    });
  });

  // ---------- get() ----------

  describe('get', () => {
    it('should return a created form by ID', () => {
      const created = service.create(createValidInput());
      const retrieved = service.get(created.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(created.id);
    });

    it('should return undefined for unknown ID', () => {
      expect(service.get('nonexistent')).toBeUndefined();
    });

    it('should auto-expire forms past their TTL', () => {
      const form = service.create(createValidInput({ ttlSeconds: 60 }));
      expect(service.get(form.id)!.status).toBe('pending');

      // Advance past TTL
      vi.advanceTimersByTime(61 * 1000);

      const expired = service.get(form.id);
      expect(expired!.status).toBe('expired');
    });
  });

  // ---------- listPending() ----------

  describe('listPending', () => {
    it('should return all pending forms', () => {
      service.create(createValidInput({ title: 'Form A' }));
      service.create(createValidInput({ title: 'Form B' }));

      const pending = service.listPending();
      expect(pending).toHaveLength(2);
    });

    it('should filter by projectPath', () => {
      service.create(createValidInput({ projectPath: '/project/a' }));
      service.create(createValidInput({ projectPath: '/project/b' }));

      const filtered = service.listPending('/project/a');
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBeDefined();
    });

    it('should exclude expired forms', () => {
      service.create(createValidInput({ ttlSeconds: 60 }));
      vi.advanceTimersByTime(61 * 1000);

      const pending = service.listPending();
      expect(pending).toHaveLength(0);
    });

    it('should return summaries with correct shape', () => {
      service.create(createValidInput());
      const [summary] = service.listPending();

      expect(summary).toHaveProperty('id');
      expect(summary).toHaveProperty('title');
      expect(summary).toHaveProperty('status', 'pending');
      expect(summary).toHaveProperty('callerType');
      expect(summary).toHaveProperty('stepCount', 1);
      expect(summary).toHaveProperty('createdAt');
      expect(summary).toHaveProperty('expiresAt');
    });
  });

  // ---------- submit() ----------

  describe('submit', () => {
    it('should submit a form with valid response', async () => {
      const form = service.create(createValidInput());
      const result = await service.submit(form.id, [{ name: 'John' }]);

      expect(result.status).toBe('submitted');
      expect(result.response).toEqual([{ name: 'John' }]);
      expect(result.respondedAt).toBeDefined();
    });

    it('should emit hitl:form-responded event', async () => {
      const form = service.create(createValidInput());
      await service.submit(form.id, [{ name: 'John' }]);

      expect(deps.events.emit).toHaveBeenCalledWith(
        'hitl:form-responded',
        expect.objectContaining({
          formId: form.id,
          cancelled: false,
        })
      );
    });

    it('should throw for unknown form ID', async () => {
      await expect(service.submit('bad-id', [{}])).rejects.toThrow('Form not found');
    });

    it('should throw for non-pending form', async () => {
      const form = service.create(createValidInput());
      await service.submit(form.id, [{ name: 'first' }]);

      await expect(service.submit(form.id, [{ name: 'again' }])).rejects.toThrow('is not pending');
    });

    it('should throw for expired form', async () => {
      const form = service.create(createValidInput({ ttlSeconds: 60 }));
      vi.advanceTimersByTime(61 * 1000);

      await expect(service.submit(form.id, [{}])).rejects.toThrow('has expired');
    });

    it('should throw for wrong number of responses', async () => {
      const form = service.create(createValidInput());
      await expect(service.submit(form.id, [{}, {}])).rejects.toThrow('Expected 1 response(s)');
    });

    it('should route response to agent via followUpFeature', async () => {
      const form = service.create(
        createValidInput({ callerType: 'agent', featureId: 'feat-1', projectPath: '/proj' })
      );
      await service.submit(form.id, [{ answer: 'yes' }]);

      expect(deps.followUpFeature).toHaveBeenCalledWith(
        '/proj',
        'feat-1',
        expect.stringContaining('hitl_form_response')
      );
    });

    it('should not call followUpFeature for api caller', async () => {
      const form = service.create(createValidInput({ callerType: 'api' }));
      await service.submit(form.id, [{}]);

      expect(deps.followUpFeature).not.toHaveBeenCalled();
    });
  });

  // ---------- cancel() ----------

  describe('cancel', () => {
    it('should cancel a pending form', async () => {
      const form = service.create(createValidInput());
      const result = await service.cancel(form.id);

      expect(result.status).toBe('cancelled');
      expect(result.respondedAt).toBeDefined();
    });

    it('should emit hitl:form-responded with cancelled=true', async () => {
      const form = service.create(createValidInput());
      await service.cancel(form.id);

      expect(deps.events.emit).toHaveBeenCalledWith(
        'hitl:form-responded',
        expect.objectContaining({
          formId: form.id,
          cancelled: true,
        })
      );
    });

    it('should throw for unknown form ID', async () => {
      await expect(service.cancel('bad-id')).rejects.toThrow('Form not found');
    });

    it('should throw for non-pending form', async () => {
      const form = service.create(createValidInput());
      await service.cancel(form.id);

      await expect(service.cancel(form.id)).rejects.toThrow('is not pending');
    });

    it('should route cancellation to agent', async () => {
      const form = service.create(
        createValidInput({ callerType: 'agent', featureId: 'feat-1', projectPath: '/proj' })
      );
      await service.cancel(form.id);

      expect(deps.followUpFeature).toHaveBeenCalledWith(
        '/proj',
        'feat-1',
        expect.stringContaining('hitl_form_cancelled')
      );
    });
  });

  // ---------- Disk persistence ----------

  describe('disk persistence', () => {
    it('should load persisted forms on startup', async () => {
      const now = new Date();
      const persistedForms = [
        {
          id: 'hitl-abc',
          title: 'Persisted Form',
          status: 'pending',
          callerType: 'api',
          projectPath: '/test/project',
          steps: [{ schema: {} }],
          createdAt: now.toISOString(),
          expiresAt: new Date(now.getTime() + 3600 * 1000).toISOString(),
        },
      ];

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(persistedForms));

      const loadDeps = createMockDeps({
        getKnownProjectPaths: () => ['/test/project'],
      });
      const loadService = new HITLFormService(loadDeps);

      // Wait for async loadPersistedForms to complete
      await vi.advanceTimersByTimeAsync(0);

      const form = loadService.get('hitl-abc');
      expect(form).toBeDefined();
      expect(form!.title).toBe('Persisted Form');

      loadService.shutdown();
    });

    it('should skip expired persisted forms', async () => {
      const now = new Date();
      const persistedForms = [
        {
          id: 'hitl-expired',
          title: 'Expired Form',
          status: 'pending',
          callerType: 'api',
          projectPath: '/test/project',
          steps: [{ schema: {} }],
          createdAt: new Date(now.getTime() - 7200 * 1000).toISOString(),
          expiresAt: new Date(now.getTime() - 3600 * 1000).toISOString(),
        },
      ];

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(persistedForms));

      const loadDeps = createMockDeps({
        getKnownProjectPaths: () => ['/test/project'],
      });
      const loadService = new HITLFormService(loadDeps);
      await vi.advanceTimersByTimeAsync(0);

      expect(loadService.get('hitl-expired')).toBeUndefined();

      loadService.shutdown();
    });

    it('should handle missing disk file gracefully', async () => {
      vi.mocked(fs.readFile).mockRejectedValue({ code: 'ENOENT' });

      const loadDeps = createMockDeps({
        getKnownProjectPaths: () => ['/nonexistent'],
      });
      const loadService = new HITLFormService(loadDeps);
      await vi.advanceTimersByTimeAsync(0);

      expect(loadService.listPending()).toHaveLength(0);

      loadService.shutdown();
    });

    it('should use atomic writes (temp file + rename)', async () => {
      service.create(createValidInput({ projectPath: '/proj' }));

      // Flush async fire-and-forget saveToDisk
      await vi.advanceTimersByTimeAsync(0);

      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('.tmp.'),
        expect.any(String),
        'utf-8'
      );
      expect(fs.rename).toHaveBeenCalled();
    });
  });

  // ---------- cleanup() ----------

  describe('cleanup', () => {
    it('should expire forms past TTL during cleanup', () => {
      const form = service.create(createValidInput({ ttlSeconds: 60 }));

      // Advance past TTL but within cleanup interval
      vi.advanceTimersByTime(61 * 1000);

      // Trigger cleanup (runs every 5 minutes)
      vi.advanceTimersByTime(5 * 60 * 1000);

      expect(service.get(form.id)!.status).toBe('expired');
    });

    it('should purge old non-pending forms after 24 hours', () => {
      const form = service.create(createValidInput({ ttlSeconds: 60 }));
      vi.advanceTimersByTime(61 * 1000);

      // Advance past purge threshold (24h)
      vi.advanceTimersByTime(25 * 60 * 60 * 1000);

      // Trigger cleanup
      vi.advanceTimersByTime(5 * 60 * 1000);

      expect(service.get(form.id)).toBeUndefined();
    });
  });

  // ---------- shutdown() ----------

  describe('shutdown', () => {
    it('should clear all forms', () => {
      service.create(createValidInput());
      service.shutdown();

      expect(service.listPending()).toHaveLength(0);
    });
  });
});
