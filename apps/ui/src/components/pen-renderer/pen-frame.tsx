import type { ResolvedNode } from '@automaker/pen-renderer';
import { PenNode } from './pen-node';
import { toCSS } from './utils';

interface PenFrameProps {
  node: ResolvedNode;
  debug?: boolean;
  onNodeClick?: (nodeId: string, event: React.MouseEvent) => void;
  selectedNodeId?: string;
  isSelected?: boolean;
  onClick?: (e: React.MouseEvent) => void;
}

/**
 * Renders a .pen frame node as a flexbox div container.
 * Recursively renders children via PenNode dispatcher.
 */
export function PenFrame({
  node,
  debug,
  onNodeClick,
  selectedNodeId,
  isSelected,
  onClick,
}: PenFrameProps) {
  const style: React.CSSProperties = {
    ...toCSS(node.styles),
    ...(isSelected ? { outline: '2px solid #a78bfa', outlineOffset: '-2px' } : {}),
    ...(debug
      ? { outline: isSelected ? '2px solid #a78bfa' : '1px dashed rgba(167,139,250,0.3)' }
      : {}),
  };

  return (
    <div
      data-pen-id={node.id}
      data-pen-type={node.type}
      data-pen-name={node.name}
      style={style}
      onClick={onClick}
    >
      {node.children?.map((child) => (
        <PenNode
          key={child.id}
          node={child}
          debug={debug}
          onNodeClick={onNodeClick}
          selectedNodeId={selectedNodeId}
        />
      ))}
    </div>
  );
}
