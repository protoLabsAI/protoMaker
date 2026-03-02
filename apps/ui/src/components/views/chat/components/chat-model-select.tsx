/**
 * ChatModelSelect — Enhanced model selector combobox for chat.
 *
 * Uses Radix Popover + cmdk Command for a rich combobox experience.
 * Shows three models with tier badges: haiku (fast, blue), sonnet (balanced,
 * purple), opus (powerful, gold). Each option shows model name, tier badge,
 * and brief description. Keyboard navigation is supported (arrow keys, enter,
 * escape). Trigger shows current model with a tier-color dot.
 *
 * Preserves backward compatibility: same value / onValueChange props.
 */

import { useState, useEffect } from 'react';
import { Command } from 'cmdk';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { Cpu, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Model definitions
// ---------------------------------------------------------------------------

type TierColor = 'blue' | 'purple' | 'gold';

interface ModelDefinition {
  value: string;
  label: string;
  tier: string;
  description: string;
  tierColor: TierColor;
  shortcut: string;
}

const MODELS: ModelDefinition[] = [
  {
    value: 'haiku',
    label: 'Haiku',
    tier: 'Fast',
    description: 'Fastest responses, great for quick tasks',
    tierColor: 'blue',
    shortcut: '⌘1',
  },
  {
    value: 'sonnet',
    label: 'Sonnet',
    tier: 'Balanced',
    description: 'Best balance of speed and intelligence',
    tierColor: 'purple',
    shortcut: '⌘2',
  },
  {
    value: 'opus',
    label: 'Opus',
    tier: 'Powerful',
    description: 'Most capable model for complex tasks',
    tierColor: 'gold',
    shortcut: '⌘3',
  },
];

const STORAGE_KEY = 'chat-model-alias';

// ---------------------------------------------------------------------------
// Tier badge styles
// ---------------------------------------------------------------------------

const TIER_DOT_CLASSES: Record<TierColor, string> = {
  blue: 'bg-blue-500',
  purple: 'bg-purple-500',
  gold: 'bg-yellow-500',
};

const TIER_BADGE_CLASSES: Record<TierColor, string> = {
  blue: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  purple: 'bg-purple-500/15 text-purple-600 dark:text-purple-400',
  gold: 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ChatModelSelect({
  value,
  onValueChange,
  className,
}: {
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  const currentModel = MODELS.find((m) => m.value === value) ?? MODELS[1];

  const handleSelect = (modelValue: string) => {
    onValueChange(modelValue);
    setOpen(false);
  };

  // Keyboard shortcut: ⌘1/2/3 (or Ctrl+1/2/3) to switch models directly
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e.metaKey && !e.ctrlKey) return;
      if (e.key === '1') {
        e.preventDefault();
        handleSelect('haiku');
      } else if (e.key === '2') {
        e.preventDefault();
        handleSelect('sonnet');
      } else if (e.key === '3') {
        e.preventDefault();
        handleSelect('opus');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      {/* ------------------------------------------------------------------ */}
      {/* Trigger button                                                       */}
      {/* ------------------------------------------------------------------ */}
      <PopoverPrimitive.Trigger asChild>
        <button
          data-slot="chat-model-select"
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={`Model: ${currentModel.label} (${currentModel.tier})`}
          className={cn(
            'inline-flex h-7 items-center gap-1.5 rounded-md border-none bg-transparent px-2 text-xs text-muted-foreground',
            'hover:text-foreground hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
            'transition-colors cursor-pointer select-none',
            className
          )}
        >
          <Cpu className="size-3 shrink-0" />
          {/* Tier color dot indicates current model tier */}
          <span
            className={cn(
              'size-1.5 rounded-full shrink-0',
              TIER_DOT_CLASSES[currentModel.tierColor]
            )}
            aria-hidden="true"
          />
          <span className="font-medium">{currentModel.label}</span>
        </button>
      </PopoverPrimitive.Trigger>

      {/* ------------------------------------------------------------------ */}
      {/* Popover content with cmdk Command combobox                          */}
      {/* ------------------------------------------------------------------ */}
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={6}
          onEscapeKeyDown={() => setOpen(false)}
          className={cn(
            'z-50 w-72 rounded-lg border border-border bg-popover p-1 shadow-md',
            'animate-in fade-in-0 zoom-in-95',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
            'data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2'
          )}
        >
          <Command loop>
            {/* Header label */}
            <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Select Model
            </div>

            <Command.List role="listbox" aria-label="Available models">
              {MODELS.map((model) => {
                const isSelected = model.value === value;
                return (
                  <Command.Item
                    key={model.value}
                    value={model.value}
                    onSelect={handleSelect}
                    role="option"
                    aria-selected={isSelected}
                    className={cn(
                      'relative flex cursor-pointer select-none items-start gap-3 rounded-md px-2 py-2',
                      'text-sm outline-none',
                      'data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground',
                      'hover:bg-accent hover:text-accent-foreground',
                      isSelected && 'bg-accent/50'
                    )}
                  >
                    {/* Tier color dot */}
                    <span
                      className={cn(
                        'mt-0.5 size-2 shrink-0 rounded-full',
                        TIER_DOT_CLASSES[model.tierColor]
                      )}
                      aria-hidden="true"
                    />

                    {/* Model info */}
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">{model.label}</span>
                        {/* Tier badge */}
                        <span
                          className={cn(
                            'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold leading-none',
                            TIER_BADGE_CLASSES[model.tierColor]
                          )}
                        >
                          {model.tier}
                        </span>
                        {/* Keyboard shortcut indicator */}
                        <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
                          {model.shortcut}
                        </span>
                      </div>
                      <p className="text-[11px] leading-snug text-muted-foreground">
                        {model.description}
                      </p>
                    </div>

                    {/* Selected checkmark */}
                    {isSelected && (
                      <Check
                        className="mt-0.5 size-3.5 shrink-0 text-foreground"
                        aria-hidden="true"
                      />
                    )}
                  </Command.Item>
                );
              })}
            </Command.List>
          </Command>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

// ---------------------------------------------------------------------------
// Hook — unchanged from original for backward compatibility
// ---------------------------------------------------------------------------

/** Hook for persisting model selection in localStorage */
export function useChatModelSelection(defaultModel = 'sonnet') {
  const [model, setModel] = useState(defaultModel);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && ['haiku', 'sonnet', 'opus'].includes(stored)) {
      setModel(stored);
    }
  }, []);

  const setModelAndPersist = (value: string) => {
    setModel(value);
    localStorage.setItem(STORAGE_KEY, value);
  };

  return [model, setModelAndPersist] as const;
}
