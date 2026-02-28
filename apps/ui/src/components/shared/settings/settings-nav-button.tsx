import { cn } from '@/lib/utils';
import type { SettingsNavigationItem } from './types';

interface SettingsNavButtonProps {
  item: SettingsNavigationItem;
  isActive: boolean;
  onClick: () => void;
}

export function SettingsNavButton({ item, isActive, onClick }: SettingsNavButtonProps) {
  const Icon = item.icon;
  const isDanger = item.colorScheme === 'danger';

  return (
    <button
      onClick={onClick}
      className={cn(
        'group w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ease-out text-left relative overflow-hidden',
        isActive
          ? [
              isDanger
                ? 'bg-gradient-to-r from-red-500/15 via-red-500/10 to-red-600/5'
                : 'bg-gradient-to-r from-brand-500/15 via-brand-500/10 to-brand-600/5',
              'text-foreground',
              isDanger ? 'border border-red-500/25' : 'border border-brand-500/25',
              isDanger ? 'shadow-sm shadow-red-500/5' : 'shadow-sm shadow-brand-500/5',
            ]
          : [
              'text-muted-foreground hover:text-foreground',
              'hover:bg-accent/50',
              'border border-transparent hover:border-border/40',
            ],
        'hover:scale-[1.01] active:scale-[0.98]'
      )}
    >
      {/* Active indicator bar */}
      {isActive && (
        <div
          className={cn(
            'absolute inset-y-0 left-0 w-0.5 rounded-r-full',
            isDanger
              ? 'bg-gradient-to-b from-red-400 via-red-500 to-red-600'
              : 'bg-gradient-to-b from-brand-400 via-brand-500 to-brand-600'
          )}
        />
      )}
      <Icon
        className={cn(
          'w-4 h-4 shrink-0 transition-all duration-200',
          isActive
            ? isDanger
              ? 'text-red-500'
              : 'text-brand-500'
            : isDanger
              ? 'group-hover:text-red-400 group-hover:scale-110'
              : 'group-hover:text-brand-400 group-hover:scale-110'
        )}
      />
      <span className={cn(isDanger && !isActive && 'text-red-400/70')}>{item.label}</span>
    </button>
  );
}
