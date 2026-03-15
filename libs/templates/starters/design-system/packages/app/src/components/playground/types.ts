import type React from 'react';

// ─── Theme ───────────────────────────────────────────────────────────────────

export type Theme = 'light' | 'dark';

// ─── Viewport ────────────────────────────────────────────────────────────────

export interface ViewportPreset {
  label: string;
  width: number; // 0 = full width
  height: number | null; // null = natural height
}

// ─── Story format (CSF-inspired) ─────────────────────────────────────────────

export type ControlType = 'text' | 'boolean' | 'number' | 'select' | 'color' | 'range';

export interface ArgType {
  control: ControlType;
  defaultValue?: unknown;
  options?: string[]; // for 'select'
  min?: number; // for 'number' / 'range'
  max?: number;
  step?: number;
  description?: string;
}

export interface StoryMeta {
  /** Slash-separated path: "Category/ComponentName" */
  title: string;
  component: React.ComponentType<Record<string, unknown>>;
  argTypes?: Record<string, ArgType>;
  parameters?: Record<string, unknown>;
}

export interface StoryExport {
  args?: Record<string, unknown>;
  name?: string;
  parameters?: Record<string, unknown>;
}

// ─── Parsed entry (internal) ─────────────────────────────────────────────────

export interface StoryEntry {
  /** Unique id: "Category/ComponentName/StoryName" */
  id: string;
  /** e.g. "Components/Button" */
  title: string;
  /** e.g. "Button" */
  componentName: string;
  /** e.g. "Components" */
  category: string;
  /** e.g. "Primary" */
  storyName: string;
  meta: StoryMeta;
  story: StoryExport;
  defaultArgs: Record<string, unknown>;
}
