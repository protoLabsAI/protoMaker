import { describe, it, expect, beforeEach } from 'vitest';
import { ContextAggregator } from '../../../src/services/context-aggregator.js';
import { SensorRegistryService } from '../../../src/services/sensor-registry-service.js';

describe('ContextAggregator', () => {
  let registry: SensorRegistryService;
  let aggregator: ContextAggregator;

  beforeEach(() => {
    registry = new SensorRegistryService();
    aggregator = new ContextAggregator(registry);
  });

  it('returns unknown when no sensors registered', () => {
    const state = aggregator.getPresenceState();
    expect(state.status).toBe('unknown');
    expect(state.confidence).toBe(0);
    expect(state.sensors).toHaveLength(0);
  });

  it('returns unknown when sensors registered but no readings yet', () => {
    registry.register({ id: 'test-sensor', name: 'Test' });
    const state = aggregator.getPresenceState();
    expect(state.status).toBe('unknown');
  });

  it('detects headless status when builtin:websocket-clients reports 0 clients', () => {
    registry.startBuiltinSensors();

    const state = aggregator.getPresenceState();
    expect(state.status).toBe('headless');
    expect(state.sensors).toContain('builtin:websocket-clients');
  });

  it('returns active when websocket clients are connected', () => {
    registry.startBuiltinSensors();
    // Update client count to 1 (simulating a connected UI client)
    registry.notifyWebSocketClientCount(1);

    const state = aggregator.getPresenceState();
    // With no other sensors reporting away/idle, status should be active
    expect(state.status).toBe('active');
  });

  it('detects afk status when a sensor reports presence: away', () => {
    registry.startBuiltinSensors();
    // Simulate a connected client (not headless)
    registry.notifyWebSocketClientCount(1);

    // Register an external presence sensor reporting away
    registry.register({ id: 'ext:presence', name: 'Presence Sensor' });
    registry.report({ sensorId: 'ext:presence', data: { presence: 'away' } });

    const state = aggregator.getPresenceState();
    expect(state.status).toBe('afk');
    expect(state.sensors).toContain('ext:presence');
  });

  it('detects idle status when electron-idle reports high idle time', () => {
    registry.startBuiltinSensors();
    // Simulate a connected client (not headless)
    registry.notifyWebSocketClientCount(1);

    // Manually report high idle time to the electron-idle sensor
    registry.report({ sensorId: 'builtin:electron-idle', data: { idleSeconds: 400 } });

    const state = aggregator.getPresenceState();
    expect(state.status).toBe('idle');
    expect(state.sensors).toContain('builtin:electron-idle');
  });

  it('does not report idle when electron-idle reports low idle time', () => {
    registry.startBuiltinSensors();
    registry.notifyWebSocketClientCount(1);

    // Report low idle time (below threshold)
    registry.report({ sensorId: 'builtin:electron-idle', data: { idleSeconds: 60 } });

    const state = aggregator.getPresenceState();
    expect(state.status).toBe('active');
  });

  it('applies precedence: headless > afk', () => {
    registry.startBuiltinSensors();
    // Keep 0 WebSocket clients (headless)

    // Register an external presence sensor reporting away
    registry.register({ id: 'ext:presence', name: 'Presence Sensor' });
    registry.report({ sensorId: 'ext:presence', data: { presence: 'away' } });

    const state = aggregator.getPresenceState();
    // headless takes priority over afk
    expect(state.status).toBe('headless');
  });

  it('applies precedence: afk > idle', () => {
    registry.startBuiltinSensors();
    registry.notifyWebSocketClientCount(1); // Not headless

    // Report high idle time
    registry.report({ sensorId: 'builtin:electron-idle', data: { idleSeconds: 400 } });

    // Also have an away sensor
    registry.register({ id: 'ext:presence', name: 'Presence Sensor' });
    registry.report({ sensorId: 'ext:presence', data: { presence: 'away' } });

    const state = aggregator.getPresenceState();
    // afk takes priority over idle
    expect(state.status).toBe('afk');
  });

  it('includes lastActivity timestamp from the most recent reading', () => {
    registry.startBuiltinSensors();
    registry.notifyWebSocketClientCount(1);

    const before = new Date().toISOString();
    registry.report({ sensorId: 'builtin:electron-idle', data: { idleSeconds: 10 } });
    const after = new Date().toISOString();

    const state = aggregator.getPresenceState();
    expect(state.lastActivity).toBeDefined();
    expect(state.lastActivity! >= before).toBe(true);
    expect(state.lastActivity! <= after).toBe(true);
  });

  it('calculates confidence based on active sensor ratio', () => {
    registry.startBuiltinSensors();
    // With builtin sensors just registered, they are active
    const state = aggregator.getPresenceState();
    expect(state.confidence).toBeGreaterThanOrEqual(0);
    expect(state.confidence).toBeLessThanOrEqual(1);
  });

  it('formatPresenceSection returns valid markdown', () => {
    registry.startBuiltinSensors();
    const section = aggregator.formatPresenceSection();
    expect(section).toContain('## User Presence');
    expect(section).toContain('**Status:**');
    expect(section).toContain('**Confidence:**');
  });

  it('formatPresenceSection includes sensor list for non-unknown states', () => {
    registry.startBuiltinSensors(); // headless state
    const section = aggregator.formatPresenceSection();
    expect(section).toContain('**Contributing Sensors:**');
  });

  it('stopBuiltinSensors cleans up without errors', () => {
    registry.startBuiltinSensors();
    expect(() => registry.stopBuiltinSensors()).not.toThrow();
  });

  it('notifyWebSocketClientCount updates client count correctly', () => {
    registry.startBuiltinSensors();

    // Initially 0 clients → headless
    expect(aggregator.getPresenceState().status).toBe('headless');

    // Simulate a client connecting
    registry.notifyWebSocketClientCount(1);
    expect(aggregator.getPresenceState().status).toBe('active');

    // Simulate client disconnecting
    registry.notifyWebSocketClientCount(0);
    expect(aggregator.getPresenceState().status).toBe('headless');
  });
});
