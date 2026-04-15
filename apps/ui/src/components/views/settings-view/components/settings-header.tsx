import type { ReactNode } from 'react';
import { Cog, Menu, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { PanelHeader } from '@/components/shared/panel-header';

interface SettingsHeaderProps {
  title?: string;
  description?: string;
  icon?: LucideIcon;
  showNavigation?: boolean;
  onToggleNavigation?: () => void;
  actions?: ReactNode;
}

export function SettingsHeader({
  title = 'Global Settings',
  icon: Icon = Cog,
  showNavigation,
  onToggleNavigation,
  actions,
}: SettingsHeaderProps) {
  return (
    <PanelHeader
      icon={Icon}
      title={title}
      extra={
        <div className="flex items-center gap-1">
          {actions}
          {onToggleNavigation && (
            <button
              onClick={onToggleNavigation}
              className="rounded-md p-1.5 min-h-[44px] min-w-[44px] flex items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground lg:hidden touch-manipulation"
              aria-label={showNavigation ? 'Close navigation menu' : 'Open navigation menu'}
            >
              {showNavigation ? <X className="size-4" /> : <Menu className="size-4" />}
            </button>
          )}
        </div>
      }
    />
  );
}
