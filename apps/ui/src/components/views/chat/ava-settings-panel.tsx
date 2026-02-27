/**
 * AvaSettingsPanel — Configure Ava AI assistant per-project settings.
 *
 * Allows selecting the AI model, enabling/disabling tool groups,
 * toggling sitrep/context injection, and extending the system prompt.
 * Loads config on mount via useQuery, saves via useMutation.
 */

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Save } from 'lucide-react';
import { Button } from '@protolabs-ai/ui/atoms';
import { api } from '@/lib/api';
import type { AvaConfig, AvaToolGroups } from '@/lib/api';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ModelAlias = 'haiku' | 'sonnet' | 'opus';

const MODELS: { value: ModelAlias; label: string; description: string }[] = [
  { value: 'haiku', label: 'Haiku', description: 'Fast & light' },
  { value: 'sonnet', label: 'Sonnet', description: 'Balanced' },
  { value: 'opus', label: 'Opus', description: 'Most capable' },
];

interface ToolGroupDef {
  key: keyof AvaToolGroups;
  label: string;
  description: string;
}

const TOOL_GROUPS: ToolGroupDef[] = [
  {
    key: 'boardRead',
    label: 'Board Read',
    description: 'Allow Ava to read board cards and project state',
  },
  {
    key: 'boardWrite',
    label: 'Board Write',
    description: 'Allow Ava to create and update board cards',
  },
  {
    key: 'agentControl',
    label: 'Agent Control',
    description: 'Allow Ava to start and stop coding agents',
  },
  {
    key: 'autoMode',
    label: 'Auto Mode',
    description: 'Allow Ava to trigger autonomous multi-step workflows',
  },
  {
    key: 'projectMgmt',
    label: 'Project Management',
    description: 'Allow Ava to manage backlog items and milestones',
  },
  {
    key: 'orchestration',
    label: 'Orchestration',
    description: 'Allow Ava to coordinate multiple agents and sessions',
  },
];

const DEFAULT_CONFIG: AvaConfig = {
  model: 'sonnet',
  toolGroups: {
    boardRead: true,
    boardWrite: false,
    agentControl: false,
    autoMode: false,
    projectMgmt: false,
    orchestration: false,
  },
  sitrepInjection: true,
  contextInjection: true,
  systemPromptExtension: '',
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="mr-4 flex-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
          checked ? 'bg-violet-500' : 'bg-muted'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AvaSettingsPanel({ projectPath }: { projectPath: string }) {
  const queryClient = useQueryClient();

  const [localConfig, setLocalConfig] = useState<AvaConfig>(DEFAULT_CONFIG);

  // Load config
  const {
    data,
    isLoading,
    error: loadError,
  } = useQuery({
    queryKey: ['ava-config', projectPath],
    queryFn: () => api.ava.getConfig(projectPath),
    enabled: !!projectPath,
  });

  // Sync remote config into local state
  useEffect(() => {
    if (data?.config) {
      setLocalConfig(data.config);
    }
  }, [data]);

  // Save mutation
  const { mutate: saveConfig, isPending: isSaving } = useMutation({
    mutationFn: () => api.ava.updateConfig(projectPath, localConfig),
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ['ava-config', projectPath] });
        toast.success('Ava settings saved');
      } else {
        toast.error(result.error ?? 'Failed to save settings');
      }
    },
    onError: (err: Error) => {
      toast.error(err.message ?? 'Failed to save settings');
    },
  });

  // Setters
  const setModel = (model: ModelAlias) => setLocalConfig((c) => ({ ...c, model }));

  const setToolGroup = (key: keyof AvaToolGroups, value: boolean) =>
    setLocalConfig((c) => ({
      ...c,
      toolGroups: { ...c.toolGroups, [key]: value },
    }));

  const setSitrepInjection = (v: boolean) => setLocalConfig((c) => ({ ...c, sitrepInjection: v }));
  const setContextInjection = (v: boolean) =>
    setLocalConfig((c) => ({ ...c, contextInjection: v }));
  const setSystemPromptExtension = (v: string) =>
    setLocalConfig((c) => ({ ...c, systemPromptExtension: v }));

  // Loading state
  if (isLoading) {
    return (
      <div
        data-slot="ava-settings-panel"
        className="flex items-center justify-center py-8 text-muted-foreground"
      >
        <Loader2 className="mr-2 size-4 animate-spin" />
        <span className="text-sm">Loading settings…</span>
      </div>
    );
  }

  // Error state
  if (loadError) {
    return (
      <div
        data-slot="ava-settings-panel"
        className="rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive"
      >
        {(loadError as Error).message ?? 'Failed to load Ava settings'}
      </div>
    );
  }

  return (
    <div data-slot="ava-settings-panel" className="flex flex-col gap-6 p-4">
      {/* Model selector */}
      <section>
        <h3 className="mb-2 text-sm font-semibold">Model</h3>
        <div className="flex gap-2">
          {MODELS.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => setModel(m.value)}
              className={`flex flex-col items-center rounded-md border px-4 py-2 text-xs transition-colors ${
                localConfig.model === m.value
                  ? 'border-violet-500 bg-violet-500/10 text-violet-600'
                  : 'border-border text-muted-foreground hover:border-violet-400 hover:text-foreground'
              }`}
            >
              <span className="font-semibold">{m.label}</span>
              <span className="text-[10px]">{m.description}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Tool group toggles */}
      <section>
        <h3 className="mb-1 text-sm font-semibold">Tool Groups</h3>
        <p className="mb-2 text-xs text-muted-foreground">
          Control which capabilities Ava can use in this project
        </p>
        <div className="divide-y divide-border">
          {TOOL_GROUPS.map((tg) => (
            <ToggleRow
              key={tg.key}
              label={tg.label}
              description={tg.description}
              checked={localConfig.toolGroups[tg.key]}
              onChange={(v) => setToolGroup(tg.key, v)}
            />
          ))}
        </div>
      </section>

      {/* Injection toggles */}
      <section>
        <h3 className="mb-1 text-sm font-semibold">Context Injection</h3>
        <div className="divide-y divide-border">
          <ToggleRow
            label="Sitrep Injection"
            description="Inject project situation report into each Ava prompt"
            checked={localConfig.sitrepInjection}
            onChange={setSitrepInjection}
          />
          <ToggleRow
            label="Context Injection"
            description="Inject current view context (board, notes, etc.) into prompts"
            checked={localConfig.contextInjection}
            onChange={setContextInjection}
          />
        </div>
      </section>

      {/* System prompt extension */}
      <section>
        <h3 className="mb-1 text-sm font-semibold">System Prompt Extension</h3>
        <p className="mb-2 text-xs text-muted-foreground">
          Additional instructions appended to Ava's system prompt for this project
        </p>
        <textarea
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-violet-500"
          rows={4}
          placeholder="Enter additional system prompt instructions…"
          value={localConfig.systemPromptExtension}
          onChange={(e) => setSystemPromptExtension(e.target.value)}
        />
      </section>

      {/* Save button */}
      <div className="flex justify-end">
        <Button onClick={() => saveConfig()} disabled={isSaving} className="gap-2">
          {isSaving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Save
        </Button>
      </div>
    </div>
  );
}
