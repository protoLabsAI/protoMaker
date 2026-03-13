import { memo, useState, useCallback } from 'react';
import { Bot, ChevronDown, ChevronUp, Check, RefreshCw } from 'lucide-react';
import { Feature } from '@/store/app-store';
import { apiPost } from '@/lib/api-fetch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@protolabsai/ui/atoms';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';

const ROLE_LABELS: Record<string, string> = {
  'frontend-engineer': 'Frontend',
  'backend-engineer': 'Backend',
  'devops-engineer': 'DevOps',
  'qa-engineer': 'QA',
  'docs-engineer': 'Docs',
  'product-manager': 'PM',
  'engineering-manager': 'EM',
  'gtm-specialist': 'GTM',
  'chief-of-staff': 'CoS',
};

function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.8) return 'text-emerald-400';
  if (confidence >= 0.6) return 'text-amber-400';
  return 'text-red-400';
}

function getConfidenceBg(confidence: number): string {
  if (confidence >= 0.8) return 'bg-emerald-500/10 border-emerald-500/30';
  if (confidence >= 0.6) return 'bg-amber-500/10 border-amber-500/30';
  return 'bg-red-500/10 border-red-500/30';
}

interface AgentSuggestionProps {
  feature: Feature;
  projectPath: string;
}

export const AgentSuggestion = memo(function AgentSuggestion({
  feature,
  projectPath,
}: AgentSuggestionProps) {
  const [expanded, setExpanded] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const queryClient = useQueryClient();

  const suggestion = feature.routingSuggestion;
  if (!suggestion) return null;

  const roleLabel = ROLE_LABELS[suggestion.role] || suggestion.role;
  const isBuiltIn = suggestion.role in ROLE_LABELS;
  const confidencePercent = Math.round(suggestion.confidence * 100);

  const handleOverride = useCallback(
    async (newRole: string) => {
      setAssigning(true);
      try {
        await apiPost('/api/features/assign-agent', {
          projectPath,
          featureId: feature.id,
          role: newRole,
        });
        queryClient.invalidateQueries({ queryKey: queryKeys.features.all(projectPath) });
      } catch {
        // Silently handle - feature may have been updated
      } finally {
        setAssigning(false);
      }
    },
    [projectPath, feature.id, queryClient]
  );

  return (
    <div className="mb-2">
      <div
        className={`flex items-center gap-1.5 rounded-md border px-2 py-1 ${getConfidenceBg(suggestion.confidence)}`}
      >
        <Bot className={`w-3 h-3 shrink-0 ${getConfidenceColor(suggestion.confidence)}`} />
        <span className="text-[11px] font-medium truncate">{roleLabel}</span>
        {isBuiltIn && (
          <span className="text-[9px] px-1 py-px rounded bg-muted text-muted-foreground border border-border shrink-0">
            built-in
          </span>
        )}
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className={`text-[10px] font-mono ${getConfidenceColor(suggestion.confidence)}`}
              >
                {confidencePercent}%
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs max-w-[200px]">
              <p>{suggestion.reasoning}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        {suggestion.autoAssigned && <Check className="w-3 h-3 text-emerald-400 shrink-0" />}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className="ml-auto text-muted-foreground hover:text-foreground"
        >
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      </div>

      {expanded && (
        <div
          className="mt-1 rounded-md border border-border bg-muted/30 p-2 space-y-1.5"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <p className="text-[10px] text-muted-foreground leading-snug">{suggestion.reasoning}</p>
          <div className="flex flex-wrap gap-1">
            {Object.entries(ROLE_LABELS).map(([role, label]) => (
              <button
                key={role}
                type="button"
                disabled={assigning}
                onClick={() => handleOverride(role)}
                className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                  role === suggestion.role
                    ? 'bg-brand-500/20 border-brand-500/40 text-brand-400'
                    : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {assigning && (
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <RefreshCw className="w-3 h-3 animate-spin" />
              Assigning...
            </div>
          )}
        </div>
      )}
    </div>
  );
});
