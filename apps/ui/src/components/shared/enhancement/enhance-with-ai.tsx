import { useState } from 'react';
import { createLogger } from '@protolabsai/utils/logger';
import { Button } from '@protolabsai/ui/atoms';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@protolabsai/ui/atoms';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@protolabsai/ui/atoms';
import { Sparkles, ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { getElectronAPI } from '@/lib/electron';
import { ModelOverrideTrigger, useModelOverride } from '@/components/shared';
import type { EnhancementMode as CoreEnhancementMode } from '@protolabsai/types';
import { type EnhancementMode, ENHANCEMENT_MODE_LABELS } from './enhancement-constants';
import { useAppStore } from '@/store/app-store';

const logger = createLogger('EnhanceWithAI');

interface EnhanceWithAIProps {
  /** Current text value to enhance */
  value: string;
  /** Callback when text is enhanced */
  onChange: (enhancedText: string) => void;
  /** Optional callback to track enhancement in history.
   *  mode is typed as core EnhancementMode for backward compatibility with board-view consumers. */
  onHistoryAdd?: (entry: {
    mode: CoreEnhancementMode;
    originalText: string;
    enhancedText: string;
  }) => void;
  /** Disable the enhancement feature */
  disabled?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Restrict available modes (defaults to all modes) */
  modes?: EnhancementMode[];
}

/**
 * Reusable "Enhance with AI" component
 *
 * Provides AI-powered text enhancement with multiple modes.
 * Used in feature dialogs, project wizard steps, and PRD editing.
 */
export function EnhanceWithAI({
  value,
  onChange,
  onHistoryAdd,
  disabled = false,
  className,
  modes,
}: EnhanceWithAIProps) {
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [enhancementMode, setEnhancementMode] = useState<EnhancementMode>(modes?.[0] ?? 'improve');
  const [enhanceOpen, setEnhanceOpen] = useState(false);

  // Get current project path for per-project Claude API profile
  const currentProjectPath = useAppStore((state) => state.currentProject?.path);

  // Enhancement model override
  const enhancementOverride = useModelOverride({ phase: 'enhancementModel' });

  const availableModes = modes
    ? (Object.entries(ENHANCEMENT_MODE_LABELS) as [EnhancementMode, string][]).filter(([mode]) =>
        modes.includes(mode)
      )
    : (Object.entries(ENHANCEMENT_MODE_LABELS) as [EnhancementMode, string][]);

  const handleEnhance = async () => {
    if (!value.trim() || isEnhancing || disabled) return;

    setIsEnhancing(true);
    try {
      const api = getElectronAPI();
      const result = await api.enhancePrompt?.enhance(
        value,
        enhancementMode,
        enhancementOverride.effectiveModel,
        enhancementOverride.effectiveModelEntry.thinkingLevel,
        currentProjectPath
      );

      if (result?.success && result.enhancedText) {
        const originalText = value;
        const enhancedText = result.enhancedText;
        onChange(enhancedText);

        // Track in history if callback provided (includes original for restoration)
        onHistoryAdd?.({
          mode: enhancementMode as CoreEnhancementMode,
          originalText,
          enhancedText,
        });

        toast.success('Enhanced successfully!');
      } else {
        toast.error(result?.error || 'Failed to enhance');
      }
    } catch (error) {
      logger.error('Enhancement failed:', error);
      toast.error('Failed to enhance');
    } finally {
      setIsEnhancing(false);
    }
  };

  return (
    <Collapsible open={enhanceOpen} onOpenChange={setEnhanceOpen} className={className}>
      <CollapsibleTrigger asChild>
        <button
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full py-1"
          disabled={disabled}
        >
          {enhanceOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          <Sparkles className="w-4 h-4" />
          <span>Enhance with AI</span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-3">
        <div className="flex flex-wrap items-center gap-2 pl-6">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-xs" disabled={disabled}>
                {ENHANCEMENT_MODE_LABELS[enhancementMode]}
                <ChevronDown className="w-3 h-3 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {availableModes.map(([mode, label]) => (
                <DropdownMenuItem key={mode} onClick={() => setEnhancementMode(mode)}>
                  {label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            type="button"
            variant="default"
            size="sm"
            className="h-8 text-xs"
            onClick={handleEnhance}
            disabled={!value.trim() || isEnhancing || disabled}
            loading={isEnhancing}
          >
            <Sparkles className="w-3 h-3 mr-1" />
            Enhance
          </Button>

          <ModelOverrideTrigger
            currentModelEntry={enhancementOverride.effectiveModelEntry}
            onModelChange={enhancementOverride.setOverride}
            phase="enhancementModel"
            isOverridden={enhancementOverride.isOverridden}
            size="sm"
            variant="icon"
          />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
