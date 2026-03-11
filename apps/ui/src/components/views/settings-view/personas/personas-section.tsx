import { useState, useCallback, useEffect } from 'react';
import { Button, Switch, Textarea } from '@protolabsai/ui/atoms';
import { Users, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useGlobalSettings } from '@/hooks/queries/use-settings';
import { useUpdateGlobalSettings } from '@/hooks/mutations/use-settings-mutations';
import type { CustomPrompt } from '@protolabsai/types';

// ─────────────────────────────────────────────────────────────────────────────
// Built-in agent personas (sourced from CLI skills/commands)
// ─────────────────────────────────────────────────────────────────────────────

const BUILT_IN_PERSONAS = [
  { name: 'ava', displayName: 'Ava', description: 'Chief of Staff — autonomous operator' },
  { name: 'kai', displayName: 'Kai', description: 'Backend Engineer' },
  { name: 'matt', displayName: 'Matt', description: 'Frontend Engineer' },
  { name: 'frank', displayName: 'Frank', description: 'DevOps Engineer' },
  { name: 'sam', displayName: 'Sam', description: 'AI Agent Engineer' },
  { name: 'cindi', displayName: 'Cindi', description: 'Content Writing Specialist' },
  { name: 'jon', displayName: 'Jon', description: 'GTM Specialist' },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Persona Card
// ─────────────────────────────────────────────────────────────────────────────

interface PersonaCardProps {
  name: string;
  displayName: string;
  description: string;
  override: CustomPrompt | undefined;
  onToggleOverride: () => void;
  onUpdateValue: (value: string) => void;
  onReset: () => void;
}

function PersonaCard({
  displayName,
  description,
  override,
  onToggleOverride,
  onUpdateValue,
  onReset,
}: PersonaCardProps) {
  const [localValue, setLocalValue] = useState(override?.value ?? '');

  useEffect(() => {
    setLocalValue(override?.value ?? '');
  }, [override?.value]);

  return (
    <div className="rounded-lg bg-muted/30 border border-border/30 overflow-hidden">
      <div className="p-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-foreground truncate">{displayName}</p>
          <p className="text-xs text-muted-foreground/70 mt-0.5 truncate">{description}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-xs text-muted-foreground">Custom prompt</span>
          <Switch checked={override?.enabled ?? false} onCheckedChange={onToggleOverride} />
        </div>
      </div>

      {override?.enabled && (
        <div className="px-4 pb-4 space-y-2 border-t border-border/20">
          <Textarea
            className="font-mono text-xs mt-3"
            rows={12}
            value={localValue}
            onChange={(e) => setLocalValue(e.target.value)}
            onBlur={() => {
              if (localValue !== override.value) {
                onUpdateValue(localValue);
              }
            }}
            placeholder="Enter a custom system prompt override for this agent..."
          />
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={onReset}>
              <RotateCcw className="w-3 h-3" />
              Reset
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Personas Section
// ─────────────────────────────────────────────────────────────────────────────

export function PersonasSection() {
  const { data: settings } = useGlobalSettings();
  const updateSettings = useUpdateGlobalSettings({ showSuccessToast: false });

  const personaOverrides = settings?.personaOverrides ?? {};

  const toggleOverride = useCallback(
    (name: string) => {
      const existing = personaOverrides[name];
      const updated: Record<string, CustomPrompt> = {
        ...personaOverrides,
        [name]: {
          value: existing?.value ?? '',
          enabled: !existing?.enabled,
        },
      };
      updateSettings.mutate({ personaOverrides: updated });
    },
    [personaOverrides, updateSettings]
  );

  const updatePromptValue = useCallback(
    (name: string, value: string) => {
      const existing = personaOverrides[name];
      const updated: Record<string, CustomPrompt> = {
        ...personaOverrides,
        [name]: { value, enabled: existing?.enabled ?? true },
      };
      updateSettings.mutate({ personaOverrides: updated });
    },
    [personaOverrides, updateSettings]
  );

  const resetOverride = useCallback(
    (name: string) => {
      const { [name]: _, ...rest } = personaOverrides;
      updateSettings.mutate({ personaOverrides: rest });
    },
    [personaOverrides, updateSettings]
  );

  return (
    <div
      className={cn(
        'rounded-lg overflow-hidden',
        'border border-border/50',
        'bg-gradient-to-br from-card/80 via-card/70 to-card/80 backdrop-blur-xl',
        'shadow-sm'
      )}
    >
      <div className="p-4 border-b border-border/30 bg-gradient-to-r from-primary/5 via-transparent to-transparent">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center border border-primary/20">
            <Users className="w-5 h-5 text-primary" />
          </div>
          <h2 className="text-lg font-semibold text-foreground tracking-tight">Personas</h2>
        </div>
        <p className="text-sm text-muted-foreground/80 ml-12">
          Override system prompts for built-in agent personas. Custom prompts are prepended to the
          default system prompt when the agent runs.
        </p>
      </div>

      <div className="p-6 space-y-3">
        {BUILT_IN_PERSONAS.map((persona) => (
          <PersonaCard
            key={persona.name}
            name={persona.name}
            displayName={persona.displayName}
            description={persona.description}
            override={personaOverrides[persona.name]}
            onToggleOverride={() => toggleOverride(persona.name)}
            onUpdateValue={(value) => updatePromptValue(persona.name, value)}
            onReset={() => resetOverride(persona.name)}
          />
        ))}
      </div>
    </div>
  );
}
