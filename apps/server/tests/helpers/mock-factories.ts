/**
 * Typed Mock Factories
 *
 * Provides reusable, properly-typed mock objects for unit tests.
 * Factories return typed Partials with vi.fn() stubs — no `as any` casts required.
 *
 * Usage:
 *   const featureLoader = createMockFeatureLoader();
 *   featureLoader.getAll.mockResolvedValue([...]);
 *
 * All factories accept an optional `overrides` object to customize specific methods.
 */

import { vi } from 'vitest';
import type { Feature, EventType, EventCallback, TypedEventCallback } from '@protolabsai/types';
import type { FeatureLoader } from '../../src/services/feature-loader.js';
import type { SettingsService } from '../../src/services/settings-service.js';
import type { ProjectService } from '../../src/services/project-service.js';
import type { MetricsService } from '../../src/services/metrics-service.js';
import type { EventEmitter, UnsubscribeFn } from '../../src/lib/events.js';

// ---------------------------------------------------------------------------
// FeatureLoader
// ---------------------------------------------------------------------------

export type MockFeatureLoader = {
  getAll: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  findByTitle: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  claim: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
  setEventEmitter: ReturnType<typeof vi.fn>;
  setIntegrityWatchdog: ReturnType<typeof vi.fn>;
} & Partial<FeatureLoader>;

export function createMockFeatureLoader(
  features: Feature[] = [],
  overrides: Partial<MockFeatureLoader> = {}
): MockFeatureLoader {
  return {
    getAll: vi.fn().mockResolvedValue(features),
    get: vi.fn().mockImplementation(async (_path: string, id: string) => {
      return features.find((f) => f.id === id) ?? null;
    }),
    findByTitle: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue(null),
    update: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(false),
    claim: vi.fn().mockResolvedValue(true),
    release: vi.fn().mockResolvedValue(undefined),
    setEventEmitter: vi.fn(),
    setIntegrityWatchdog: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// SettingsService
// ---------------------------------------------------------------------------

export type MockSettingsService = {
  getProjectSettings: ReturnType<typeof vi.fn>;
  updateProjectSettings: ReturnType<typeof vi.fn>;
  getGlobalSettings: ReturnType<typeof vi.fn>;
  updateGlobalSettings: ReturnType<typeof vi.fn>;
  hasProjectSettings: ReturnType<typeof vi.fn>;
} & Partial<SettingsService>;

export function createMockSettingsService(
  overrides: Partial<MockSettingsService> = {}
): MockSettingsService {
  return {
    getProjectSettings: vi.fn().mockResolvedValue({}),
    updateProjectSettings: vi.fn().mockResolvedValue({}),
    getGlobalSettings: vi.fn().mockResolvedValue({}),
    updateGlobalSettings: vi.fn().mockResolvedValue({}),
    hasProjectSettings: vi.fn().mockResolvedValue(false),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// ProjectService
// ---------------------------------------------------------------------------

export type MockProjectService = {
  getProject: ReturnType<typeof vi.fn>;
  updateProject: ReturnType<typeof vi.fn>;
  listProjects: ReturnType<typeof vi.fn>;
  createProject: ReturnType<typeof vi.fn>;
  deleteProject: ReturnType<typeof vi.fn>;
} & Partial<ProjectService>;

export function createMockProjectService(
  overrides: Partial<MockProjectService> = {}
): MockProjectService {
  return {
    getProject: vi.fn().mockResolvedValue(null),
    updateProject: vi.fn().mockResolvedValue(undefined),
    listProjects: vi.fn().mockResolvedValue([]),
    createProject: vi.fn().mockResolvedValue(null),
    deleteProject: vi.fn().mockResolvedValue(false),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// MetricsService
// ---------------------------------------------------------------------------

export type MockMetricsService = {
  getProjectMetrics: ReturnType<typeof vi.fn>;
  getCapacityMetrics: ReturnType<typeof vi.fn>;
  generateImpactReport: ReturnType<typeof vi.fn>;
} & Partial<MetricsService>;

export function createMockMetricsService(
  overrides: Partial<MockMetricsService> = {}
): MockMetricsService {
  return {
    getProjectMetrics: vi.fn().mockResolvedValue({}),
    getCapacityMetrics: vi.fn().mockResolvedValue({}),
    generateImpactReport: vi.fn().mockResolvedValue(''),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// EventEmitter
// ---------------------------------------------------------------------------

export type MockEventEmitter = EventEmitter & {
  emit: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  /** Fire a raw event to all subscribers (test helper) */
  _fire(type: EventType, payload: unknown): void;
};

export function createMockEventEmitter(
  overrides: Partial<MockEventEmitter> = {}
): MockEventEmitter {
  const subscribers: Array<EventCallback> = [];

  function makeUnsub(fn: () => void): UnsubscribeFn {
    const unsub = fn as UnsubscribeFn;
    unsub.unsubscribe = fn;
    return unsub;
  }

  function dispatch(type: EventType, payload: unknown): void {
    for (const cb of subscribers) cb(type, payload);
  }

  const emitter: MockEventEmitter = {
    // emit is both a spy AND actually dispatches to subscribers,
    // so tests can trigger service handlers via emit() and also assert on calls.
    emit: vi.fn((type: EventType, payload: unknown) => {
      dispatch(type, payload);
    }),
    subscribe: vi.fn((cb: EventCallback) => {
      subscribers.push(cb);
      return makeUnsub(() => {
        const idx = subscribers.indexOf(cb);
        if (idx >= 0) subscribers.splice(idx, 1);
      });
    }),
    on: vi.fn((_type: EventType, _cb: TypedEventCallback<EventType>) => {
      return makeUnsub(() => {});
    }),
    // _fire is an alias for dispatch — useful when you want to inject events
    // without adding a spy call to emit's history.
    _fire(type: EventType, payload: unknown) {
      dispatch(type, payload);
    },
    ...overrides,
  };

  return emitter;
}
