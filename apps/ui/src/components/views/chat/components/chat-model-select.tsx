/**
 * ChatModelSelect — Model selector dropdown for chat.
 *
 * Allows switching between haiku/sonnet/opus.
 * Persists selection in localStorage.
 */

import { useState, useEffect } from 'react';
import { Cpu } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@protolabs/ui/atoms';
import { cn } from '@/lib/utils';

const MODELS = [
  { value: 'haiku', label: 'Haiku', description: 'Fast & light' },
  { value: 'sonnet', label: 'Sonnet', description: 'Balanced' },
  { value: 'opus', label: 'Opus', description: 'Most capable' },
] as const;

const STORAGE_KEY = 'chat-model-alias';

export function ChatModelSelect({
  value,
  onValueChange,
  className,
}: {
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger
        data-slot="chat-model-select"
        className={cn(
          'h-7 w-auto gap-1 border-none bg-transparent px-2 text-xs text-muted-foreground hover:text-foreground',
          className
        )}
      >
        <Cpu className="size-3" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {MODELS.map((model) => (
          <SelectItem key={model.value} value={model.value}>
            <span className="font-medium">{model.label}</span>
            <span className="ml-1 text-muted-foreground">— {model.description}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

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
