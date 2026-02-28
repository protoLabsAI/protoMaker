import { cn } from '@/lib/utils';

type SettingsScope = 'global' | 'project';

interface SettingsScopeToggleProps {
  active: SettingsScope;
  onSwitch: (scope: SettingsScope) => void;
}

const scopes: { value: SettingsScope; label: string }[] = [
  { value: 'global', label: 'Global' },
  { value: 'project', label: 'Project' },
];

export function SettingsScopeToggle({ active, onSwitch }: SettingsScopeToggleProps) {
  return (
    <div className="inline-flex items-center rounded-lg bg-muted/50 p-0.5 ring-1 ring-border/50">
      {scopes.map(({ value, label }) => (
        <button
          key={value}
          onClick={() => onSwitch(value)}
          className={cn(
            'px-3 py-1 text-sm font-medium rounded-md transition-all duration-150',
            active === value
              ? 'bg-background text-foreground shadow-sm ring-1 ring-border/50'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
