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
import { Settings, Loader2, ChevronRight, AlertTriangle } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getHttpApiClient } from '@/lib/http-api-client';
import { cn } from '@/lib/utils';
import {
  Switch,
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@protolabs-ai/ui/atoms';
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
  {
    key: 'agentDelegation',
    label: 'Agent Delegation',
    description: 'Delegate tasks to specialized agents',
  },
  { key: 'notes', label: 'Notes', description: 'Read and write project notes' },
  { key: 'metrics', label: 'Metrics', description: 'View project and capacity metrics' },
  { key: 'prWorkflow', label: 'PR Workflow', description: 'Check PR status, feedback, and merge' },
  { key: 'promotion', label: 'Promotion', description: 'List staging candidates and promote' },
  { key: 'contextFiles', label: 'Context Files', description: 'Manage agent context files' },
  { key: 'projects', label: 'Projects', description: 'List, view, and create projects' },
  { key: 'briefing', label: 'Briefing', description: 'Daily briefing and event digest' },
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

  const handleMcpServerToggle = useCallback(
    (serverId: string, enabled: boolean) => {
      if (!data) return;
      const updated = (data.mcpServers ?? []).map((s) =>
        s.id === serverId ? { ...s, enabled } : s
      );
      saveMutation.mutate({ mcpServers: updated });
    },
    [saveMutation, data]
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
        {data.subagentTrust === 'gated' && (
          <span
            data-slot="gated-badge"
            title="Gated (review) mode is active — sub-agent tool calls require approval"
            className="ml-auto flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400"
          >
            <AlertTriangle className="size-3" />
            Gated
          </span>
        )}
      </div>

      {/* Default Model */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-foreground">Default Model</p>
        <Select
          value={data.model}
          onValueChange={(v) => handleModelChange(v as AvaConfig['model'])}
        >
          <SelectTrigger className="h-7 w-24 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MODEL_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value} className="text-xs">
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <hr className="border-border" />

      {/* Capabilities — collapsible chip grid */}
      <Collapsible>
        <CollapsibleTrigger className="flex w-full items-center gap-1.5 text-xs font-medium text-foreground group">
          <ChevronRight className="size-3 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
          Capabilities
          <span className="ml-auto text-[10px] font-normal text-muted-foreground">
            {TOOL_GROUP_ENTRIES.filter((e) => data.toolGroups[e.key]).length}/
            {TOOL_GROUP_ENTRIES.length}
          </span>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="grid grid-cols-2 gap-1.5 pt-2">
            {TOOL_GROUP_ENTRIES.map((entry) => (
              <button
                key={entry.key}
                type="button"
                onClick={() => handleToolGroupToggle(entry.key, !data.toolGroups[entry.key])}
                title={entry.description}
                className={cn(
                  'flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px] transition-colors',
                  data.toolGroups[entry.key]
                    ? 'border-primary/30 bg-primary/10 text-foreground'
                    : 'border-border bg-muted/30 text-muted-foreground'
                )}
              >
                <span
                  className={cn(
                    'size-1.5 shrink-0 rounded-full',
                    data.toolGroups[entry.key] ? 'bg-green-500' : 'bg-muted-foreground/30'
                  )}
                />
                {entry.label}
              </button>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>

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

      {/* Auto-approve destructive tools */}
      <div className="space-y-3">
        <ToggleRow
          label="Auto-approve Tools"
          description="Skip confirmation for destructive actions (merge, delegate, promote)."
          checked={data.autoApproveTools}
          onChange={(checked) => saveMutation.mutate({ autoApproveTools: checked })}
        />
      </div>

      <hr className="border-border" />

      {/* Subagent Trust */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-foreground">Subagent Trust</p>
        <div className="flex gap-2">
          <button
            type="button"
            data-slot="trust-full"
            onClick={() => saveMutation.mutate({ subagentTrust: 'full' })}
            className={cn(
              'flex-1 rounded-md border px-3 py-2 text-[11px] transition-colors text-left',
              (data.subagentTrust ?? 'full') === 'full'
                ? 'border-primary/40 bg-primary/10 text-foreground'
                : 'border-border bg-muted/30 text-muted-foreground'
            )}
          >
            <p className="font-medium">Full (autonomous)</p>
            <p className="mt-0.5 text-muted-foreground leading-tight">
              Sub-agents run without interruption.
            </p>
          </button>
          <button
            type="button"
            data-slot="trust-gated"
            onClick={() => saveMutation.mutate({ subagentTrust: 'gated' })}
            className={cn(
              'flex-1 rounded-md border px-3 py-2 text-[11px] transition-colors text-left',
              data.subagentTrust === 'gated'
                ? 'border-amber-500/40 bg-amber-500/10 text-foreground'
                : 'border-border bg-muted/30 text-muted-foreground'
            )}
          >
            <p className="font-medium">Gated (review)</p>
            <p className="mt-0.5 text-muted-foreground leading-tight">
              Each tool call paused for approval.
            </p>
          </button>
        </div>
      </div>

      {/* MCP Servers — only shown when servers are configured */}
      {(data.mcpServers ?? []).length > 0 && (
        <>
          <hr className="border-border" />
          <Collapsible>
            <CollapsibleTrigger className="flex w-full items-center gap-1.5 text-xs font-medium text-foreground group">
              <ChevronRight className="size-3 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
              MCP Servers
              <span className="ml-auto text-[10px] font-normal text-muted-foreground">
                {(data.mcpServers ?? []).filter((s) => s.enabled !== false).length}/
                {(data.mcpServers ?? []).length}
              </span>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="grid grid-cols-2 gap-1.5 pt-2">
                {(data.mcpServers ?? []).map((server) => (
                  <button
                    key={server.id}
                    type="button"
                    onClick={() => handleMcpServerToggle(server.id, server.enabled === false)}
                    title={server.description ?? server.name}
                    className={cn(
                      'flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px] transition-colors',
                      server.enabled !== false
                        ? 'border-primary/30 bg-primary/10 text-foreground'
                        : 'border-border bg-muted/30 text-muted-foreground'
                    )}
                  >
                    <span
                      className={cn(
                        'size-1.5 shrink-0 rounded-full',
                        server.enabled !== false ? 'bg-green-500' : 'bg-muted-foreground/30'
                      )}
                    />
                    {server.name}
                  </button>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </>
      )}

      <hr className="border-border" />

      {/* System Prompt Extension — collapsible */}
      <Collapsible>
        <CollapsibleTrigger className="flex w-full items-center gap-1.5 text-xs font-medium text-foreground group">
          <ChevronRight className="size-3 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
          System Prompt Extension
          {localPrompt && (
            <span className="ml-auto size-1.5 rounded-full bg-primary" title="Custom prompt set" />
          )}
        </CollapsibleTrigger>
        <CollapsibleContent>
          <textarea
            value={localPrompt}
            onChange={(e) => handlePromptChange(e.target.value)}
            onBlur={handlePromptBlur}
            placeholder="Custom instructions appended to Ava's base prompt..."
            rows={3}
            className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-y min-h-[60px]"
          />
        </CollapsibleContent>
      </Collapsible>

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
