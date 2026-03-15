/**
 * sidebar.tsx — Node palette and property inspector.
 *
 * Two modes:
 *   Palette   — shown when no node is selected; drag tiles onto the canvas
 *   Inspector — shown when a node is selected; edit its properties
 */

import type { Node } from '@xyflow/react';
import { NODE_SPECS } from './nodes.js';
import type { FlowNodeData, NodeKind } from './nodes.js';

// ── Props ─────────────────────────────────────────────────────────────────────

interface FlowSidebarProps {
  selectedNode: Node<FlowNodeData> | null;
  onNodeDataChange: (id: string, data: Partial<FlowNodeData>) => void;
  onDeleteNode: (id: string) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function FlowSidebar({ selectedNode, onNodeDataChange, onDeleteNode }: FlowSidebarProps) {
  return (
    <aside
      style={{
        width: 240,
        flexShrink: 0,
        borderLeft: '1px solid var(--border)',
        backgroundColor: 'var(--surface)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {selectedNode ? (
        <Inspector
          node={selectedNode}
          onChange={(patch) => onNodeDataChange(selectedNode.id, patch)}
          onDelete={() => onDeleteNode(selectedNode.id)}
        />
      ) : (
        <Palette />
      )}
    </aside>
  );
}

// ── Node palette ──────────────────────────────────────────────────────────────

function Palette() {
  const onDragStart = (event: React.DragEvent<HTMLDivElement>, kind: NodeKind) => {
    event.dataTransfer.setData('application/flow-node-kind', kind);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <>
      <SidebarHeader title="Nodes" subtitle="Drag onto the canvas" />

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px' }}>
        {NODE_SPECS.map((spec) => (
          <div
            key={spec.kind}
            draggable
            onDragStart={(e) => onDragStart(e, spec.kind)}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              padding: '9px 10px',
              marginBottom: 6,
              borderRadius: 8,
              border: `1px solid ${spec.accent}44`,
              background: spec.bg,
              cursor: 'grab',
              userSelect: 'none',
              transition: 'transform 0.1s, box-shadow 0.1s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLDivElement).style.transform = 'translateX(2px)';
              (e.currentTarget as HTMLDivElement).style.boxShadow = `0 2px 8px ${spec.accent}33`;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLDivElement).style.transform = '';
              (e.currentTarget as HTMLDivElement).style.boxShadow = '';
            }}
          >
            <span style={{ fontSize: 18, flexShrink: 0 }}>{spec.icon}</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 12, color: spec.accent }}>{spec.label}</div>
              <div
                style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4, marginTop: 1 }}
              >
                {spec.description}
              </div>
            </div>
          </div>
        ))}

        <div
          style={{
            marginTop: 16,
            padding: '10px',
            borderRadius: 8,
            border: '1px dashed var(--border)',
            fontSize: 11,
            color: 'var(--text-muted)',
            lineHeight: 1.5,
          }}
        >
          💡 <strong>Tips</strong>
          <ul style={{ margin: '6px 0 0', paddingLeft: 16 }}>
            <li>Drag a node to the canvas</li>
            <li>Click a node to inspect it</li>
            <li>Connect nodes by dragging handles</li>
            <li>Delete with Backspace</li>
          </ul>
        </div>
      </div>
    </>
  );
}

// ── Property inspector ────────────────────────────────────────────────────────

interface InspectorProps {
  node: Node<FlowNodeData>;
  onChange: (patch: Partial<FlowNodeData>) => void;
  onDelete: () => void;
}

function Inspector({ node, onChange, onDelete }: InspectorProps) {
  const { data } = node;
  const spec = NODE_SPECS.find((s) => s.kind === data.kind);
  if (!spec) return null;

  return (
    <>
      <SidebarHeader title={`${spec.icon} ${spec.label}`} subtitle={node.id} accent={spec.accent} />

      <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
        {/* Label */}
        <Field label="Label">
          <input
            type="text"
            value={data.label}
            onChange={(e) => onChange({ label: e.target.value })}
            style={inputStyle}
          />
        </Field>

        {/* Description */}
        <Field label="Description">
          <textarea
            rows={2}
            value={data.description ?? ''}
            onChange={(e) => onChange({ description: e.target.value })}
            style={{ ...inputStyle, resize: 'vertical' }}
            placeholder="Optional — describes what this node does"
          />
        </Field>

        {/* Kind-specific fields */}
        {data.kind === 'agent' && (
          <Field label="Model ID">
            <input
              type="text"
              value={data.model ?? ''}
              onChange={(e) => onChange({ model: e.target.value })}
              style={inputStyle}
              placeholder="claude-3-5-haiku-20241022"
            />
          </Field>
        )}

        {data.kind === 'tool' && (
          <Field label="Tool function name">
            <input
              type="text"
              value={data.toolName ?? ''}
              onChange={(e) => onChange({ toolName: e.target.value })}
              style={inputStyle}
              placeholder="myTool"
            />
          </Field>
        )}

        {data.kind === 'condition' && (
          <Field label="Routing condition">
            <textarea
              rows={2}
              value={data.condition ?? ''}
              onChange={(e) => onChange({ condition: e.target.value })}
              style={{ ...inputStyle, resize: 'vertical' }}
              placeholder="e.g. state.messages contains 'done'"
            />
          </Field>
        )}

        {data.kind === 'state' && (
          <Field label="State key">
            <input
              type="text"
              value={data.stateKey ?? ''}
              onChange={(e) => onChange({ stateKey: e.target.value })}
              style={inputStyle}
              placeholder="myField"
            />
          </Field>
        )}

        {/* Delete */}
        <button
          type="button"
          onClick={onDelete}
          style={{
            marginTop: 16,
            width: '100%',
            padding: '7px 12px',
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.4)',
            borderRadius: 6,
            color: '#ef4444',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          🗑 Delete node
        </button>
      </div>
    </>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function SidebarHeader({
  title,
  subtitle,
  accent,
}: {
  title: string;
  subtitle?: string;
  accent?: string;
}) {
  return (
    <div
      style={{
        padding: '12px 14px 10px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: accent ?? 'var(--foreground)',
        }}
      >
        {title}
      </div>
      {subtitle && (
        <div
          style={{
            fontSize: 10,
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono, monospace)',
            marginTop: 2,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {subtitle}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label
        style={{
          display: 'block',
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--text-secondary)',
          marginBottom: 4,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '5px 8px',
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--foreground)',
  fontSize: 12,
  fontFamily: 'inherit',
  outline: 'none',
};
