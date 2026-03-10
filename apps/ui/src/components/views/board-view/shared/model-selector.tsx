import { Label } from '@protolabsai/ui/atoms';
import { Badge } from '@protolabsai/ui/atoms';
import { Brain, AlertTriangle } from 'lucide-react';
import { AnthropicIcon, CursorIcon, OpenAIIcon } from '@/components/shared/provider-icon';
import { cn } from '@/lib/utils';
import { useAIModelsStore } from '@/store/ai-models-store';
import type { CursorModelId } from '@protolabsai/types';
import { useSetupStore } from '@/store/setup-store';
import { getModelProvider } from '@protolabsai/types';
import type { ModelProvider } from '@protolabsai/types';
import { CLAUDE_MODELS, CURSOR_MODELS, ModelOption } from './model-constants';
import { useEffect } from 'react';
import { Spinner } from '@protolabsai/ui/atoms';

interface ModelSelectorProps {
  selectedModel: string; // Can be ModelAlias or "cursor-{id}"
  onModelSelect: (model: string) => void;
  testIdPrefix?: string;
}

export function ModelSelector({
  selectedModel,
  onModelSelect,
  testIdPrefix = 'model-select',
}: ModelSelectorProps) {
  const {
    enabledCursorModels,
    cursorDefaultModel,
    codexModels,
    codexModelsLoading,
    codexModelsError,
    fetchCodexModels,
    disabledProviders,
  } = useAIModelsStore();
  const { cursorCliStatus, codexCliStatus, codexAuthStatus } = useSetupStore();

  const selectedProvider = getModelProvider(selectedModel);

  // Check if Cursor CLI is available
  const isCursorAvailable = cursorCliStatus?.installed && cursorCliStatus?.auth?.authenticated;

  // Check if Codex CLI is available (codexCliStatus is CliStatus without .auth; use codexAuthStatus)
  const isCodexAvailable = codexCliStatus?.installed && codexAuthStatus?.authenticated;

  // Fetch Codex models on mount
  useEffect(() => {
    if (isCodexAvailable && codexModels.length === 0 && !codexModelsLoading) {
      fetchCodexModels();
    }
  }, [isCodexAvailable, codexModels.length, codexModelsLoading, fetchCodexModels]);

  // Transform codex models from store to ModelOption format
  const dynamicCodexModels: ModelOption[] = codexModels.map((model) => {
    // Infer badge based on tier
    let badge: string | undefined;
    if (model.tier === 'premium') badge = 'Premium';
    else if (model.tier === 'basic') badge = 'Speed';
    else if (model.tier === 'standard') badge = 'Balanced';

    return {
      id: model.id,
      label: model.label,
      description: model.description,
      badge,
      provider: 'codex' as ModelProvider,
      hasThinking: model.hasThinking,
    };
  });

  // Filter Cursor models based on enabled models from global settings
  const filteredCursorModels = CURSOR_MODELS.filter((model) => {
    // enabledCursorModels stores CursorModelIds which may or may not have "cursor-" prefix
    // (e.g., 'auto', 'sonnet-4.5' without prefix, but 'cursor-gpt-5.2' with prefix)
    // CURSOR_MODELS always has the "cursor-" prefix added in model-constants.ts
    // Check both the full ID (for GPT models) and the unprefixed version (for non-GPT models)
    const unprefixedId = model.id.startsWith('cursor-') ? model.id.slice(7) : model.id;
    return (
      enabledCursorModels.includes(model.id as CursorModelId) ||
      enabledCursorModels.includes(unprefixedId as CursorModelId)
    );
  });

  const handleProviderChange = (provider: ModelProvider) => {
    if (provider === 'cursor' && selectedProvider !== 'cursor') {
      // Switch to Cursor's default model (from global settings)
      // cursorDefaultModel is now canonical (e.g., 'cursor-auto'), so use directly
      onModelSelect(cursorDefaultModel);
    } else if (provider === 'codex' && selectedProvider !== 'codex') {
      // Switch to Codex's default model (use isDefault flag from dynamic models)
      const defaultModel = codexModels.find((m) => m.isDefault);
      const defaultModelId = defaultModel?.id || codexModels[0]?.id || 'codex-gpt-5.2-codex';
      onModelSelect(defaultModelId);
    } else if (provider === 'claude' && selectedProvider !== 'claude') {
      // Switch to Claude's default model (canonical format)
      onModelSelect('claude-sonnet');
    }
  };

  // Check which providers are disabled
  const isClaudeDisabled = disabledProviders.includes('claude');
  const isCursorDisabled = disabledProviders.includes('cursor');
  const isCodexDisabled = disabledProviders.includes('codex');

  // Count available providers
  const availableProviders = [
    !isClaudeDisabled && 'claude',
    !isCursorDisabled && 'cursor',
    !isCodexDisabled && 'codex',
  ].filter(Boolean) as ModelProvider[];

  return (
    <div className="space-y-4">
      {/* Provider Selection */}
      {availableProviders.length > 1 && (
        <div className="space-y-2">
          <Label>AI Provider</Label>
          <div className="flex gap-2">
            {!isClaudeDisabled && (
              <button
                type="button"
                onClick={() => handleProviderChange('claude')}
                className={cn(
                  'flex-1 px-3 py-2 rounded-md border text-sm font-medium transition-colors flex items-center justify-center gap-2',
                  selectedProvider === 'claude'
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background hover:bg-accent border-border'
                )}
                data-testid={`${testIdPrefix}-provider-claude`}
              >
                <AnthropicIcon className="w-4 h-4" />
                Claude
              </button>
            )}
            {!isCursorDisabled && (
              <button
                type="button"
                onClick={() => handleProviderChange('cursor')}
                className={cn(
                  'flex-1 px-3 py-2 rounded-md border text-sm font-medium transition-colors flex items-center justify-center gap-2',
                  selectedProvider === 'cursor'
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background hover:bg-accent border-border'
                )}
                data-testid={`${testIdPrefix}-provider-cursor`}
              >
                <CursorIcon className="w-4 h-4" />
                Cursor CLI
              </button>
            )}
            {!isCodexDisabled && (
              <button
                type="button"
                onClick={() => handleProviderChange('codex')}
                className={cn(
                  'flex-1 px-3 py-2 rounded-md border text-sm font-medium transition-colors flex items-center justify-center gap-2',
                  selectedProvider === 'codex'
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background hover:bg-accent border-border'
                )}
                data-testid={`${testIdPrefix}-provider-codex`}
              >
                <OpenAIIcon className="w-4 h-4" />
                Codex CLI
              </button>
            )}
          </div>
        </div>
      )}

      {/* Claude Models */}
      {selectedProvider === 'claude' && !isClaudeDisabled && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-primary" />
              Claude Model
            </Label>
            <span className="text-[11px] px-2 py-0.5 rounded-full border border-primary/40 text-primary">
              Native SDK
            </span>
          </div>
          <div className="flex gap-2 flex-wrap">
            {CLAUDE_MODELS.map((option) => {
              const isSelected = selectedModel === option.id;
              const shortName = option.label.replace('Claude ', '');
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onModelSelect(option.id)}
                  title={option.description}
                  className={cn(
                    'flex-1 min-w-[80px] px-3 py-2 rounded-md border text-sm font-medium transition-colors',
                    isSelected
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background hover:bg-accent border-input'
                  )}
                  data-testid={`${testIdPrefix}-${option.id}`}
                >
                  {shortName}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Cursor Models */}
      {selectedProvider === 'cursor' && !isCursorDisabled && (
        <div className="space-y-3">
          {/* Warning when Cursor CLI is not available */}
          {!isCursorAvailable && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
              <div className="text-sm text-amber-400">
                Cursor CLI is not installed or authenticated. Configure it in Settings → AI
                Providers.
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2">
              <CursorIcon className="w-4 h-4 text-primary" />
              Cursor Model
            </Label>
            <span className="text-[11px] px-2 py-0.5 rounded-full border border-amber-500/40 text-amber-600 dark:text-amber-400">
              CLI
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {filteredCursorModels.length === 0 ? (
              <div className="text-sm text-muted-foreground p-3 border border-dashed rounded-md text-center">
                No Cursor models enabled. Enable models in Settings → AI Providers.
              </div>
            ) : (
              filteredCursorModels.map((option) => {
                const isSelected = selectedModel === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => onModelSelect(option.id)}
                    title={option.description}
                    className={cn(
                      'w-full px-3 py-2 rounded-md border text-sm font-medium transition-colors flex items-center justify-between',
                      isSelected
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background hover:bg-accent border-border'
                    )}
                    data-testid={`${testIdPrefix}-${option.id}`}
                  >
                    <span>{option.label}</span>
                    <div className="flex gap-1">
                      {option.hasThinking && (
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-xs',
                            isSelected
                              ? 'border-primary-foreground/50 text-primary-foreground'
                              : 'border-amber-500/50 text-amber-600 dark:text-amber-400'
                          )}
                        >
                          Thinking
                        </Badge>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Codex Models */}
      {selectedProvider === 'codex' && !isCodexDisabled && (
        <div className="space-y-3">
          {/* Warning when Codex CLI is not available */}
          {!isCodexAvailable && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
              <div className="text-sm text-amber-400">
                Codex CLI is not installed or authenticated. Configure it in Settings → AI
                Providers.
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2">
              <OpenAIIcon className="w-4 h-4 text-primary" />
              Codex Model
            </Label>
            <span className="text-[11px] px-2 py-0.5 rounded-full border border-emerald-500/40 text-emerald-600 dark:text-emerald-400">
              CLI
            </span>
          </div>

          {/* Loading state */}
          {codexModelsLoading && dynamicCodexModels.length === 0 && (
            <div className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
              <Spinner size="sm" />
              Loading models...
            </div>
          )}

          {/* Error state */}
          {codexModelsError && !codexModelsLoading && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
              <div className="space-y-1">
                <div className="text-sm text-red-400">Failed to load Codex models</div>
                <button
                  type="button"
                  onClick={() => fetchCodexModels(true)}
                  className="text-xs text-red-400 underline hover:no-underline"
                >
                  Retry
                </button>
              </div>
            </div>
          )}

          {/* Model list */}
          {!codexModelsLoading && !codexModelsError && dynamicCodexModels.length === 0 && (
            <div className="text-sm text-muted-foreground p-3 border border-dashed rounded-md text-center">
              No Codex models available
            </div>
          )}

          {!codexModelsLoading && dynamicCodexModels.length > 0 && (
            <div className="flex flex-col gap-2">
              {dynamicCodexModels.map((option) => {
                const isSelected = selectedModel === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => onModelSelect(option.id)}
                    title={option.description}
                    className={cn(
                      'w-full px-3 py-2 rounded-md border text-sm font-medium transition-colors flex items-center justify-between',
                      isSelected
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background hover:bg-accent border-border'
                    )}
                    data-testid={`${testIdPrefix}-${option.id}`}
                  >
                    <span>{option.label}</span>
                    <div className="flex gap-1">
                      {option.hasThinking && (
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-xs',
                            isSelected
                              ? 'border-primary-foreground/50 text-primary-foreground'
                              : 'border-emerald-500/50 text-emerald-600 dark:text-emerald-400'
                          )}
                        >
                          Thinking
                        </Badge>
                      )}
                      {option.badge && (
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-xs',
                            isSelected
                              ? 'border-primary-foreground/50 text-primary-foreground'
                              : 'border-muted-foreground/50 text-muted-foreground'
                          )}
                        >
                          {option.badge}
                        </Badge>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
