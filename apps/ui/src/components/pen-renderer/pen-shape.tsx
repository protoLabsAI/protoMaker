import type { ResolvedNode } from '@automaker/pen-renderer';
import { toCSS } from './utils';

interface PenShapeProps {
  node: ResolvedNode;
  isSelected?: boolean;
  onClick?: (e: React.MouseEvent) => void;
}

/**
 * Renders .pen shape nodes (rectangle, ellipse, polygon, path) as styled divs.
 * Ellipses get border-radius: 50% applied.
 */
export function PenShape({ node, isSelected, onClick }: PenShapeProps) {
  const style: React.CSSProperties = {
    ...toCSS(node.styles),
    ...(node.type === 'ellipse' ? { borderRadius: '50%' } : {}),
    ...(isSelected ? { outline: '2px solid #a78bfa', outlineOffset: '-1px' } : {}),
  };

  return (
    <div
      data-pen-id={node.id}
      data-pen-type={node.type}
      data-pen-name={node.name}
      style={style}
      onClick={onClick}
    />
  );
}
