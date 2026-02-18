import { memo } from 'react';
import { DropdownMenuRadioItem } from '@protolabs/ui/atoms';
import type { ThemeMenuItemProps } from '../types';

export const ThemeMenuItem = memo(function ThemeMenuItem({
  option,
  onPreviewEnter,
  onPreviewLeave,
}: ThemeMenuItemProps) {
  const Icon = option.icon;
  return (
    <div
      key={option.value}
      onPointerEnter={() => onPreviewEnter(option.value)}
      onPointerLeave={onPreviewLeave}
    >
      <DropdownMenuRadioItem
        value={option.value}
        data-testid={`project-theme-${option.value}`}
        className="text-xs py-1.5"
      >
        <Icon className="w-3.5 h-3.5 mr-1.5" style={{ color: option.color }} />
        <span>{option.label}</span>
      </DropdownMenuRadioItem>
    </div>
  );
});
