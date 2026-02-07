import { useState } from 'react';
import { Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export interface AgentConfig {
  maxTurns: number;
  systemPromptOverride: string;
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

export function AgentConfigPopover({
  config,
  onConfigChange,
  disabled,
}: AgentConfigPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);

  const hasOverrides = config.maxTurns !== 200 || config.systemPromptOverride.length > 0;

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
            <Label className="text-xs font-medium">Max Turns</Label>
            <div className="flex flex-wrap gap-1.5">
              {TURN_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() =>
                    onConfigChange({ ...config, maxTurns: preset.value })
                  }
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
              type="number"
              min={10}
              max={5000}
              value={config.maxTurns}
              onChange={(e) =>
                onConfigChange({
                  ...config,
                  maxTurns: Math.max(10, Math.min(5000, parseInt(e.target.value) || 200)),
                })
              }
              className="w-full px-2 py-1 text-xs rounded-md bg-accent/30 border border-border/50 text-foreground"
              placeholder="Custom turns..."
            />
          </div>

          {/* System Prompt Override */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">System Prompt (append)</Label>
            <textarea
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
                  maxTurns: 200,
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
