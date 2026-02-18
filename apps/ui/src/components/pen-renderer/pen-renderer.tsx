import { useMemo, useState, useCallback } from 'react';
import type { PenThemeSelection, ResolvedNode } from '@automaker/pen-renderer';
import {
  parsePenDocument,
  resolveDocument,
  resolveComponent,
  listComponents,
} from '@automaker/pen-renderer';
import { PenNode } from './pen-node';

interface PenRendererProps {
  /** Raw .pen JSON string */
  json: string;
  /** Active theme selection (e.g., { Mode: 'Dark', Base: 'Zinc', Accent: 'Violet' }) */
  theme?: PenThemeSelection;
  /** If set, render only this component instead of the full document */
  componentId?: string;
  /** Show debug outlines for all nodes */
  debug?: boolean;
  /** Callback when a node is clicked (for inspector panel) */
  onNodeSelect?: (nodeId: string | null) => void;
  /** Additional CSS class for the root container */
  className?: string;
}

interface ParsedDocument {
  parseResult: ReturnType<typeof parsePenDocument>;
  components: Array<{ id: string; name: string; type: string }>;
}

/**
 * Root renderer for .pen design files.
 *
 * Parses the JSON, resolves variables/refs for the given theme,
 * and renders the full document or a single component.
 */
export function PenRenderer({
  json,
  theme = {},
  componentId,
  debug = false,
  onNodeSelect,
  className,
}: PenRendererProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Parse the document once (memoized on json string)
  const parsed = useMemo<ParsedDocument | null>(() => {
    try {
      const parseResult = parsePenDocument(json);
      const components = listComponents(parseResult);
      return { parseResult, components };
    } catch {
      return null;
    }
  }, [json]);

  // Resolve the document or component for the current theme
  const resolved = useMemo<ResolvedNode[] | null>(() => {
    if (!parsed) return null;

    try {
      if (componentId) {
        const component = resolveComponent(parsed.parseResult, componentId, theme);
        return component ? [component] : null;
      }
      return resolveDocument(parsed.parseResult, theme);
    } catch {
      return null;
    }
  }, [parsed, theme, componentId]);

  const handleNodeClick = useCallback(
    (nodeId: string) => {
      setSelectedNodeId((prev) => (prev === nodeId ? null : nodeId));
      onNodeSelect?.(nodeId);
    },
    [onNodeSelect]
  );

  if (!parsed) {
    return (
      <div className={className} style={{ padding: 16, color: '#f87171' }}>
        Failed to parse .pen file
      </div>
    );
  }

  if (!resolved || resolved.length === 0) {
    return (
      <div className={className} style={{ padding: 16, color: '#a1a1aa' }}>
        {componentId ? `Component "${componentId}" not found` : 'Empty document'}
      </div>
    );
  }

  return (
    <div className={className} data-pen-renderer="root">
      {resolved.map((node) => (
        <PenNode
          key={node.id}
          node={node}
          debug={debug}
          onNodeClick={handleNodeClick}
          selectedNodeId={selectedNodeId ?? undefined}
        />
      ))}
    </div>
  );
}
