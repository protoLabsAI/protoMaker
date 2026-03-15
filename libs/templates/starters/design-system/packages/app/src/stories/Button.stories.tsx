/**
 * Button stories — example component for the playground.
 * Replace with your generated components from @@PROJECT_NAME-codegen.
 */

import React from 'react';
import type { StoryExport, StoryMeta } from '../routes/playground';

// ─── Component (inline demo — replace with your generated component) ──────────

function Button({
  label = 'Button',
  variant = 'primary',
  size = 'md',
  disabled = false,
  fullWidth = false,
}: {
  label?: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  fullWidth?: boolean;
}) {
  const sizes: Record<string, React.CSSProperties> = {
    sm: { padding: '5px 12px', fontSize: 12 },
    md: { padding: '8px 16px', fontSize: 14 },
    lg: { padding: '12px 24px', fontSize: 16 },
  };

  const variants: Record<string, React.CSSProperties> = {
    primary: {
      background: 'oklch(0.55 0.20 250)',
      color: '#fff',
      border: 'none',
    },
    secondary: {
      background: '#f1f5f9',
      color: '#0f172a',
      border: '1px solid #e2e8f0',
    },
    danger: {
      background: 'oklch(0.55 0.22 25)',
      color: '#fff',
      border: 'none',
    },
    ghost: {
      background: 'transparent',
      color: '#374151',
      border: '1px solid transparent',
    },
  };

  return (
    <button
      disabled={disabled}
      style={{
        ...(sizes[size] ?? sizes.md),
        ...(variants[variant] ?? variants.primary),
        borderRadius: 8,
        fontWeight: 500,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: fullWidth ? '100%' : undefined,
        fontFamily: 'inherit',
        lineHeight: 1,
        transition: 'opacity 0.15s',
      }}
    >
      {label}
    </button>
  );
}

// ─── Story meta ───────────────────────────────────────────────────────────────

export default {
  title: 'Components/Button',
  component: Button as React.ComponentType<Record<string, unknown>>,
  argTypes: {
    label: { control: 'text', defaultValue: 'Click me', description: 'Button text' },
    variant: {
      control: 'select',
      options: ['primary', 'secondary', 'danger', 'ghost'],
      defaultValue: 'primary',
      description: 'Visual style',
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
      defaultValue: 'md',
      description: 'Button size',
    },
    disabled: { control: 'boolean', defaultValue: false, description: 'Disable interaction' },
    fullWidth: { control: 'boolean', defaultValue: false, description: 'Expand to full width' },
  },
} satisfies StoryMeta;

// ─── Stories ──────────────────────────────────────────────────────────────────

export const Primary: StoryExport = {
  name: 'Primary',
  args: { label: 'Get started', variant: 'primary' },
};

export const Secondary: StoryExport = {
  name: 'Secondary',
  args: { label: 'Learn more', variant: 'secondary' },
};

export const Danger: StoryExport = {
  name: 'Danger',
  args: { label: 'Delete account', variant: 'danger' },
};

export const Ghost: StoryExport = {
  name: 'Ghost',
  args: { label: 'Cancel', variant: 'ghost' },
};

export const Large: StoryExport = {
  name: 'Large',
  args: { label: 'Create project', size: 'lg' },
};

export const Small: StoryExport = {
  name: 'Small',
  args: { label: 'View all', size: 'sm', variant: 'secondary' },
};

export const Disabled: StoryExport = {
  name: 'Disabled',
  args: { label: 'Unavailable', disabled: true },
};

export const FullWidth: StoryExport = {
  name: 'Full width',
  args: { label: 'Submit', fullWidth: true },
};
