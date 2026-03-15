/**
 * Badge stories — example component for the playground.
 * Replace with your generated components from @@PROJECT_NAME-codegen.
 */

import React from 'react';
import type { StoryExport, StoryMeta } from '../routes/playground';

// ─── Component ────────────────────────────────────────────────────────────────

function Badge({
  label = 'Badge',
  variant = 'default',
  size = 'md',
}: {
  label?: string;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  size?: 'sm' | 'md';
}) {
  const variantStyles: Record<string, React.CSSProperties> = {
    default: { background: '#f1f5f9', color: '#475569' },
    success: { background: '#dcfce7', color: '#166534' },
    warning: { background: '#fef9c3', color: '#854d0e' },
    danger: { background: '#fee2e2', color: '#991b1b' },
    info: { background: '#dbeafe', color: '#1e40af' },
  };

  const sizeStyles: Record<string, React.CSSProperties> = {
    sm: { padding: '2px 8px', fontSize: 11 },
    md: { padding: '4px 10px', fontSize: 12 },
  };

  return (
    <span
      style={{
        ...(variantStyles[variant] ?? variantStyles.default),
        ...(sizeStyles[size] ?? sizeStyles.md),
        borderRadius: 999,
        fontWeight: 600,
        fontFamily: 'inherit',
        display: 'inline-block',
        lineHeight: 1.4,
      }}
    >
      {label}
    </span>
  );
}

// ─── Story meta ───────────────────────────────────────────────────────────────

export default {
  title: 'Components/Badge',
  component: Badge as React.ComponentType<Record<string, unknown>>,
  argTypes: {
    label: { control: 'text', defaultValue: 'Badge' },
    variant: {
      control: 'select',
      options: ['default', 'success', 'warning', 'danger', 'info'],
      defaultValue: 'default',
    },
    size: { control: 'select', options: ['sm', 'md'], defaultValue: 'md' },
  },
} satisfies StoryMeta;

// ─── Stories ──────────────────────────────────────────────────────────────────

export const Default: StoryExport = { name: 'Default', args: {} };
export const Success: StoryExport = {
  name: 'Success',
  args: { label: 'Shipped', variant: 'success' },
};
export const Warning: StoryExport = {
  name: 'Warning',
  args: { label: 'Pending', variant: 'warning' },
};
export const Danger: StoryExport = { name: 'Danger', args: { label: 'Failed', variant: 'danger' } };
export const Info: StoryExport = { name: 'Info', args: { label: 'Beta', variant: 'info' } };
