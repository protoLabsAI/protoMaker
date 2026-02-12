import { useState, useEffect } from 'react';
import { Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { AgentRole, ROLE_CAPABILITIES } from '@automaker/types';

export const DEFAULT_MAX_TURNS = 200;

export interface AgentConfig {
  maxTurns: number;
  systemPromptOverride: string;
  role?: AgentRole;
}

interface AgentConfigPopoverProps {
  config: AgentConfig;
  onConfigChange: (config: AgentConfig) => void;
  disabled?: boolean;
}

const TURN_PRESETS = [
  { label: 'Quick (50)', value: 50 },
  { label: 'Normal (200)', value: 200 },
  { label: 'Extended (500)', value: 500 },
  { label: 'Long (1000)', value: 1000 },
];

const ROLE_OPTIONS: { value: AgentRole; label: string }[] = [
  { value: 'product-manager', label: 'Product Manager' },
  { value: 'engineering-manager', label: 'Engineering Manager' },
  { value: 'frontend-engineer', label: 'Frontend Engineer' },
  { value: 'backend-engineer', label: 'Backend Engineer' },
  { value: 'devops-engineer', label: 'DevOps Engineer' },
  { value: 'qa-engineer', label: 'QA Engineer' },
  { value: 'docs-engineer', label: 'Docs Engineer' },
  { value: 'gtm-specialist', label: 'GTM Specialist' },
];

/**
 * Categorize tools by type for visual distinction
 */
function getToolType(tool: string): 'read' | 'write' | 'execute' {
  const readTools = ['Read', 'Grep', 'Glob', 'WebSearch', 'WebFetch'];
  const writeTools = ['Write', 'Edit'];

  if (readTools.includes(tool)) return 'read';
  if (writeTools.includes(tool)) return 'write';
  return 'execute';
}

/**
 * Get badge variant based on tool type
 */
function getToolBadgeVariant(
  toolType: 'read' | 'write' | 'execute'
): 'info' | 'warning' | 'success' {
  switch (toolType) {
    case 'read':
      return 'info';
    case 'write':
      return 'warning';
    case 'execute':
      return 'success';
  }
}

export function AgentConfigPopover({ config, onConfigChange, disabled }: AgentConfigPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [localMaxTurns, setLocalMaxTurns] = useState(String(config.maxTurns));

  // Sync local state when config changes externally (e.g. preset button or reset)
  useEffect(() => {
    setLocalMaxTurns(String(config.maxTurns));
  }, [config.maxTurns]);

  const hasOverrides =
    config.maxTurns !== DEFAULT_MAX_TURNS || config.systemPromptOverride.length > 0;

  const handleMaxTurnsBlur = () => {
    const parsed = parseInt(localMaxTurns, 10);
    const clamped = Math.max(10, Math.min(5000, Number.isNaN(parsed) ? DEFAULT_MAX_TURNS : parsed));
    setLocalMaxTurns(String(clamped));
    onConfigChange({ ...config, maxTurns: clamped });
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled}
          className={cn(
            'h-8 w-8 p-0 text-muted-foreground hover:text-foreground',
            hasOverrides && 'text-brand-500'
          )}
          aria-label="Agent configuration"
        >
          <Settings2 className="w-4 h-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="space-y-4">
          <div>
            <h4 className="font-medium text-sm mb-1">Agent Configuration</h4>
            <p className="text-xs text-muted-foreground">
              Configure settings for this chat session.
            </p>
          </div>

          {/* Max Turns */}
          <div className="space-y-2">
            <Label htmlFor="agent-max-turns" className="text-xs font-medium">
              Max Turns
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {TURN_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => onConfigChange({ ...config, maxTurns: preset.value })}
                  className={cn(
                    'px-2 py-1 text-xs rounded-md border transition-colors',
                    config.maxTurns === preset.value
                      ? 'bg-brand-500/20 border-brand-500/30 text-brand-400'
                      : 'bg-accent/30 border-border/50 text-muted-foreground hover:text-foreground'
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <input
              id="agent-max-turns"
              type="number"
              min={10}
              max={5000}
              value={localMaxTurns}
              onChange={(e) => setLocalMaxTurns(e.target.value)}
              onBlur={handleMaxTurnsBlur}
              className="w-full px-2 py-1 text-xs rounded-md bg-accent/30 border border-border/50 text-foreground"
              placeholder="Custom turns..."
            />
          </div>

          {/* Role Selector */}
          <div className="space-y-2">
            <Label htmlFor="agent-role" className="text-xs font-medium">
              Agent Role
            </Label>
            <Select
              value={config.role || ''}
              onValueChange={(value) =>
                onConfigChange({
                  ...config,
                  role: value as AgentRole,
                })
              }
            >
              <SelectTrigger id="agent-role" className="w-full text-xs h-8">
                <SelectValue placeholder="Select a role..." />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value} className="text-xs">
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Available Tools */}
          {config.role && (
            <div className="space-y-2">
              <Label className="text-xs font-medium">Available Tools</Label>
              <div className="flex flex-wrap gap-1.5">
                {ROLE_CAPABILITIES[config.role].tools.map((tool) => {
                  const toolType = getToolType(tool);
                  const variant = getToolBadgeVariant(toolType);
                  return (
                    <Badge key={tool} variant={variant} className="text-xs px-2 py-0.5">
                      {tool}
                    </Badge>
                  );
                })}
              </div>
            </div>
          )}

          {/* System Prompt Override */}
          <div className="space-y-2">
            <Label htmlFor="agent-system-prompt" className="text-xs font-medium">
              System Prompt (append)
            </Label>
            <textarea
              id="agent-system-prompt"
              value={config.systemPromptOverride}
              onChange={(e) =>
                onConfigChange({
                  ...config,
                  systemPromptOverride: e.target.value,
                })
              }
              className="w-full h-20 px-2 py-1.5 text-xs rounded-md bg-accent/30 border border-border/50 text-foreground resize-none"
              placeholder="Additional instructions appended to system prompt..."
            />
          </div>

          {/* Reset */}
          {hasOverrides && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs"
              onClick={() =>
                onConfigChange({
                  maxTurns: DEFAULT_MAX_TURNS,
                  systemPromptOverride: '',
                })
              }
            >
              Reset to defaults
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
