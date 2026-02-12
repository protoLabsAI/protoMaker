/**
 * AgentSelector Component
 *
 * A command-based popover that allows selecting agent templates from the Role Registry.
 * Shows agent displayName, role badge, description, and model tier indicator.
 * Includes a 'Custom Model' fallback option that opens PhaseModelSelector.
 */

import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { useAgentTemplates, type AgentTemplateMetadata } from '@/hooks/queries/use-agent-templates';
import { PhaseModelSelector } from '@/components/views/settings-view/model-defaults/phase-model-selector';
import type { PhaseModelEntry } from '@automaker/types';
import { Check, ChevronsUpDown, Settings, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

// Model tier labels mapping
const MODEL_TIER_LABELS: Record<number, string> = {
  1: 'Basic',
  2: 'Standard',
  3: 'Advanced',
  4: 'Premium',
};

interface AgentSelectorProps {
  /** Current selected agent template name (or 'custom' for custom model) */
  value?: string;
  /** Callback when agent is selected */
  onAgentSelect?: (template: AgentTemplateMetadata) => void;
  /** Current custom model selection (used when value === 'custom') */
  customModel?: PhaseModelEntry;
  /** Callback when custom model is selected */
  onCustomModelSelect?: (entry: PhaseModelEntry) => void;
  /** Disabled state */
  disabled?: boolean;
  /** Custom trigger class name */
  triggerClassName?: string;
  /** Popover alignment */
  align?: 'start' | 'end';
}

export function AgentSelector({
  value,
  onAgentSelect,
  customModel,
  onCustomModelSelect,
  disabled = false,
  triggerClassName,
  align = 'end',
}: AgentSelectorProps) {
  const [open, setOpen] = useState(false);
  const [showCustomModelSelector, setShowCustomModelSelector] = useState(false);

  // Fetch agent templates from the Role Registry API
  const { data: templates = [], isLoading, error } = useAgentTemplates();

  // Find the currently selected template
  const selectedTemplate = useMemo(() => {
    if (value === 'custom' || !value) return null;
    return templates.find((t) => t.name === value) || null;
  }, [value, templates]);

  // Determine default selection: first template or 'backend-engineer'
  const defaultTemplate = useMemo(() => {
    if (templates.length === 0) return null;
    const backendEngineer = templates.find((t) => t.name === 'backend-engineer');
    return backendEngineer || templates[0];
  }, [templates]);

  // Get display label for the trigger button
  const triggerLabel = useMemo(() => {
    if (value === 'custom') {
      return 'Custom Model';
    }
    if (selectedTemplate) {
      return selectedTemplate.displayName;
    }
    if (defaultTemplate) {
      return defaultTemplate.displayName;
    }
    return 'Select Agent...';
  }, [value, selectedTemplate, defaultTemplate]);

  // Handle agent selection
  const handleAgentSelect = (template: AgentTemplateMetadata) => {
    onAgentSelect?.(template);
    setOpen(false);
  };

  // Handle custom model selection
  const handleCustomModelClick = () => {
    setShowCustomModelSelector(true);
    setOpen(false);
  };

  // Render individual agent item
  const renderAgentItem = (template: AgentTemplateMetadata) => {
    const isSelected = value === template.name;
    const tierLabel = MODEL_TIER_LABELS[template.tier] || 'Standard';

    return (
      <CommandItem
        key={template.name}
        value={template.displayName}
        onSelect={() => handleAgentSelect(template)}
        className="group flex items-start justify-between py-3 cursor-pointer"
      >
        <div className="flex flex-col gap-1 overflow-hidden flex-1">
          <div className="flex items-center gap-2">
            <span className={cn('font-medium text-sm truncate', isSelected && 'text-primary')}>
              {template.displayName}
            </span>
            <Badge variant="outline" size="sm" className="shrink-0">
              {template.role}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground line-clamp-2">{template.description}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
              {tierLabel}
            </span>
            {template.model && (
              <span className="text-[10px] text-muted-foreground">{template.model}</span>
            )}
          </div>
        </div>
        {isSelected && <Check className="h-4 w-4 text-primary shrink-0 ml-2" />}
      </CommandItem>
    );
  };

  // Trigger button
  const trigger = (
    <Button
      variant="outline"
      role="combobox"
      aria-expanded={open}
      disabled={disabled}
      className={cn(
        'h-11 gap-1 text-xs font-medium rounded-xl border-border px-2.5 min-w-[180px]',
        triggerClassName
      )}
      data-testid="agent-selector"
    >
      <span className="truncate text-sm">{triggerLabel}</span>
      <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
    </Button>
  );

  // Popover content
  const popoverContent = (
    <PopoverContent
      className="w-[380px] p-0"
      align={align}
      onWheel={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
    >
      <Command>
        <CommandInput placeholder="Search agents..." />
        <CommandList className="max-h-[400px] overflow-y-auto overscroll-contain touch-pan-y">
          {/* Loading State */}
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="flex flex-col items-center justify-center py-8 px-4 gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              <p className="text-sm text-center text-muted-foreground">
                Failed to load agent templates
              </p>
            </div>
          )}

          {/* Empty State (no results or no templates) */}
          {!isLoading && !error && templates.length === 0 && (
            <CommandEmpty>No agents found.</CommandEmpty>
          )}

          {/* Agent Templates List */}
          {!isLoading && !error && templates.length > 0 && (
            <>
              <CommandGroup heading="Available Agents">
                {templates.map((template) => renderAgentItem(template))}
              </CommandGroup>

              <CommandSeparator />

              {/* Custom Model Option */}
              <CommandGroup>
                <CommandItem
                  value="Custom Model"
                  onSelect={handleCustomModelClick}
                  className="group flex items-center justify-between py-2 cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <Settings className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Custom Model</span>
                  </div>
                  {value === 'custom' && <Check className="h-4 w-4 text-primary shrink-0" />}
                </CommandItem>
              </CommandGroup>
            </>
          )}
        </CommandList>
      </Command>
    </PopoverContent>
  );

  return (
    <>
      <Popover open={open} onOpenChange={setOpen} modal={false}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        {popoverContent}
      </Popover>

      {/* Custom Model Selector Dialog/Modal */}
      {showCustomModelSelector && customModel && onCustomModelSelect && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-background border border-border rounded-lg shadow-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Select Custom Model</h3>
            <PhaseModelSelector
              value={customModel}
              onChange={(entry) => {
                onCustomModelSelect(entry);
                setShowCustomModelSelector(false);
              }}
              compact
              align="start"
            />
            <div className="mt-4 flex justify-end">
              <Button
                variant="outline"
                onClick={() => setShowCustomModelSelector(false)}
                className="text-sm"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
