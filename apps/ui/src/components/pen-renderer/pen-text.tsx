import type { ResolvedNode } from '@automaker/pen-renderer';
import { toCSS } from './utils';

interface PenTextProps {
  node: ResolvedNode;
  isSelected?: boolean;
  onClick?: (e: React.MouseEvent) => void;
}

/**
 * Renders a .pen text node as a span with typography styles.
 */
export function PenText({ node, isSelected, onClick }: PenTextProps) {
  const style: React.CSSProperties = {
    ...toCSS(node.styles),
    ...(isSelected ? { outline: '2px solid #a78bfa', outlineOffset: '-1px' } : {}),
  };

  return (
    <span
      data-pen-id={node.id}
      data-pen-type="text"
      data-pen-name={node.name}
      style={style}
      onClick={onClick}
    >
      {node.content ?? ''}
    </span>
  );
}
