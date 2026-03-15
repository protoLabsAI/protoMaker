import React from 'react';
import type { ArgType } from './types';

// ─── Props ────────────────────────────────────────────────────────────────────

interface PropsEditorProps {
  argTypes: Record<string, ArgType>;
  args: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function PropsEditor({ argTypes, args, onChange }: PropsEditorProps) {
  const entries = Object.entries(argTypes);

  return (
    <div>
      {/* Header */}
      <div
        style={{
          padding: '10px 16px',
          borderBottom: '1px solid var(--pg-border, #e2e8f0)',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--pg-muted, #64748b)',
          position: 'sticky',
          top: 0,
          backgroundColor: 'var(--pg-sidebar, #fff)',
          zIndex: 1,
        }}
      >
        Props
      </div>

      {entries.length === 0 ? (
        <div
          style={{
            padding: '16px',
            fontSize: 13,
            color: 'var(--pg-muted, #94a3b8)',
            textAlign: 'center',
          }}
        >
          No props defined.
          <br />
          <span style={{ fontSize: 12 }}>
            Add <code style={{ fontFamily: 'monospace' }}>argTypes</code> to your story.
          </span>
        </div>
      ) : (
        <div>
          {entries.map(([key, argType]) => (
            <PropRow
              key={key}
              propKey={key}
              argType={argType}
              value={args[key]}
              onChange={(v) => onChange(key, v)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Individual prop row ──────────────────────────────────────────────────────

interface PropRowProps {
  propKey: string;
  argType: ArgType;
  value: unknown;
  onChange: (value: unknown) => void;
}

function PropRow({ propKey, argType, value, onChange }: PropRowProps) {
  return (
    <div
      style={{
        padding: '10px 16px',
        borderBottom: '1px solid var(--pg-border-subtle, #f1f5f9)',
      }}
    >
      {/* Label row */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 4,
          gap: 8,
        }}
      >
        <label
          htmlFor={`prop-${propKey}`}
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--pg-fg, #374151)',
            fontFamily: 'monospace',
            cursor: 'pointer',
          }}
        >
          {propKey}
        </label>
        <span
          style={{
            fontSize: 10,
            color: 'var(--pg-muted, #94a3b8)',
            fontFamily: 'monospace',
            flexShrink: 0,
          }}
        >
          {argType.control}
        </span>
      </div>

      {/* Description */}
      {argType.description && (
        <div
          style={{
            fontSize: 11,
            color: 'var(--pg-muted, #94a3b8)',
            marginBottom: 6,
            lineHeight: 1.5,
          }}
        >
          {argType.description}
        </div>
      )}

      {/* Control widget */}
      <ControlWidget propKey={propKey} argType={argType} value={value} onChange={onChange} />
    </div>
  );
}

// ─── Control widgets ──────────────────────────────────────────────────────────

interface ControlWidgetProps {
  propKey: string;
  argType: ArgType;
  value: unknown;
  onChange: (value: unknown) => void;
}

const inputBase: React.CSSProperties = {
  width: '100%',
  padding: '5px 8px',
  fontSize: 12,
  border: '1px solid var(--pg-border, #e2e8f0)',
  borderRadius: 6,
  outline: 'none',
  boxSizing: 'border-box',
  backgroundColor: 'var(--pg-input-bg, #f8fafc)',
  color: 'var(--pg-fg, #374151)',
  fontFamily: 'inherit',
};

function ControlWidget({ propKey, argType, value, onChange }: ControlWidgetProps) {
  const id = `prop-${propKey}`;

  switch (argType.control) {
    // ── Boolean ──────────────────────────────────────────────────────────────
    case 'boolean':
      return (
        <label
          htmlFor={id}
          style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
        >
          <input
            id={id}
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
            style={{
              width: 16,
              height: 16,
              cursor: 'pointer',
              accentColor: 'var(--pg-accent, #3b82f6)',
            }}
          />
          <span
            style={{ fontSize: 12, color: 'var(--pg-muted, #64748b)', fontFamily: 'monospace' }}
          >
            {String(Boolean(value))}
          </span>
        </label>
      );

    // ── Number ───────────────────────────────────────────────────────────────
    case 'number':
      return (
        <input
          id={id}
          type="number"
          value={value === undefined ? '' : String(value)}
          min={argType.min}
          max={argType.max}
          step={argType.step ?? 1}
          onChange={(e) => onChange(e.target.valueAsNumber)}
          style={inputBase}
        />
      );

    // ── Range slider ─────────────────────────────────────────────────────────
    case 'range': {
      const min = argType.min ?? 0;
      const max = argType.max ?? 100;
      const step = argType.step ?? 1;
      const current = typeof value === 'number' ? value : min;
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            id={id}
            type="range"
            min={min}
            max={max}
            step={step}
            value={current}
            onChange={(e) => onChange(e.target.valueAsNumber)}
            style={{ flex: 1, accentColor: 'var(--pg-accent, #3b82f6)' }}
          />
          <span
            style={{
              fontSize: 11,
              fontFamily: 'monospace',
              color: 'var(--pg-muted, #64748b)',
              minWidth: 30,
              textAlign: 'right',
            }}
          >
            {current}
          </span>
        </div>
      );
    }

    // ── Color ────────────────────────────────────────────────────────────────
    case 'color':
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            id={id}
            type="color"
            value={typeof value === 'string' ? value : '#000000'}
            onChange={(e) => onChange(e.target.value)}
            style={{
              width: 36,
              height: 28,
              padding: 2,
              border: '1px solid var(--pg-border, #e2e8f0)',
              borderRadius: 6,
              cursor: 'pointer',
              backgroundColor: 'transparent',
            }}
          />
          <span
            style={{
              fontSize: 11,
              fontFamily: 'monospace',
              color: 'var(--pg-muted, #64748b)',
            }}
          >
            {typeof value === 'string' ? value : ''}
          </span>
        </div>
      );

    // ── Select ───────────────────────────────────────────────────────────────
    case 'select':
      return (
        <select
          id={id}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          style={{ ...inputBase, cursor: 'pointer' }}
        >
          {argType.options?.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );

    // ── Text (default) ────────────────────────────────────────────────────────
    case 'text':
    default:
      return (
        <input
          id={id}
          type="text"
          value={value === undefined || value === null ? '' : String(value)}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Enter value…"
          style={inputBase}
        />
      );
  }
}
