import { useState, useCallback, useEffect } from 'react';
import { Button, Badge, Switch, Textarea } from '@protolabs/ui/atoms';
import { Users, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useGlobalSettings } from '@/hooks/queries/use-settings';
import { useUpdateGlobalSettings } from '@/hooks/mutations/use-settings-mutations';
import { useAgentTemplates } from '@/hooks/queries/use-agent-templates';
import type { AgentTemplateMetadata } from '@/hooks/queries/use-agent-templates';
import type { CustomPrompt } from '@automaker/types';

function modelBadgeVariant(model?: string): 'default' | 'secondary' | 'outline' {
  switch (model) {
    case 'opus':
      return 'default';
    case 'sonnet':
      return 'secondary';
    default:
      return 'outline';
  }
}

interface PersonaCardProps {
  template: AgentTemplateMetadata;
  override: CustomPrompt | undefined;
  onToggle: () => void;
  onUpdateValue: (value: string) => void;
  onReset: () => void;
}

function PersonaCard({ template, override, onToggle, onUpdateValue, onReset }: PersonaCardProps) {
  const [localValue, setLocalValue] = useState(override?.value ?? '');

  // Sync local state when server override changes
  useEffect(() => {
    setLocalValue(override?.value ?? '');
  }, [override?.value]);

  return (
    <div className="rounded-xl bg-muted/30 border border-border/30 overflow-hidden">
      <div className="p-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-medium text-foreground truncate">{template.displayName}</p>
              <Badge variant="outline" className="text-[10px] shrink-0">
                {template.role}
              </Badge>
              {template.model && (
                <Badge variant={modelBadgeVariant(template.model)} className="text-[10px] shrink-0">
                  {template.model}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground/70 mt-0.5 truncate">
              {template.description}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-muted-foreground">Custom prompt</span>
          <Switch checked={override?.enabled ?? false} onCheckedChange={onToggle} />
        </div>
      </div>

      {override?.enabled && (
        <div className="px-4 pb-4 space-y-2">
          <Textarea
            className="font-mono text-xs"
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

export function PersonasSection() {
  const { data: settings } = useGlobalSettings();
  const updateSettings = useUpdateGlobalSettings({ showSuccessToast: false });
  const { data: templates, isLoading } = useAgentTemplates();

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
          Override system prompts for registered agent templates.
        </p>
      </div>

      <div className="p-6 space-y-3">
        {isLoading && (
          <p className="text-sm text-muted-foreground text-center py-8">Loading templates...</p>
        )}

        {!isLoading && (!templates || templates.length === 0) && (
          <p className="text-sm text-muted-foreground text-center py-8">
            No agent templates registered.
          </p>
        )}

        {templates?.map((template) => (
          <PersonaCard
            key={template.name}
            template={template}
            override={personaOverrides[template.name]}
            onToggle={() => toggleOverride(template.name)}
            onUpdateValue={(value) => updatePromptValue(template.name, value)}
            onReset={() => resetOverride(template.name)}
          />
        ))}
      </div>
    </div>
  );
}
