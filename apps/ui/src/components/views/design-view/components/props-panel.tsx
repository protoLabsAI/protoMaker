import { useState, useMemo } from 'react';
import { X, ChevronDown, ChevronRight } from 'lucide-react';
import type { ResolvedNode } from '@automaker/pen-renderer';
import { parsePenDocument, resolveDocument } from '@automaker/pen-renderer';
import type { PenThemeSelection } from '@automaker/pen-renderer';

interface PropsPanelProps {
  json: string;
  theme: PenThemeSelection;
  selectedNodeId: string | null;
  onClose: () => void;
}

/** Recursively find a node by ID in the resolved tree */
function findNode(nodes: ResolvedNode[], id: string): ResolvedNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children) {
      const found = findNode(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

function PropertyRow({ label, value }: { label: string; value: string | undefined }) {
  if (value === undefined || value === '') return null;
  return (
    <div className="flex items-start justify-between gap-2 py-1">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="text-right text-xs font-mono text-foreground break-all">{value}</span>
    </div>
  );
}

function PropertySection({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-1 px-3 py-2 text-xs font-medium text-foreground hover:bg-accent/50"
      >
        {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        {title}
      </button>
      {open && <div className="px-3 pb-2">{children}</div>}
    </div>
  );
}

function ColorSwatch({ color }: { color: string }) {
  return (
    <span
      className="inline-block size-3 rounded-sm border border-border"
      style={{ backgroundColor: color }}
    />
  );
}

export function PropsPanel({ json, theme, selectedNodeId, onClose }: PropsPanelProps) {
  const resolved = useMemo(() => {
    try {
      const parsed = parsePenDocument(json);
      return resolveDocument(parsed, theme);
    } catch {
      return null;
    }
  }, [json, theme]);

  const node = useMemo(() => {
    if (!resolved || !selectedNodeId) return null;
    return findNode(resolved, selectedNodeId);
  }, [resolved, selectedNodeId]);

  if (!selectedNodeId || !node) {
    return null;
  }

  const styles = node.styles ?? {};

  // Group style properties by category
  const layoutProps = [
    ['display', styles.display],
    ['flexDirection', styles.flexDirection],
    ['justifyContent', styles.justifyContent],
    ['alignItems', styles.alignItems],
    ['gap', styles.gap],
    ['padding', styles.padding],
    ['overflow', styles.overflow],
  ] as const;

  const sizeProps = [
    ['width', styles.width],
    ['height', styles.height],
    ['minWidth', styles.minWidth],
    ['minHeight', styles.minHeight],
    ['maxWidth', styles.maxWidth],
    ['maxHeight', styles.maxHeight],
    ['flex', styles.flex],
  ] as const;

  const visualProps = [
    ['backgroundColor', styles.backgroundColor],
    ['color', styles.color],
    ['opacity', styles.opacity],
    ['borderRadius', styles.borderRadius],
    ['border', styles.border],
    ['boxShadow', styles.boxShadow],
  ] as const;

  const typographyProps = [
    ['fontFamily', styles.fontFamily],
    ['fontSize', styles.fontSize],
    ['fontWeight', styles.fontWeight],
    ['lineHeight', styles.lineHeight],
    ['textAlign', styles.textAlign],
    ['letterSpacing', styles.letterSpacing],
  ] as const;

  return (
    <div className="flex w-64 shrink-0 flex-col border-l border-border">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{node.name || node.id}</div>
          <div className="text-xs text-muted-foreground">{node.type}</div>
        </div>
        <button onClick={onClose} className="rounded p-1 hover:bg-accent">
          <X className="size-3.5" />
        </button>
      </div>

      {/* Properties */}
      <div className="flex-1 overflow-y-auto">
        {/* Identity */}
        <PropertySection title="Identity">
          <PropertyRow label="id" value={node.id} />
          <PropertyRow label="name" value={node.name} />
          <PropertyRow label="type" value={node.type} />
          {node.content !== undefined && <PropertyRow label="content" value={node.content} />}
        </PropertySection>

        {/* Layout */}
        <PropertySection title="Layout">
          {layoutProps.map(
            ([key, val]) => val && <PropertyRow key={key} label={key} value={val} />
          )}
        </PropertySection>

        {/* Size */}
        <PropertySection title="Size">
          {sizeProps.map(([key, val]) => val && <PropertyRow key={key} label={key} value={val} />)}
        </PropertySection>

        {/* Visual */}
        <PropertySection title="Visual">
          {visualProps.map(
            ([key, val]) =>
              val && (
                <div key={key} className="flex items-start justify-between gap-2 py-1">
                  <span className="shrink-0 text-xs text-muted-foreground">{key}</span>
                  <span className="flex items-center gap-1 text-right text-xs font-mono text-foreground break-all">
                    {(key === 'backgroundColor' || key === 'color') && <ColorSwatch color={val} />}
                    {val}
                  </span>
                </div>
              )
          )}
        </PropertySection>

        {/* Typography */}
        {node.type === 'text' && (
          <PropertySection title="Typography">
            {typographyProps.map(
              ([key, val]) => val && <PropertyRow key={key} label={key} value={val} />
            )}
          </PropertySection>
        )}

        {/* Children count */}
        {node.children && node.children.length > 0 && (
          <PropertySection title="Children" defaultOpen={false}>
            <div className="text-xs text-muted-foreground">
              {node.children.length} child node{node.children.length !== 1 ? 's' : ''}
            </div>
            {node.children.map((child) => (
              <div key={child.id} className="flex items-center gap-1 py-0.5 text-xs">
                <span className="text-muted-foreground">{child.type}</span>
                <span className="truncate text-foreground">{child.name || child.id}</span>
              </div>
            ))}
          </PropertySection>
        )}
      </div>
    </div>
  );
}
