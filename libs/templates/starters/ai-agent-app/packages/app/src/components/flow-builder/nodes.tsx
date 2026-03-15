/**
 * nodes.tsx — Custom node components for the visual flow builder.
 *
 * Five node types, each colour-coded and wired up with React Flow handles:
 *   agent      — LLM call  (blue)
 *   tool       — Tool invocation (orange)
 *   condition  — Branching router (yellow)
 *   state      — State transform (teal)
 *   hitl       — Human-in-the-loop approval (purple)
 */

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps, Node } from '@xyflow/react';

// ── Data type ─────────────────────────────────────────────────────────────────

export type NodeKind = 'agent' | 'tool' | 'condition' | 'state' | 'hitl';

export interface FlowNodeData extends Record<string, unknown> {
  kind: NodeKind;
  label: string;
  description?: string;
  /** agent: Claude / GPT model id */
  model?: string;
  /** tool: name of the tool function */
  toolName?: string;
  /** condition: human-readable routing expression */
  condition?: string;
  /** state: key in the state annotation */
  stateKey?: string;
}

export type FlowNode = Node<FlowNodeData>;

// ── Palette metadata (used by the sidebar palette) ───────────────────────────

export interface NodeSpec {
  kind: NodeKind;
  label: string;
  description: string;
  icon: string;
  accent: string;
  bg: string;
}

export const NODE_SPECS: NodeSpec[] = [
  {
    kind: 'agent',
    label: 'Agent',
    description: 'LLM call — sends messages to a language model',
    icon: '🤖',
    accent: '#3b82f6',
    bg: 'rgba(59,130,246,0.12)',
  },
  {
    kind: 'tool',
    label: 'Tool',
    description: 'Tool invocation — runs a function or API',
    icon: '🔧',
    accent: '#f97316',
    bg: 'rgba(249,115,22,0.12)',
  },
  {
    kind: 'condition',
    label: 'Condition',
    description: 'Branching router — routes to different nodes',
    icon: '⑂',
    accent: '#eab308',
    bg: 'rgba(234,179,8,0.12)',
  },
  {
    kind: 'state',
    label: 'State',
    description: 'State transform — modifies the graph state',
    icon: '📦',
    accent: '#14b8a6',
    bg: 'rgba(20,184,166,0.12)',
  },
  {
    kind: 'hitl',
    label: 'Human',
    description: 'Human-in-the-loop — pauses for human review',
    icon: '👤',
    accent: '#a855f7',
    bg: 'rgba(168,85,247,0.12)',
  },
];

// ── Shared node shell ─────────────────────────────────────────────────────────

interface ShellProps {
  spec: NodeSpec;
  label: string;
  description?: string;
  selected?: boolean;
  children?: React.ReactNode;
  /** override number of output handles (default 1) */
  outputHandleCount?: number;
}

function NodeShell({
  spec,
  label,
  description,
  selected,
  children,
  outputHandleCount = 1,
}: ShellProps) {
  return (
    <div
      style={{
        minWidth: 160,
        maxWidth: 220,
        borderRadius: 10,
        border: `2px solid ${selected ? spec.accent : 'var(--border)'}`,
        backgroundColor: 'var(--surface)',
        boxShadow: selected ? `0 0 0 3px ${spec.accent}33` : '0 2px 8px rgba(0,0,0,0.35)',
        overflow: 'hidden',
        fontFamily: 'var(--font-sans, sans-serif)',
        fontSize: 12,
        transition: 'box-shadow 0.15s, border-color 0.15s',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '7px 10px 6px',
          background: spec.bg,
          borderBottom: `1px solid ${spec.accent}44`,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span style={{ fontSize: 14 }}>{spec.icon}</span>
        <span
          style={{ fontWeight: 700, color: spec.accent, fontSize: 11, letterSpacing: '0.03em' }}
        >
          {spec.label.toUpperCase()}
        </span>
      </div>

      {/* Body */}
      <div style={{ padding: '8px 10px' }}>
        <div style={{ fontWeight: 600, color: 'var(--foreground)', marginBottom: 2 }}>{label}</div>
        {description && (
          <div style={{ color: 'var(--text-muted)', fontSize: 11, lineHeight: 1.4 }}>
            {description}
          </div>
        )}
        {children}
      </div>

      {/* Target handle (top) */}
      <Handle
        type="target"
        position={Position.Top}
        style={{
          width: 10,
          height: 10,
          background: spec.accent,
          border: '2px solid var(--surface)',
          top: -5,
        }}
      />

      {/* Source handle(s) (bottom) */}
      {outputHandleCount === 1 ? (
        <Handle
          type="source"
          position={Position.Bottom}
          style={{
            width: 10,
            height: 10,
            background: spec.accent,
            border: '2px solid var(--surface)',
            bottom: -5,
          }}
        />
      ) : (
        Array.from({ length: outputHandleCount }).map((_, i) => (
          <Handle
            key={i}
            id={`out-${i}`}
            type="source"
            position={Position.Bottom}
            style={{
              width: 10,
              height: 10,
              background: spec.accent,
              border: '2px solid var(--surface)',
              bottom: -5,
              left: `${((i + 1) / (outputHandleCount + 1)) * 100}%`,
            }}
          />
        ))
      )}
    </div>
  );
}

// ── Individual node components ────────────────────────────────────────────────

export const AgentNode = memo(({ data, selected }: NodeProps<FlowNode>) => {
  const spec = NODE_SPECS.find((s) => s.kind === 'agent')!;
  return (
    <NodeShell spec={spec} label={data.label} description={data.description} selected={selected}>
      {data.model && (
        <div
          style={{
            marginTop: 5,
            padding: '2px 6px',
            background: 'var(--surface-2)',
            borderRadius: 4,
            fontSize: 10,
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono, monospace)',
          }}
        >
          {data.model}
        </div>
      )}
    </NodeShell>
  );
});
AgentNode.displayName = 'AgentNode';

export const ToolNode = memo(({ data, selected }: NodeProps<FlowNode>) => {
  const spec = NODE_SPECS.find((s) => s.kind === 'tool')!;
  return (
    <NodeShell spec={spec} label={data.label} description={data.description} selected={selected}>
      {data.toolName && (
        <div
          style={{
            marginTop: 5,
            padding: '2px 6px',
            background: 'var(--surface-2)',
            borderRadius: 4,
            fontSize: 10,
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono, monospace)',
          }}
        >
          {data.toolName}()
        </div>
      )}
    </NodeShell>
  );
});
ToolNode.displayName = 'ToolNode';

export const ConditionNode = memo(({ data, selected }: NodeProps<FlowNode>) => {
  const spec = NODE_SPECS.find((s) => s.kind === 'condition')!;
  return (
    <NodeShell
      spec={spec}
      label={data.label}
      description={data.description}
      selected={selected}
      outputHandleCount={2}
    >
      {data.condition && (
        <div
          style={{
            marginTop: 5,
            fontSize: 11,
            color: 'var(--text-secondary)',
            fontStyle: 'italic',
          }}
        >
          {data.condition}
        </div>
      )}
    </NodeShell>
  );
});
ConditionNode.displayName = 'ConditionNode';

export const StateNode = memo(({ data, selected }: NodeProps<FlowNode>) => {
  const spec = NODE_SPECS.find((s) => s.kind === 'state')!;
  return (
    <NodeShell spec={spec} label={data.label} description={data.description} selected={selected}>
      {data.stateKey && (
        <div
          style={{
            marginTop: 5,
            padding: '2px 6px',
            background: 'var(--surface-2)',
            borderRadius: 4,
            fontSize: 10,
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono, monospace)',
          }}
        >
          state.{data.stateKey}
        </div>
      )}
    </NodeShell>
  );
});
StateNode.displayName = 'StateNode';

export const HITLNode = memo(({ data, selected }: NodeProps<FlowNode>) => {
  const spec = NODE_SPECS.find((s) => s.kind === 'hitl')!;
  return (
    <NodeShell spec={spec} label={data.label} description={data.description} selected={selected}>
      <div
        style={{
          marginTop: 5,
          fontSize: 11,
          color: 'var(--text-muted)',
        }}
      >
        ⏸ Pauses for human input
      </div>
    </NodeShell>
  );
});
HITLNode.displayName = 'HITLNode';

// ── nodeTypes registry ────────────────────────────────────────────────────────

export const nodeTypes = {
  agent: AgentNode,
  tool: ToolNode,
  condition: ConditionNode,
  state: StateNode,
  hitl: HITLNode,
};
