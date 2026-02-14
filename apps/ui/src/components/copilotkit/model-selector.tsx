/**
 * Model Selector for CopilotKit Sidebar
 *
 * Dropdown to choose between haiku, sonnet, and opus for workflow execution.
 * Selection persists per-workflow in localStorage.
 */

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Zap, Gauge, Brain } from 'lucide-react';

export type ModelTier = 'haiku' | 'sonnet' | 'opus';

interface ModelOption {
  value: ModelTier;
  label: string;
  description: string;
  icon: typeof Zap;
  tier: string;
}

const MODEL_OPTIONS: ModelOption[] = [
  {
    value: 'haiku',
    label: 'Haiku',
    description: 'Fast & affordable',
    icon: Zap,
    tier: 'Speed',
  },
  {
    value: 'sonnet',
    label: 'Sonnet',
    description: 'Balanced performance',
    icon: Gauge,
    tier: 'Balanced',
  },
  {
    value: 'opus',
    label: 'Opus',
    description: 'Maximum capability',
    icon: Brain,
    tier: 'Power',
  },
];

const STORAGE_KEY_PREFIX = 'copilotkit-model-';

function getStoredModel(workflowId: string): ModelTier {
  try {
    const stored = localStorage.getItem(`${STORAGE_KEY_PREFIX}${workflowId}`);
    if (stored === 'haiku' || stored === 'sonnet' || stored === 'opus') {
      return stored;
    }
  } catch {
    // localStorage unavailable
  }
  return 'sonnet';
}

function storeModel(workflowId: string, model: ModelTier) {
  try {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${workflowId}`, model);
  } catch {
    // localStorage unavailable
  }
}

interface ModelSelectorProps {
  workflowId: string;
  value: ModelTier;
  onChange: (model: ModelTier) => void;
  disabled?: boolean;
}

export function ModelSelector({ workflowId, value, onChange, disabled }: ModelSelectorProps) {
  const handleChange = (newValue: string) => {
    const model = newValue as ModelTier;
    storeModel(workflowId, model);
    onChange(model);
  };

  const selected = MODEL_OPTIONS.find((m) => m.value === value);

  return (
    <div className="flex items-center gap-2">
      <Select value={value} onValueChange={handleChange} disabled={disabled}>
        <SelectTrigger className="h-8 w-[140px] text-xs">
          <div className="flex items-center gap-1.5">
            {selected && <selected.icon className="w-3.5 h-3.5" />}
            <SelectValue />
          </div>
        </SelectTrigger>
        <SelectContent>
          {MODEL_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              <div className="flex items-center gap-2">
                <option.icon className="w-3.5 h-3.5" />
                <span>{option.label}</span>
                <span className="text-muted-foreground text-[10px] ml-1">{option.tier}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export { getStoredModel, storeModel };
