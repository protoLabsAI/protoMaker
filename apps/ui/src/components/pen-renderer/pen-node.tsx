import type { ResolvedNode } from '@automaker/pen-renderer';
import { PenFrame } from './pen-frame';
import { PenText } from './pen-text';
import { PenShape } from './pen-shape';
import { PenIcon } from './pen-icon';
import { toCSS } from './utils';

interface PenNodeProps {
  node: ResolvedNode;
  /** Whether to show component outlines for debugging */
  debug?: boolean;
  /** Click handler for node selection */
  onNodeClick?: (nodeId: string, event: React.MouseEvent) => void;
  /** Currently selected node ID */
  selectedNodeId?: string;
}

/**
 * Dispatcher component that renders the appropriate element based on node type.
 * Each node type maps to a specialized renderer.
 */
export function PenNode({ node, debug, onNodeClick, selectedNodeId }: PenNodeProps) {
  // Skip reusable component definitions — only render instances
  if (node.reusable) return null;

  const isSelected = selectedNodeId === node.id;

  const handleClick = onNodeClick
    ? (e: React.MouseEvent) => {
        e.stopPropagation();
        onNodeClick(node.id, e);
      }
    : undefined;

  switch (node.type) {
    case 'frame':
    case 'group':
      return (
        <PenFrame
          node={node}
          debug={debug}
          onNodeClick={onNodeClick}
          selectedNodeId={selectedNodeId}
          isSelected={isSelected}
          onClick={handleClick}
        />
      );

    case 'text':
      return <PenText node={node} isSelected={isSelected} onClick={handleClick} />;

    case 'rectangle':
    case 'ellipse':
    case 'polygon':
    case 'path':
      return <PenShape node={node} isSelected={isSelected} onClick={handleClick} />;

    case 'icon_font':
      return <PenIcon node={node} isSelected={isSelected} onClick={handleClick} />;

    case 'line':
      return (
        <div
          data-pen-id={node.id}
          data-pen-type="line"
          style={toCSS(node.styles)}
          onClick={handleClick}
        />
      );

    case 'note':
      return null;

    default:
      if (debug) {
        return (
          <div
            data-pen-id={node.id}
            data-pen-type={node.type}
            style={{ ...toCSS(node.styles), outline: '1px dashed red' }}
          >
            Unknown: {node.type}
          </div>
        );
      }
      return null;
  }
}
