import { Label } from '@protolabsai/ui/atoms';
import { Badge } from '@protolabsai/ui/atoms';
import { Checkbox } from '@protolabsai/ui/atoms';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@protolabsai/ui/atoms';
import { cn } from '@/lib/utils';
import type { CodexModelId } from '@protolabsai/types';
import { OpenAIIcon } from '@/components/shared/provider-icon';

interface CodexModelConfigurationProps {
  enabledCodexModels: CodexModelId[];
  codexDefaultModel: CodexModelId;
  isSaving: boolean;
  onDefaultModelChange: (model: CodexModelId) => void;
  onModelToggle: (model: CodexModelId, enabled: boolean) => void;
}

interface CodexModelInfo {
  id: CodexModelId;
  label: string;
  description: string;
}

const CODEX_MODEL_INFO: Record<CodexModelId, CodexModelInfo> = {
  'codex-gpt-5.5': {
    id: 'codex-gpt-5.5',
    label: 'GPT-5.5',
    description: 'Flagship for complex coding, computer use, knowledge work, and research',
  },
  'codex-gpt-5.4': {
    id: 'codex-gpt-5.4',
    label: 'GPT-5.4',
    description: 'Professional coding with stronger reasoning and agentic capabilities',
  },
  'codex-gpt-5.4-mini': {
    id: 'codex-gpt-5.4-mini',
    label: 'GPT-5.4-mini',
    description: 'Fast, lightweight tasks and subagent operations',
  },
  'codex-gpt-5.3-codex': {
    id: 'codex-gpt-5.3-codex',
    label: 'GPT-5.3-Codex',
    description:
      'Codex-tuned: industry-leading coding performance for complex software engineering',
  },
  'codex-gpt-5.3-codex-spark': {
    id: 'codex-gpt-5.3-codex-spark',
    label: 'GPT-5.3-Codex-Spark',
    description: 'Near-instant real-time iteration (ChatGPT Pro research preview)',
  },
  'codex-gpt-5.2': {
    id: 'codex-gpt-5.2',
    label: 'GPT-5.2 (legacy)',
    description: 'Legacy general-purpose model for debugging tasks requiring deeper analysis',
  },
};

export function CodexModelConfiguration({
  enabledCodexModels,
  codexDefaultModel,
  isSaving,
  onDefaultModelChange,
  onModelToggle,
}: CodexModelConfigurationProps) {
  const availableModels = Object.values(CODEX_MODEL_INFO);

  return (
    <div
      className={cn(
        'rounded-lg overflow-hidden',
        'border border-border/50',
        'bg-gradient-to-br from-card/90 via-card/70 to-card/80 backdrop-blur-xl',
        'shadow-sm shadow-black/5'
      )}
    >
      <div className="p-4 border-b border-border/50 bg-gradient-to-r from-transparent via-accent/5 to-transparent">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-500/20 to-brand-600/10 flex items-center justify-center border border-brand-500/20">
            <OpenAIIcon className="w-5 h-5 text-brand-500" />
          </div>
          <h2 className="text-lg font-semibold text-foreground tracking-tight">
            Model Configuration
          </h2>
        </div>
        <p className="text-sm text-muted-foreground/80 ml-12">
          Configure which Codex models are available in the feature modal
        </p>
      </div>
      <div className="p-4 space-y-4">
        <div className="space-y-2">
          <Label>Default Model</Label>
          <Select
            value={codexDefaultModel}
            onValueChange={(v) => onDefaultModelChange(v as CodexModelId)}
            disabled={isSaving}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableModels.map((model) => (
                <SelectItem key={model.id} value={model.id}>
                  <div className="flex items-center gap-2">
                    <span>{model.label}</span>
                    {supportsReasoningEffort(model.id) && (
                      <Badge variant="outline" className="text-xs">
                        Thinking
                      </Badge>
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-3">
          <Label>Available Models</Label>
          <div className="grid gap-3">
            {availableModels.map((model) => {
              const isEnabled = enabledCodexModels.includes(model.id);
              const isDefault = model.id === codexDefaultModel;

              return (
                <div
                  key={model.id}
                  className="flex items-center justify-between p-3 rounded-xl border border-border/50 bg-card/50 hover:bg-accent/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={isEnabled}
                      onCheckedChange={(checked) => onModelToggle(model.id, !!checked)}
                      disabled={isSaving || isDefault}
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{model.label}</span>
                        {supportsReasoningEffort(model.id) && (
                          <Badge variant="outline" className="text-xs">
                            Thinking
                          </Badge>
                        )}
                        {isDefault && (
                          <Badge variant="secondary" className="text-xs">
                            Default
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{model.description}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function supportsReasoningEffort(modelId: string): boolean {
  // Mirrors REASONING_CAPABLE_MODELS in libs/types/src/model.ts. Per the
  // OpenAI Codex docs (https://developers.openai.com/codex/models/), only the
  // 5.5 / 5.4 family exposes reasoning effort; the 5.4-mini, 5.3-codex line,
  // and 5.2 legacy do not.
  const reasoningModels = ['codex-gpt-5.5', 'codex-gpt-5.4'];
  return reasoningModels.includes(modelId);
}
