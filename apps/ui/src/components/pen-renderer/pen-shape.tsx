import type { ResolvedNode } from '@automaker/pen-renderer';
import { toCSS } from './utils';

interface PenShapeProps {
  node: ResolvedNode;
  isSelected?: boolean;
  onClick?: (e: React.MouseEvent) => void;
}

/**
 * Renders .pen shape nodes (rectangle, ellipse, polygon, path) as styled divs.
 * Path nodes with geometry are rendered as inline SVGs.
 */
export function PenShape({ node, isSelected, onClick }: PenShapeProps) {
  const style: React.CSSProperties = {
    ...toCSS(node.styles),
    ...(node.type === 'ellipse' ? { borderRadius: '50%' } : {}),
    ...(isSelected ? { outline: '2px solid #a78bfa', outlineOffset: '-1px' } : {}),
  };

  // Render SVG for path nodes with geometry
  if (node.type === 'path' && node.geometry) {
    const w = parseInt(node.styles.width ?? '24', 10) || 24;
    const h = parseInt(node.styles.height ?? '24', 10) || 24;
    const strokeColor = node.stroke?.color ?? node.styles.color ?? 'currentColor';
    const strokeWidth = node.stroke?.width ?? 1.5;

    return (
      <svg
        data-pen-id={node.id}
        data-pen-type="path"
        data-pen-name={node.name}
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinecap={(node.stroke?.cap as 'round' | 'butt' | 'square') ?? 'round'}
        strokeLinejoin={(node.stroke?.join as 'round' | 'miter' | 'bevel') ?? 'round'}
        style={{
          ...style,
          display: 'inline-block',
          // Remove box-model styles that don't apply to SVG
          backgroundColor: undefined,
          border: undefined,
        }}
        onClick={onClick}
      >
        <path d={node.geometry} />
      </svg>
    );
  }

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
