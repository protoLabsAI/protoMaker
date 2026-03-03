import type { NavigateOptions } from '@tanstack/react-router';
import { cn } from '@/lib/utils';
import { formatShortcut } from '@/store/types';
import { Settings } from 'lucide-react';
import { ThemeToggleButton } from './theme-toggle-button';

interface SidebarFooterProps {
  sidebarOpen: boolean;
  isActiveRoute: (id: string) => boolean;
  navigate: (opts: NavigateOptions) => void;
  shortcuts: {
    settings: string;
  };
}

export function SidebarFooter({
  sidebarOpen,
  isActiveRoute,
  navigate,
  shortcuts,
}: SidebarFooterProps) {
  return (
    <div
      className={cn(
        'shrink-0',
        // Top border with gradient fade
        'border-t border-border/40',
        // Elevated background for visual separation
        'bg-gradient-to-t from-background/10 via-sidebar/50 to-transparent'
      )}
    >
      {/* Theme Toggle */}
      <ThemeToggleButton sidebarOpen={sidebarOpen} />
      {/* Settings Link */}
      <div className="p-2">
        <button
          onClick={() => navigate({ to: '/settings' })}
          className={cn(
            'group flex items-center w-full px-2.5 py-1.5 rounded-lg relative overflow-hidden titlebar-no-drag',
            'transition-all duration-200 ease-out',
            isActiveRoute('settings')
              ? [
                  'bg-gradient-to-r from-brand-500/20 via-brand-500/15 to-brand-600/10',
                  'text-foreground font-medium',
                  'border border-brand-500/30',
                  'shadow-md shadow-brand-500/10',
                ]
              : [
                  'text-muted-foreground hover:text-foreground',
                  'hover:bg-accent/50',
                  'border border-transparent hover:border-border/40',
                  'hover:shadow-sm',
                ],
            sidebarOpen ? 'justify-start' : 'justify-center',
            'hover:scale-[1.02] active:scale-[0.97]'
          )}
          title={!sidebarOpen ? 'Global Settings' : undefined}
          data-testid="settings-button"
        >
          <Settings
            className={cn(
              'w-4 h-4 shrink-0 transition-all duration-200',
              isActiveRoute('settings')
                ? 'text-brand-500 drop-shadow-sm'
                : 'group-hover:text-brand-400 group-hover:rotate-90 group-hover:scale-110'
            )}
          />
          <span
            className={cn(
              'ml-3 font-medium text-sm flex-1 text-left',
              sidebarOpen ? 'block' : 'hidden'
            )}
          >
            Global Settings
          </span>
          {sidebarOpen && (
            <span
              className={cn(
                'flex items-center justify-center min-w-5 h-5 px-1.5 text-[10px] font-mono rounded-md transition-all duration-200',
                isActiveRoute('settings')
                  ? 'bg-brand-500/20 text-brand-400'
                  : 'bg-muted text-muted-foreground group-hover:bg-accent'
              )}
              data-testid="shortcut-settings"
            >
              {formatShortcut(shortcuts.settings, true)}
            </span>
          )}
          {!sidebarOpen && (
            <span
              className={cn(
                'absolute left-full ml-3 px-2.5 py-1.5 rounded-lg',
                'bg-popover text-popover-foreground text-xs font-medium',
                'border border-border shadow-lg',
                'opacity-0 group-hover:opacity-100',
                'transition-all duration-200 whitespace-nowrap z-50',
                'translate-x-1 group-hover:translate-x-0'
              )}
            >
              Global Settings
              <span className="ml-2 px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono text-muted-foreground">
                {formatShortcut(shortcuts.settings, true)}
              </span>
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
