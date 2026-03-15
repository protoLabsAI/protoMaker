/**
 * Card stories — example component for the playground.
 * Replace with your generated components from @@PROJECT_NAME-codegen.
 */

import React from 'react';
import type { StoryExport, StoryMeta } from '../routes/playground';

// ─── Component ────────────────────────────────────────────────────────────────

function Card({
  title = 'Card title',
  description = 'A brief description of the card content.',
  accentColor = 'oklch(0.55 0.20 250)',
  showAccentBar = true,
  padding = 24,
  shadow = true,
}: {
  title?: string;
  description?: string;
  accentColor?: string;
  showAccentBar?: boolean;
  padding?: number;
  shadow?: boolean;
}) {
  return (
    <div
      style={{
        borderRadius: 12,
        border: '1px solid #e2e8f0',
        overflow: 'hidden',
        boxShadow: shadow ? '0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)' : 'none',
        maxWidth: 360,
        backgroundColor: '#fff',
        fontFamily: 'inherit',
      }}
    >
      {showAccentBar && <div style={{ height: 4, backgroundColor: accentColor }} />}
      <div style={{ padding }}>
        <h3
          style={{
            margin: '0 0 8px',
            fontSize: 16,
            fontWeight: 600,
            color: '#0f172a',
            lineHeight: 1.3,
          }}
        >
          {title}
        </h3>
        <p
          style={{
            margin: 0,
            fontSize: 14,
            color: '#64748b',
            lineHeight: 1.6,
          }}
        >
          {description}
        </p>
      </div>
    </div>
  );
}

// ─── Story meta ───────────────────────────────────────────────────────────────

export default {
  title: 'Components/Card',
  component: Card as React.ComponentType<Record<string, unknown>>,
  argTypes: {
    title: { control: 'text', defaultValue: 'Card title' },
    description: {
      control: 'text',
      defaultValue: 'A brief description of the card content.',
    },
    accentColor: {
      control: 'color',
      defaultValue: 'oklch(0.55 0.20 250)',
      description: 'Top accent bar color',
    },
    showAccentBar: { control: 'boolean', defaultValue: true },
    padding: {
      control: 'range',
      defaultValue: 24,
      min: 8,
      max: 48,
      step: 4,
      description: 'Inner padding (px)',
    },
    shadow: { control: 'boolean', defaultValue: true },
  },
} satisfies StoryMeta;

// ─── Stories ──────────────────────────────────────────────────────────────────

export const Default: StoryExport = {
  name: 'Default',
  args: {},
};

export const Compact: StoryExport = {
  name: 'Compact',
  args: { padding: 16, title: 'Compact card' },
};

export const NoAccent: StoryExport = {
  name: 'No accent',
  args: { showAccentBar: false, shadow: false },
};

export const Highlighted: StoryExport = {
  name: 'Highlighted',
  args: {
    title: 'Highlighted card',
    accentColor: 'oklch(0.60 0.20 145)',
    description: 'This card uses a green accent to highlight important content.',
  },
};
