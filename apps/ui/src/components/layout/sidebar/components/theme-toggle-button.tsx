import { memo, useState, useCallback } from 'react';
import { Palette } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useThemeStore } from '@/store/theme-store';
import type { ThemeMode } from '@/store/types';
import { darkThemes, lightThemes } from '@/config/theme-options';
import { Popover, PopoverContent, PopoverTrigger } from '@protolabs/ui/atoms';
import { useThemeTransition } from '@/lib/theme/transitions';
import { curatedThemes } from '@/lib/theme/registry';

/** Theme item for the grid */
interface ThemeGridItemProps {
  value: string;
  label: string;
  Icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  color: string;
  isActive: boolean;
  isCurated: boolean;
  onSelect: (value: string, e: React.MouseEvent) => void;
}

const ThemeGridItem = memo(function ThemeGridItem({
  value,
  label,
  Icon,
  color,
  isActive,
  onSelect,
}: ThemeGridItemProps) {
  return (
    <button
      className={cn(
        'flex items-center gap-2 px-2 py-1.5 rounded-md text-xs w-full text-left',
        'transition-colors duration-150',
        isActive
          ? 'bg-brand-500/15 text-foreground font-medium'
          : 'text-foreground-secondary hover:bg-accent/50 hover:text-foreground'
      )}
      onClick={(e) => onSelect(value, e)}
      data-testid={`theme-toggle-${value}`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" style={{ color }} />
      <span className="truncate">{label}</span>
    </button>
  );
});

interface ThemeToggleButtonProps {
  sidebarOpen: boolean;
}

export const ThemeToggleButton = memo(function ThemeToggleButton({
  sidebarOpen,
}: ThemeToggleButtonProps) {
  const [open, setOpen] = useState(false);
  const { transition } = useThemeTransition();
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  // Curated theme names for filtering
  const curatedNames = new Set(curatedThemes.map((t) => t.name));

  // Split themes into curated and community
  const curatedDark = darkThemes.filter((t) => curatedNames.has(t.value));
  const curatedLight = lightThemes.filter((t) => curatedNames.has(t.value));
  const communityDark = darkThemes.filter((t) => !curatedNames.has(t.value));
  const communityLight = lightThemes.filter((t) => !curatedNames.has(t.value));

  const handleSelect = useCallback(
    (value: string, e: React.MouseEvent) => {
      const origin = { x: e.clientX, y: e.clientY };
      transition(
        () => {
          setTheme(value as ThemeMode);
        },
        { variant: 'circle', origin }
      );
      setOpen(false);
    },
    [setTheme, transition]
  );

  const renderSection = (label: string, themes: typeof darkThemes, isCurated: boolean) => {
    if (themes.length === 0) return null;
    return (
      <>
        <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div className="grid grid-cols-2 gap-0.5">
          {themes.map((t) => (
            <ThemeGridItem
              key={t.value}
              value={t.value}
              label={t.label}
              Icon={t.Icon}
              color={t.color}
              isActive={theme === t.value}
              isCurated={isCurated}
              onSelect={handleSelect}
            />
          ))}
        </div>
      </>
    );
  };

  return (
    <div className="p-2 pb-0">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            className={cn(
              'group flex items-center w-full px-3 py-2.5 rounded-xl relative overflow-hidden titlebar-no-drag',
              'transition-all duration-200 ease-out',
              open
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
            title={!sidebarOpen ? 'Theme' : undefined}
            data-testid="theme-toggle-button"
          >
            <Palette
              className={cn(
                'w-[18px] h-[18px] shrink-0 transition-all duration-200',
                open
                  ? 'text-brand-500 drop-shadow-sm'
                  : 'group-hover:text-brand-400 group-hover:scale-110'
              )}
            />
            <span
              className={cn(
                'ml-3 font-medium text-sm flex-1 text-left',
                sidebarOpen ? 'block' : 'hidden'
              )}
            >
              Theme
            </span>
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
                Theme
              </span>
            )}
          </button>
        </PopoverTrigger>

        <PopoverContent
          side="right"
          align="end"
          sideOffset={8}
          className="w-72 p-2 max-h-[70vh] overflow-y-auto scrollbar-styled"
        >
          {/* Curated themes */}
          {(curatedDark.length > 0 || curatedLight.length > 0) && (
            <>
              {renderSection('Curated Dark', curatedDark, true)}
              {renderSection('Curated Light', curatedLight, true)}
              <div className="my-2 border-t border-border/50" />
            </>
          )}

          {/* Community themes */}
          {renderSection('Dark', communityDark, false)}
          {communityDark.length > 0 && communityLight.length > 0 && <div className="my-1.5" />}
          {renderSection('Light', communityLight, false)}
        </PopoverContent>
      </Popover>
    </div>
  );
});
