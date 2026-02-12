/**
 * AgentSelector - Compact selector for choosing agent templates
 *
 * Displays agent templates from the registry with a "Custom Model" fallback option.
 * When an agent is selected, automatically sets the model from the template's model field.
 */

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Check, ChevronsUpDown, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAgentTemplates } from '@/hooks/queries/use-agent-templates';

interface AgentSelectorProps {
  /** Currently selected agent template name (or null for "Custom Model") */
  value: string | null;
  /** Callback when agent is selected */
  onChange: (agentName: string | null, modelId?: string) => void;
  /** Disabled state */
  disabled?: boolean;
}

const CUSTOM_MODEL_OPTION = {
  name: 'custom-model',
  displayName: 'Custom Model',
  description: 'Choose your own model',
};

export function AgentSelector({ value, onChange, disabled }: AgentSelectorProps) {
  const [open, setOpen] = useState(false);
  const { data: templates = [], isLoading } = useAgentTemplates();

  // Combine templates with Custom Model option
  const allOptions = useMemo(() => {
    return [CUSTOM_MODEL_OPTION, ...templates];
  }, [templates]);

  // Find current selection
  const currentSelection = useMemo(() => {
    if (!value) return CUSTOM_MODEL_OPTION;
    return templates.find((t) => t.name === value) || CUSTOM_MODEL_OPTION;
  }, [value, templates]);

  const handleSelect = (optionName: string) => {
    if (optionName === CUSTOM_MODEL_OPTION.name) {
      // Custom Model selected - pass null as agent name, no model
      onChange(null);
    } else {
      // Agent template selected - pass agent name and its model
      const template = templates.find((t) => t.name === optionName);
      if (template) {
        onChange(template.name, template.model);
      }
    }
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="h-11 gap-1 text-xs font-medium rounded-xl border-border px-2.5"
          data-testid="agent-selector"
        >
          <User className="h-4 w-4 text-muted-foreground/70" />
          <span className="truncate text-sm">{currentSelection.displayName}</span>
          <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="end">
        <Command>
          <CommandInput placeholder="Search agents..." />
          <CommandList className="max-h-[300px] overflow-y-auto">
            <CommandEmpty>{isLoading ? 'Loading agents...' : 'No agent found.'}</CommandEmpty>

            <CommandGroup>
              {/* Custom Model option always first */}
              <CommandItem
                key={CUSTOM_MODEL_OPTION.name}
                value={CUSTOM_MODEL_OPTION.displayName}
                onSelect={() => handleSelect(CUSTOM_MODEL_OPTION.name)}
                className="flex items-center justify-between py-2"
              >
                <div className="flex flex-col">
                  <span className="font-medium">{CUSTOM_MODEL_OPTION.displayName}</span>
                  <span className="text-xs text-muted-foreground">
                    {CUSTOM_MODEL_OPTION.description}
                  </span>
                </div>
                {!value && <Check className="h-4 w-4 text-primary" />}
              </CommandItem>

              {/* Agent templates */}
              {templates.map((template) => (
                <CommandItem
                  key={template.name}
                  value={template.displayName}
                  onSelect={() => handleSelect(template.name)}
                  className="flex items-center justify-between py-2"
                >
                  <div className="flex flex-col">
                    <span className="font-medium">{template.displayName}</span>
                    <span className="text-xs text-muted-foreground">{template.description}</span>
                  </div>
                  {value === template.name && <Check className="h-4 w-4 text-primary" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
