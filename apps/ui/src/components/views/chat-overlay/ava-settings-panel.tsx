/**
 * AvaSettingsPanel — Settings popover for the Ava chat overlay.
 *
 * Provides project-scoped configuration for the Ava assistant:
 * - Default model selector (haiku / sonnet / opus)
 * - Tool group capability toggles
 * - Context and sitrep injection toggles
 * - System prompt extension textarea
 *
 * Reads and writes AvaConfig via the existing /api/ava/config endpoints.
 * Each toggle fires an immediate mutation (no save button). The textarea
 * auto-saves on blur or after a 1s debounce.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { Settings, Loader2 } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Switch } from '@protolabs-ai/ui/atoms';
import { toast } from 'sonner';
import { getHttpApiClient } from '@/lib/http-api-client';
import { cn } from '@/lib/utils';
import type { AvaConfig, AvaToolGroups } from '@/lib/clients/ava-client';

export interface AvaSettingsPanelProps {
  /** Absolute path of the current project */
  projectPath?: string;
}

// ── Tool group metadata ───────────────────────────────────────────────────────

const TOOL_GROUP_ENTRIES: Array<{
  key: keyof AvaToolGroups;
  label: string;
  description: string;
}> = [
  { key: 'boardRead', label: 'Board (read)', description: 'View features and board summary' },
  { key: 'boardWrite', label: 'Board (write)', description: 'Create, update, and delete features' },
  { key: 'agentControl', label: 'Agent Control', description: 'Start, stop, and monitor agents' },
  { key: 'autoMode', label: 'Auto-Mode', description: 'Start and stop autonomous execution' },
  { key: 'projectMgmt', label: 'Project Spec', description: 'Read and update the project spec' },
  {
    key: 'orchestration',
    label: 'Orchestration',
    description: 'Manage feature dependencies and order',
  },
];

// ── Model options ─────────────────────────────────────────────────────────────

const MODEL_OPTIONS: Array<{ value: AvaConfig['model']; label: string }> = [
  { value: 'haiku', label: 'Haiku' },
  { value: 'sonnet', label: 'Sonnet' },
  { value: 'opus', label: 'Opus' },
];

// ── Component ─────────────────────────────────────────────────────────────────

export function AvaSettingsPanel({ projectPath }: AvaSettingsPanelProps) {
  const queryClient = useQueryClient();

  // Local textarea state for debounced saves
  const [localPrompt, setLocalPrompt] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Query: load AvaConfig ─────────────────────────────────────────────────

  const { data, isLoading } = useQuery({
    queryKey: ['ava-config', projectPath],
    queryFn: async () => {
      const api = getHttpApiClient();
      const res = await api.ava.getConfig(projectPath!);
      if (!res.success || !res.config) throw new Error(res.error ?? 'Failed to load config');
      return res.config;
    },
    enabled: !!projectPath,
    staleTime: 10_000,
  });

  // Sync server data to local textarea state
  useEffect(() => {
    if (data) {
      setLocalPrompt(data.systemPromptExtension ?? '');
    }
  }, [data]);

  // ── Mutation: save partial AvaConfig ──────────────────────────────────────

  const saveMutation = useMutation({
    mutationFn: async (partial: Partial<AvaConfig>) => {
      const api = getHttpApiClient();
      const res = await api.ava.updateConfig(projectPath!, partial);
      if (!res.success) throw new Error(res.error ?? 'Failed to save config');
      return res.config!;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(['ava-config', projectPath], updated);
      toast.success('Settings updated');
    },
    onError: (err) => {
      toast.error(`Failed to save: ${err instanceof Error ? err.message : 'Unknown error'}`);
    },
  });

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleModelChange = useCallback(
    (model: AvaConfig['model']) => {
      saveMutation.mutate({ model });
    },
    [saveMutation]
  );

  const handleToolGroupToggle = useCallback(
    (key: keyof AvaToolGroups, checked: boolean) => {
      if (!data) return;
      saveMutation.mutate({ toolGroups: { ...data.toolGroups, [key]: checked } });
    },
    [saveMutation, data]
  );

  const handleToggle = useCallback(
    (key: 'contextInjection' | 'sitrepInjection', checked: boolean) => {
      saveMutation.mutate({ [key]: checked });
    },
    [saveMutation]
  );

  const handlePromptChange = useCallback(
    (value: string) => {
      setLocalPrompt(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        saveMutation.mutate({ systemPromptExtension: value });
      }, 1000);
    },
    [saveMutation]
  );

  const handlePromptBlur = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (localPrompt !== (data?.systemPromptExtension ?? '')) {
      saveMutation.mutate({ systemPromptExtension: localPrompt });
    }
  }, [localPrompt, data?.systemPromptExtension, saveMutation]);

  // Cleanup debounce timer
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // ── No project state ──────────────────────────────────────────────────────

  if (!projectPath) {
    return (
      <div data-slot="ava-settings-panel" className="p-4 space-y-3">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <Settings className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Ava Settings</span>
        </div>
        <p className="text-xs text-muted-foreground">Open a project to configure Ava.</p>
      </div>
    );
  }

  // ── Loading state ─────────────────────────────────────────────────────────

  if (isLoading || !data) {
    return (
      <div data-slot="ava-settings-panel" className="p-4 space-y-3">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <Settings className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Ava Settings</span>
        </div>
        <div className="flex items-center justify-center py-6">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div data-slot="ava-settings-panel" className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border pb-3">
        <Settings className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">Ava Settings</span>
      </div>

      {/* Default Model */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-foreground">Default Model</p>
        <div className="flex gap-1">
          {MODEL_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleModelChange(opt.value)}
              className={cn(
                'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                data.model === opt.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">Sets the model for new conversations.</p>
      </div>

      <hr className="border-border" />

      {/* Capabilities */}
      <div className="space-y-3">
        <p className="text-xs font-medium text-foreground">Capabilities</p>
        {TOOL_GROUP_ENTRIES.map((entry) => (
          <ToggleRow
            key={entry.key}
            label={entry.label}
            checked={data.toolGroups[entry.key]}
            onChange={(checked) => handleToolGroupToggle(entry.key, checked)}
          />
        ))}
      </div>

      <hr className="border-border" />

      {/* Context & Sitrep injection */}
      <div className="space-y-3">
        <ToggleRow
          label="Context Injection"
          description="Injects CLAUDE.md and context files."
          checked={data.contextInjection}
          onChange={(checked) => handleToggle('contextInjection', checked)}
        />
        <ToggleRow
          label="Situation Report"
          description="Injects live board status into prompt."
          checked={data.sitrepInjection}
          onChange={(checked) => handleToggle('sitrepInjection', checked)}
        />
      </div>

      <hr className="border-border" />

      {/* System Prompt Extension */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-foreground">System Prompt Extension</p>
        <textarea
          value={localPrompt}
          onChange={(e) => handlePromptChange(e.target.value)}
          onBlur={handlePromptBlur}
          placeholder="Custom instructions appended to Ava's base prompt..."
          rows={3}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-y min-h-[60px]"
        />
      </div>

      {/* Project path footer */}
      <div className="pt-1 border-t border-border">
        <p className="text-[11px] text-muted-foreground truncate" title={projectPath}>
          Project: {projectPath}
        </p>
      </div>
    </div>
  );
}

// ── ToggleRow ─────────────────────────────────────────────────────────────────

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 cursor-pointer">
      <div className="space-y-0.5">
        <p className="text-xs text-foreground">{label}</p>
        {description && <p className="text-[11px] text-muted-foreground">{description}</p>}
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        className="shrink-0 h-5 w-9 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input [&>span]:h-4 [&>span]:w-4 [&>span]:data-[state=checked]:translate-x-4"
      />
    </label>
  );
}
