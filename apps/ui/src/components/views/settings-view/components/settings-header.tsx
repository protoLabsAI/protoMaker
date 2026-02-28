import type { ReactNode } from 'react';
import { Cog, Menu, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@protolabs-ai/ui/atoms';

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
  description = 'Configure your API keys and preferences',
  icon: Icon = Cog,
  showNavigation,
  onToggleNavigation,
  actions,
}: SettingsHeaderProps) {
  return (
    <div className="shrink-0 p-4 border-b border-border bg-card/80 backdrop-blur-md">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Icon className="w-5 h-5 text-muted-foreground" />
          <div>
            <h1 className="text-xl font-bold">{title}</h1>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {actions}
          {/* Mobile menu toggle button - only visible on mobile */}
          {onToggleNavigation && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleNavigation}
              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground lg:hidden"
              aria-label={showNavigation ? 'Close navigation menu' : 'Open navigation menu'}
            >
              {showNavigation ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
