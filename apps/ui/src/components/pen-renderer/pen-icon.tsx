import type { ResolvedNode } from '@automaker/pen-renderer';
import type { LucideIcon } from 'lucide-react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  Circle,
  Ellipsis,
  Hexagon,
  Plus,
  Search,
  X,
  HelpCircle,
} from 'lucide-react';
import { toCSS } from './utils';

/** Map of Lucide icon names (kebab-case) to their React components */
const LUCIDE_ICONS: Record<string, LucideIcon> = {
  check: Check,
  'chevron-down': ChevronDown,
  'chevron-right': ChevronRight,
  'chevrons-up-down': ChevronsUpDown,
  circle: Circle,
  ellipsis: Ellipsis,
  hexagon: Hexagon,
  plus: Plus,
  search: Search,
  x: X,
};

interface PenIconProps {
  node: ResolvedNode;
  isSelected?: boolean;
  onClick?: (e: React.MouseEvent) => void;
}

/**
 * Renders a .pen icon_font node using Lucide icons when available.
 * Falls back to a generic placeholder icon for unknown icon names.
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
  const sizeStr = node.styles.width ?? node.styles.height ?? '16px';
  const size = parseInt(sizeStr, 10) || 16;
  const color = node.styles.color ?? 'currentColor';

  const IconComponent = LUCIDE_ICONS[iconName] ?? HelpCircle;

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
      <IconComponent size={size} color={color} strokeWidth={2} />
    </span>
  );
}
