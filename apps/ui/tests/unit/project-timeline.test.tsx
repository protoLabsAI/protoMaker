/**
 * Unit tests for ProjectTimeline event rendering logic.
 *
 * Tests cover:
 * - getEventDisplayConfig returns correct config for each event type
 * - Unknown event types fall back to a default config
 * - Each event type has distinct icon name and label
 */

import { describe, it, expect } from 'vitest';
import {
  getEventDisplayConfig,
  EVENT_DISPLAY_CONFIG,
  DEFAULT_EVENT_DISPLAY_CONFIG,
  type TimelineEventType,
} from '@/components/views/projects/timeline-utils';

const KNOWN_EVENT_TYPES: TimelineEventType[] = [
  'feature:done',
  'milestone:completed',
  'ceremony:fired',
  'escalation',
  'pr:merged',
];

describe('getEventDisplayConfig', () => {
  it('returns a config object for every known event type', () => {
    for (const type of KNOWN_EVENT_TYPES) {
      const config = getEventDisplayConfig(type);
      expect(config).toBeDefined();
      expect(config.label).toBeTruthy();
      expect(config.iconName).toBeTruthy();
      expect(config.color).toBeTruthy();
    }
  });

  it('each event type has a distinct label', () => {
    const labels = KNOWN_EVENT_TYPES.map((t) => getEventDisplayConfig(t).label);
    const uniqueLabels = new Set(labels);
    expect(uniqueLabels.size).toBe(KNOWN_EVENT_TYPES.length);
  });

  it('each event type has a distinct icon name', () => {
    const icons = KNOWN_EVENT_TYPES.map((t) => getEventDisplayConfig(t).iconName);
    const uniqueIcons = new Set(icons);
    expect(uniqueIcons.size).toBe(KNOWN_EVENT_TYPES.length);
  });

  it('feature:done has CheckCircle icon and Feature Done label', () => {
    const config = getEventDisplayConfig('feature:done');
    expect(config.label).toBe('Feature Done');
    expect(config.iconName).toBe('CheckCircle');
  });

  it('milestone:completed has Trophy icon and Milestone label', () => {
    const config = getEventDisplayConfig('milestone:completed');
    expect(config.label).toBe('Milestone');
    expect(config.iconName).toBe('Trophy');
  });

  it('ceremony:fired has PartyPopper icon and label including Ceremony', () => {
    const config = getEventDisplayConfig('ceremony:fired');
    expect(config.label).toMatch(/ceremony/i);
    expect(config.iconName).toBe('PartyPopper');
  });

  it('escalation has AlertTriangle icon and Escalation label', () => {
    const config = getEventDisplayConfig('escalation');
    expect(config.label).toMatch(/escalation/i);
    expect(config.iconName).toBe('AlertTriangle');
  });

  it('pr:merged has GitMerge icon and PR label', () => {
    const config = getEventDisplayConfig('pr:merged');
    expect(config.label).toMatch(/pr/i);
    expect(config.iconName).toBe('GitMerge');
  });

  it('unknown event type returns the default fallback config', () => {
    const config = getEventDisplayConfig('some:unknown:type');
    expect(config).toEqual(DEFAULT_EVENT_DISPLAY_CONFIG);
  });

  it('fallback config label is Activity', () => {
    const config = getEventDisplayConfig('totally-unknown');
    expect(config.label).toBe('Activity');
    expect(config.iconName).toBe('Activity');
  });

  it('EVENT_DISPLAY_CONFIG covers all required event types', () => {
    const required: TimelineEventType[] = [
      'feature:done',
      'milestone:completed',
      'ceremony:fired',
      'escalation',
      'pr:merged',
    ];
    for (const type of required) {
      expect(EVENT_DISPLAY_CONFIG[type]).toBeDefined();
    }
  });
});

describe('empty state handling', () => {
  it('DEFAULT_EVENT_DISPLAY_CONFIG is defined and has required fields', () => {
    expect(DEFAULT_EVENT_DISPLAY_CONFIG.label).toBeTruthy();
    expect(DEFAULT_EVENT_DISPLAY_CONFIG.iconName).toBeTruthy();
    expect(DEFAULT_EVENT_DISPLAY_CONFIG.color).toBeTruthy();
  });
});
