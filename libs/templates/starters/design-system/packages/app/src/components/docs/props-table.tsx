/**
 * PropsTable
 *
 * Renders a formatted table of component props auto-generated from the
 * story's `argTypes` definition.  Each row shows: name, type, required flag,
 * default value, and a description.
 */

import type { ArgType } from '../playground/types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PropsTableProps {
  /** Record of arg name → ArgType metadata (from StoryMeta.argTypes). */
  argTypes: Record<string, ArgType>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Map the ArgType control to a TypeScript-style type string. */
function controlToType(arg: ArgType): string {
  switch (arg.control) {
    case 'boolean':
      return 'boolean';
    case 'number':
    case 'range':
      return 'number';
    case 'color':
      return 'string (CSS color)';
    case 'select':
      if (arg.options && arg.options.length > 0) {
        return arg.options.map((o) => `'${o}'`).join(' | ');
      }
      return 'string';
    case 'text':
    default:
      return 'string';
  }
}

function formatDefault(value: unknown): string {
  if (value === undefined || value === null) return '—';
  if (typeof value === 'string') return `'${value}'`;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 13,
  lineHeight: 1.5,
};

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 12px',
  borderBottom: '2px solid var(--pg-border, #e2e8f0)',
  color: 'var(--pg-fg-muted, #64748b)',
  fontWeight: 600,
  fontSize: 12,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderBottom: '1px solid var(--pg-border, #e2e8f0)',
  verticalAlign: 'top',
};

const codeStyle: React.CSSProperties = {
  fontFamily: 'ui-monospace, "Cascadia Code", "Source Code Pro", Menlo, monospace',
  fontSize: 12,
  background: 'var(--pg-code-bg, #f1f5f9)',
  padding: '1px 5px',
  borderRadius: 4,
  color: 'var(--pg-code-fg, #0f172a)',
  whiteSpace: 'nowrap',
};

const requiredBadgeStyle: React.CSSProperties = {
  display: 'inline-block',
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.04em',
  color: 'var(--pg-danger, #dc2626)',
  background: 'var(--pg-danger-bg, #fee2e2)',
  padding: '1px 5px',
  borderRadius: 4,
  textTransform: 'uppercase',
};

const optionalStyle: React.CSSProperties = {
  color: 'var(--pg-fg-muted, #94a3b8)',
  fontSize: 11,
};

// ─── Component ────────────────────────────────────────────────────────────────

// React is needed for JSX transform
import React from 'react';

export function PropsTable({ argTypes }: PropsTableProps) {
  const rows = Object.entries(argTypes);

  if (rows.length === 0) {
    return (
      <p style={{ color: 'var(--pg-fg-muted, #94a3b8)', fontSize: 13, margin: 0 }}>
        No props documented for this component.
      </p>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Prop</th>
            <th style={thStyle}>Type</th>
            <th style={thStyle}>Default</th>
            <th style={thStyle}>Description</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([name, arg]) => (
            <tr key={name}>
              {/* Name */}
              <td style={tdStyle}>
                <code style={codeStyle}>{name}</code>
              </td>

              {/* Type */}
              <td style={tdStyle}>
                <code style={{ ...codeStyle, color: 'var(--pg-type-fg, #7c3aed)' }}>
                  {controlToType(arg)}
                </code>
              </td>

              {/* Default */}
              <td style={tdStyle}>
                {arg.defaultValue !== undefined ? (
                  <code style={{ ...codeStyle, color: 'var(--pg-value-fg, #059669)' }}>
                    {formatDefault(arg.defaultValue)}
                  </code>
                ) : (
                  <span style={requiredBadgeStyle}>required</span>
                )}
              </td>

              {/* Description */}
              <td style={{ ...tdStyle, color: 'var(--pg-fg, #334155)' }}>
                {arg.description ? arg.description : <span style={optionalStyle}>—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
