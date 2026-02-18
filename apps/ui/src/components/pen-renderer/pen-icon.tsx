import type { ResolvedNode } from '@automaker/pen-renderer';
import { toCSS } from './utils';

interface PenIconProps {
  node: ResolvedNode;
  isSelected?: boolean;
  onClick?: (e: React.MouseEvent) => void;
}

/**
 * Renders a .pen icon_font node.
 *
 * If the icon uses a known icon font family (e.g., Lucide), renders the
 * appropriate icon character. Falls back to a placeholder SVG.
 */
export function PenIcon({ node, isSelected, onClick }: PenIconProps) {
  const style: React.CSSProperties = {
    ...toCSS(node.styles),
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    ...(isSelected ? { outline: '2px solid #a78bfa', outlineOffset: '-1px' } : {}),
  };

  const iconName = node.iconName ?? node.name ?? '';

  return (
    <span
      data-pen-id={node.id}
      data-pen-type="icon_font"
      data-pen-name={node.name}
      data-pen-icon-family={node.iconFamily}
      data-pen-icon-name={iconName}
      style={style}
      onClick={onClick}
      title={iconName}
    >
      <svg
        viewBox="0 0 24 24"
        width={node.styles.width ?? '16px'}
        height={node.styles.height ?? '16px'}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ color: node.styles.color ?? 'currentColor' }}
      >
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <line x1="9" y1="9" x2="15" y2="15" />
        <line x1="15" y1="9" x2="9" y2="15" />
      </svg>
    </span>
  );
}
