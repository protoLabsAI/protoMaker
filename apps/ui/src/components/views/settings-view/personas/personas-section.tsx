import { useState, useCallback, useEffect } from 'react';
import { Button, Badge, Switch, Textarea, Input } from '@protolabs-ai/ui/atoms';
import {
  Users,
  RotateCcw,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Wrench,
  Shield,
  Cpu,
  FolderOpen,
  RefreshCw,
  Pencil,
  Check,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useGlobalSettings } from '@/hooks/queries/use-settings';
import { useProjectSettings } from '@/hooks/queries/use-settings';
import {
  useUpdateGlobalSettings,
  useUpdateProjectSettings,
} from '@/hooks/mutations/use-settings-mutations';
import { useAgentTemplates } from '@/hooks/queries/use-agent-templates';
import {
  useRegisterTemplate,
  useUpdateTemplate,
  useUnregisterTemplate,
} from '@/hooks/mutations/use-agent-template-mutations';
import type { AgentTemplateMetadata } from '@/hooks/queries/use-agent-templates';
import type { CustomPrompt } from '@protolabs-ai/types';
import { useAppStore } from '@/store/app-store';
import { getElectronAPI } from '@/lib/electron';
import { useQuery } from '@tanstack/react-query';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function modelBadgeVariant(model?: string): 'default' | 'secondary' | 'outline' {
  switch (model) {
    case 'opus':
      return 'default';
    case 'sonnet':
      return 'secondary';
    default:
      return 'outline';
  }
}

/** Full template shape returned by GET /api/agents/templates/get */
interface FullTemplate {
  name: string;
  displayName: string;
  description: string;
  role: string;
  tier?: number;
  model?: string;
  tags?: string[];
  tools?: string[];
  disallowedTools?: string[];
  canUseBash?: boolean;
  canModifyFiles?: boolean;
  canCommit?: boolean;
  canCreatePRs?: boolean;
  canSpawnAgents?: boolean;
  maxTurns?: number;
  trustLevel?: number;
  maxRiskAllowed?: string;
  systemPrompt?: string;
  exposure?: { cli?: boolean; discord?: boolean };
}

/** Discovered CLI skill file from .claude/commands/ */
interface DiscoveredAgent {
  name: string;
  definition: {
    description: string;
    prompt: string;
    tools?: string[];
    model?: 'sonnet' | 'opus' | 'haiku' | 'inherit';
  };
  source: 'user' | 'project';
  filePath: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool Visibility Panel — shows what a persona can access
// ─────────────────────────────────────────────────────────────────────────────

interface ToolVisibilityProps {
  template: FullTemplate;
}

function ToolVisibilityPanel({ template }: ToolVisibilityProps) {
  const capabilities = [
    { key: 'canUseBash', label: 'Bash', value: template.canUseBash },
    { key: 'canModifyFiles', label: 'File edits', value: template.canModifyFiles },
    { key: 'canCommit', label: 'Git commit', value: template.canCommit },
    { key: 'canCreatePRs', label: 'Pull requests', value: template.canCreatePRs },
    { key: 'canSpawnAgents', label: 'Spawn agents', value: template.canSpawnAgents },
  ].filter((c) => c.value !== undefined);

  const tools = template.tools ?? [];
  const disallowed = template.disallowedTools ?? [];

  return (
    <div className="space-y-3 pt-2 pb-3 px-4 border-t border-border/20 bg-muted/10">
      {/* Capability flags */}
      {capabilities.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-1.5">
            Capabilities
          </p>
          <div className="flex flex-wrap gap-1.5">
            {capabilities.map((cap) => (
              <Badge
                key={cap.key}
                variant={cap.value ? 'secondary' : 'outline'}
                className={cn('text-[10px] gap-1', !cap.value && 'opacity-40 line-through')}
              >
                {cap.value ? <Check className="w-2.5 h-2.5" /> : <X className="w-2.5 h-2.5" />}
                {cap.label}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Allowed tools */}
      {tools.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-1.5">
            Allowed Tools {tools[0] === '*' ? '(all)' : `(${tools.length})`}
          </p>
          {tools[0] !== '*' && (
            <div className="flex flex-wrap gap-1">
              {tools.slice(0, 12).map((t) => (
                <Badge key={t} variant="outline" className="text-[10px] font-mono">
                  {t}
                </Badge>
              ))}
              {tools.length > 12 && (
                <Badge variant="outline" className="text-[10px]">
                  +{tools.length - 12} more
                </Badge>
              )}
            </div>
          )}
        </div>
      )}

      {/* Disallowed tools */}
      {disallowed.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-1.5">
            Blocked Tools ({disallowed.length})
          </p>
          <div className="flex flex-wrap gap-1">
            {disallowed.map((t) => (
              <Badge
                key={t}
                variant="outline"
                className="text-[10px] font-mono text-destructive border-destructive/40"
              >
                {t}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Security */}
      {(template.trustLevel !== undefined || template.maxRiskAllowed) && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-1.5">
            Security
          </p>
          <div className="flex gap-1.5">
            {template.trustLevel !== undefined && (
              <Badge variant="outline" className="text-[10px] gap-1">
                <Shield className="w-2.5 h-2.5" />
                Trust level {template.trustLevel}
              </Badge>
            )}
            {template.maxRiskAllowed && (
              <Badge variant="outline" className="text-[10px]">
                Max risk: {template.maxRiskAllowed}
              </Badge>
            )}
          </div>
        </div>
      )}

      {/* Exposure */}
      {template.exposure && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-1.5">
            Exposure
          </p>
          <div className="flex gap-1.5">
            {template.exposure.cli && (
              <Badge variant="secondary" className="text-[10px]">
                CLI
              </Badge>
            )}
            {template.exposure.discord && (
              <Badge variant="secondary" className="text-[10px]">
                Discord
              </Badge>
            )}
          </div>
        </div>
      )}

      {capabilities.length === 0 &&
        tools.length === 0 &&
        disallowed.length === 0 &&
        !template.trustLevel &&
        !template.maxRiskAllowed &&
        !template.exposure && (
          <p className="text-xs text-muted-foreground/50 italic">
            No capability restrictions defined.
          </p>
        )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Create / Edit Template Form
// ─────────────────────────────────────────────────────────────────────────────

interface TemplateFormProps {
  initial?: Partial<FullTemplate>;
  onSave: (data: Record<string, unknown>) => void;
  onCancel: () => void;
  isSaving: boolean;
}

const ROLE_OPTIONS = [
  'product-manager',
  'engineering-manager',
  'frontend-engineer',
  'backend-engineer',
  'devops-engineer',
  'qa-engineer',
  'docs-engineer',
  'gtm-specialist',
  'content-writer',
  'chief-of-staff',
  'pr-maintainer',
  'board-janitor',
  'linear-specialist',
  'calendar-assistant',
  'custom',
];

function TemplateForm({ initial, onSave, onCancel, isSaving }: TemplateFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [displayName, setDisplayName] = useState(initial?.displayName ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [role, setRole] = useState(initial?.role ?? 'custom');
  const [model, setModel] = useState(initial?.model ?? '');
  const [systemPrompt, setSystemPrompt] = useState(initial?.systemPrompt ?? '');
  const [toolsRaw, setToolsRaw] = useState((initial?.tools ?? []).join(', '));
  const [canUseBash, setCanUseBash] = useState(initial?.canUseBash ?? false);
  const [canModifyFiles, setCanModifyFiles] = useState(initial?.canModifyFiles ?? false);
  const [canCommit, setCanCommit] = useState(initial?.canCommit ?? false);
  const [canCreatePRs, setCanCreatePRs] = useState(initial?.canCreatePRs ?? false);

  const isEdit = !!initial?.name;

  const handleSave = () => {
    const tools = toolsRaw
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    const data: Record<string, unknown> = {
      displayName: displayName || name,
      description,
      role,
      tier: 1,
    };

    if (!isEdit) {
      data.name = name;
    }
    if (model) data.model = model;
    if (systemPrompt) data.systemPrompt = systemPrompt;
    if (tools.length > 0) data.tools = tools;
    if (canUseBash) data.canUseBash = true;
    if (canModifyFiles) data.canModifyFiles = true;
    if (canCommit) data.canCommit = true;
    if (canCreatePRs) data.canCreatePRs = true;

    onSave(data);
  };

  return (
    <div className="space-y-4 p-4 bg-muted/20 rounded-lg border border-border/30">
      <h3 className="text-sm font-semibold">{isEdit ? 'Edit Template' : 'New Template'}</h3>

      <div className="grid grid-cols-2 gap-3">
        {!isEdit && (
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Name (kebab-case)</label>
            <Input
              className="text-xs h-8"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-agent"
            />
          </div>
        )}
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Display Name</label>
          <Input
            className="text-xs h-8"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="My Agent"
          />
        </div>
        <div className="space-y-1 col-span-2">
          <label className="text-xs text-muted-foreground">Description</label>
          <Input
            className="text-xs h-8"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What this agent does..."
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Role</label>
          <select
            className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Model</label>
          <select
            className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          >
            <option value="">inherit</option>
            <option value="haiku">haiku</option>
            <option value="sonnet">sonnet</option>
            <option value="opus">opus</option>
          </select>
        </div>
        <div className="space-y-1 col-span-2">
          <label className="text-xs text-muted-foreground">
            Allowed Tools (comma-separated, or * for all)
          </label>
          <Input
            className="text-xs h-8 font-mono"
            value={toolsRaw}
            onChange={(e) => setToolsRaw(e.target.value)}
            placeholder="Bash, Read, Write, Task"
          />
        </div>
      </div>

      {/* Capability toggles */}
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {(
          [
            ['canUseBash', 'Bash access', canUseBash, setCanUseBash],
            ['canModifyFiles', 'File edits', canModifyFiles, setCanModifyFiles],
            ['canCommit', 'Git commit', canCommit, setCanCommit],
            ['canCreatePRs', 'Pull requests', canCreatePRs, setCanCreatePRs],
          ] as const
        ).map(([key, label, val, setter]) => (
          <label key={key} className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
            <input
              type="checkbox"
              checked={val as boolean}
              onChange={(e) => (setter as (v: boolean) => void)(e.target.checked)}
              className="rounded"
            />
            {label as string}
          </label>
        ))}
      </div>

      {/* System prompt */}
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">System Prompt (optional)</label>
        <Textarea
          className="font-mono text-xs"
          rows={6}
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          placeholder="You are a specialized agent that..."
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={isSaving}>
          Cancel
        </Button>
        <Button size="sm" onClick={handleSave} disabled={isSaving || (!isEdit && !name)}>
          {isSaving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Template'}
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Persona Card — individual template card with all features
// ─────────────────────────────────────────────────────────────────────────────

interface PersonaCardProps {
  template: AgentTemplateMetadata;
  override: CustomPrompt | undefined;
  isEnabledForProject: boolean | undefined; // undefined = no project selected
  onToggleOverride: () => void;
  onUpdateValue: (value: string) => void;
  onReset: () => void;
  onToggleProject: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function PersonaCard({
  template,
  override,
  isEnabledForProject,
  onToggleOverride,
  onUpdateValue,
  onReset,
  onToggleProject,
  onEdit,
  onDelete,
}: PersonaCardProps) {
  const [localValue, setLocalValue] = useState(override?.value ?? '');
  const [showCapabilities, setShowCapabilities] = useState(false);
  const [fullTemplate, setFullTemplate] = useState<FullTemplate | null>(null);
  const [loadingFull, setLoadingFull] = useState(false);

  // Sync local state when server override changes
  useEffect(() => {
    setLocalValue(override?.value ?? '');
  }, [override?.value]);

  const handleToggleCapabilities = async () => {
    const next = !showCapabilities;
    setShowCapabilities(next);
    if (next && !fullTemplate) {
      setLoadingFull(true);
      try {
        const api = getElectronAPI();
        const result = await api.agentTemplates.get(template.name);
        if (result.success && result.template) {
          setFullTemplate(result.template as unknown as FullTemplate);
        }
      } finally {
        setLoadingFull(false);
      }
    }
  };

  const isProtected = template.tier === 0;

  return (
    <div className="rounded-lg bg-muted/30 border border-border/30 overflow-hidden">
      {/* Header row */}
      <div className="p-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-medium text-foreground truncate">{template.displayName}</p>
              <Badge variant="outline" className="text-[10px] shrink-0">
                {template.role}
              </Badge>
              {template.model && (
                <Badge variant={modelBadgeVariant(template.model)} className="text-[10px] shrink-0">
                  {template.model}
                </Badge>
              )}
              {isProtected && (
                <Badge
                  variant="outline"
                  className="text-[10px] shrink-0 border-amber-500/40 text-amber-600"
                >
                  <Shield className="w-2.5 h-2.5 mr-1" />
                  Built-in
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground/70 mt-0.5 truncate">
              {template.description}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Per-project toggle */}
          {isEnabledForProject !== undefined && (
            <div className="flex items-center gap-1.5">
              <FolderOpen className="w-3.5 h-3.5 text-muted-foreground/60" />
              <Switch
                checked={isEnabledForProject}
                onCheckedChange={onToggleProject}
                title="Enable for current project"
              />
            </div>
          )}

          {/* Capability audit toggle */}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            onClick={handleToggleCapabilities}
            title="Tool visibility dashboard"
          >
            {showCapabilities ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <Wrench className="w-3.5 h-3.5" />
            )}
          </Button>

          {/* Edit / delete (tier-1 only) */}
          {!isProtected && (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                onClick={onEdit}
                title="Edit template"
              >
                <Pencil className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                onClick={onDelete}
                title="Delete template"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </>
          )}

          {/* Custom prompt toggle */}
          <div className="flex items-center gap-1.5 ml-1 pl-2 border-l border-border/30">
            <span className="text-xs text-muted-foreground">Custom prompt</span>
            <Switch checked={override?.enabled ?? false} onCheckedChange={onToggleOverride} />
          </div>
        </div>
      </div>

      {/* Tool visibility / capability audit panel */}
      {showCapabilities && (
        <div>
          {loadingFull ? (
            <div className="px-4 pb-3 border-t border-border/20">
              <p className="text-xs text-muted-foreground/60 py-2">Loading capabilities...</p>
            </div>
          ) : fullTemplate ? (
            <ToolVisibilityPanel template={fullTemplate} />
          ) : null}
        </div>
      )}

      {/* Custom prompt editor */}
      {override?.enabled && (
        <div className="px-4 pb-4 space-y-2 border-t border-border/20">
          <Textarea
            className="font-mono text-xs mt-3"
            rows={12}
            value={localValue}
            onChange={(e) => setLocalValue(e.target.value)}
            onBlur={() => {
              if (localValue !== override.value) {
                onUpdateValue(localValue);
              }
            }}
            placeholder="Enter a custom system prompt override for this agent..."
          />
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={onReset}>
              <RotateCcw className="w-3 h-3" />
              Reset
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Skill File Sync Panel — bridges CLI skill files with server templates
// ─────────────────────────────────────────────────────────────────────────────

interface SkillSyncPanelProps {
  registeredNames: Set<string>;
  onSync: (agent: DiscoveredAgent) => void;
  isSyncing: string | null;
}

function SkillSyncPanel({ registeredNames, onSync, isSyncing }: SkillSyncPanelProps) {
  const [isOpen, setIsOpen] = useState(false);

  const { data: discoveredAgents } = useQuery({
    queryKey: ['skill-files'],
    queryFn: async () => {
      const api = getElectronAPI();
      const result = await api.settings.discoverAgents(undefined, ['user']);
      return result.agents ?? [];
    },
    staleTime: 30_000,
  });

  const unsynced = (discoveredAgents ?? []).filter((a) => !registeredNames.has(a.name));

  if (unsynced.length === 0) return null;

  return (
    <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 overflow-hidden">
      <button
        type="button"
        className="w-full p-4 flex items-center gap-3 text-left hover:bg-amber-500/10 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <RefreshCw className="w-4 h-4 text-amber-600 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
            {unsynced.length} CLI skill file{unsynced.length > 1 ? 's' : ''} not synced
          </p>
          <p className="text-xs text-muted-foreground/70">
            Skill files from .claude/commands/ can be registered as server templates.
          </p>
        </div>
        {isOpen ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {isOpen && (
        <div className="border-t border-amber-500/20 divide-y divide-border/20">
          {unsynced.map((agent) => (
            <div key={agent.name} className="px-4 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium font-mono">{agent.name}</p>
                <p className="text-xs text-muted-foreground/70 truncate">
                  {agent.definition.description}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 text-xs h-7"
                disabled={isSyncing === agent.name}
                onClick={() => onSync(agent)}
              >
                <RefreshCw
                  className={cn('w-3 h-3 mr-1.5', isSyncing === agent.name && 'animate-spin')}
                />
                {isSyncing === agent.name ? 'Syncing...' : 'Sync'}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Personas Section
// ─────────────────────────────────────────────────────────────────────────────

export function PersonasSection() {
  const { data: settings } = useGlobalSettings();
  const updateSettings = useUpdateGlobalSettings({ showSuccessToast: false });
  const { data: templates, isLoading } = useAgentTemplates();

  const currentProject = useAppStore((s) => s.currentProject);
  const { data: projectSettings } = useProjectSettings(currentProject?.path);
  const updateProjectSettings = useUpdateProjectSettings(currentProject?.path);

  const registerTemplate = useRegisterTemplate();
  const updateTemplate = useUpdateTemplate();
  const unregisterTemplate = useUnregisterTemplate();

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<AgentTemplateMetadata | null>(null);
  const [deletingName, setDeletingName] = useState<string | null>(null);
  const [syncingName, setSyncingName] = useState<string | null>(null);

  const personaOverrides = settings?.personaOverrides ?? {};
  // Per-project enabled personas list (undefined = not configured per-project)
  const enabledPersonas = projectSettings?.enabledPersonas;

  // ── Prompt override helpers ──────────────────────────────────────────────

  const toggleOverride = useCallback(
    (name: string) => {
      const existing = personaOverrides[name];
      const updated: Record<string, CustomPrompt> = {
        ...personaOverrides,
        [name]: {
          value: existing?.value ?? '',
          enabled: !existing?.enabled,
        },
      };
      updateSettings.mutate({ personaOverrides: updated });
    },
    [personaOverrides, updateSettings]
  );

  const updatePromptValue = useCallback(
    (name: string, value: string) => {
      const existing = personaOverrides[name];
      const updated: Record<string, CustomPrompt> = {
        ...personaOverrides,
        [name]: { value, enabled: existing?.enabled ?? true },
      };
      updateSettings.mutate({ personaOverrides: updated });
    },
    [personaOverrides, updateSettings]
  );

  const resetOverride = useCallback(
    (name: string) => {
      const { [name]: _, ...rest } = personaOverrides;
      updateSettings.mutate({ personaOverrides: rest });
    },
    [personaOverrides, updateSettings]
  );

  // ── Per-project toggle ───────────────────────────────────────────────────

  const toggleProjectPersona = useCallback(
    (name: string) => {
      if (!currentProject?.path) return;
      const current = enabledPersonas ?? templates?.map((t) => t.name) ?? [];
      const isEnabled = current.includes(name);
      const updated = isEnabled ? current.filter((n: string) => n !== name) : [...current, name];
      updateProjectSettings.mutate({ enabledPersonas: updated });
    },
    [enabledPersonas, templates, currentProject?.path, updateProjectSettings]
  );

  const isPersonaEnabledForProject = useCallback(
    (name: string): boolean | undefined => {
      if (!currentProject?.path) return undefined;
      if (!enabledPersonas) return true; // all enabled by default
      return enabledPersonas.includes(name);
    },
    [enabledPersonas, currentProject?.path]
  );

  // ── CRUD handlers ────────────────────────────────────────────────────────

  const handleCreate = useCallback(
    (data: Record<string, unknown>) => {
      registerTemplate.mutate(data, {
        onSuccess: () => setShowCreateForm(false),
      });
    },
    [registerTemplate]
  );

  const handleEdit = useCallback(
    (data: Record<string, unknown>) => {
      if (!editingTemplate) return;
      updateTemplate.mutate(
        { name: editingTemplate.name, updates: data },
        { onSuccess: () => setEditingTemplate(null) }
      );
    },
    [editingTemplate, updateTemplate]
  );

  const handleDelete = useCallback(
    (name: string) => {
      if (deletingName !== name) {
        setDeletingName(name);
        return;
      }
      unregisterTemplate.mutate(name, {
        onSuccess: () => setDeletingName(null),
      });
    },
    [deletingName, unregisterTemplate]
  );

  // ── Skill file sync ──────────────────────────────────────────────────────

  const handleSync = useCallback(
    async (agent: DiscoveredAgent) => {
      setSyncingName(agent.name);
      try {
        const tools = agent.definition.tools ?? [];
        const template: Record<string, unknown> = {
          name: agent.name,
          displayName: agent.name
            .split('-')
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' '),
          description: agent.definition.description,
          role: 'custom',
          tier: 1,
          systemPrompt: agent.definition.prompt,
        };
        if (tools.length > 0) template.tools = tools;
        if (agent.definition.model && agent.definition.model !== 'inherit') {
          template.model = agent.definition.model;
        }
        await registerTemplate.mutateAsync(template);
      } finally {
        setSyncingName(null);
      }
    },
    [registerTemplate]
  );

  const registeredNames = new Set(templates?.map((t) => t.name) ?? []);

  return (
    <div
      className={cn(
        'rounded-lg overflow-hidden',
        'border border-border/50',
        'bg-gradient-to-br from-card/80 via-card/70 to-card/80 backdrop-blur-xl',
        'shadow-sm'
      )}
    >
      {/* Header */}
      <div className="p-4 border-b border-border/30 bg-gradient-to-r from-primary/5 via-transparent to-transparent">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center border border-primary/20">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-lg font-semibold text-foreground tracking-tight">Personas</h2>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => setShowCreateForm(true)}
          >
            <Plus className="w-3.5 h-3.5" />
            New Template
          </Button>
        </div>
        <p className="text-sm text-muted-foreground/80 ml-12">
          Manage agent personas: view tool access, configure per-project activation, and override
          system prompts.
          {currentProject && (
            <span className="ml-1 text-primary/70">
              Project toggles apply to <strong>{currentProject.name}</strong>.
            </span>
          )}
        </p>
      </div>

      <div className="p-6 space-y-3">
        {/* Skill file sync panel */}
        <SkillSyncPanel
          registeredNames={registeredNames}
          onSync={handleSync}
          isSyncing={syncingName}
        />

        {/* Create form */}
        {showCreateForm && (
          <TemplateForm
            onSave={handleCreate}
            onCancel={() => setShowCreateForm(false)}
            isSaving={registerTemplate.isPending}
          />
        )}

        {/* Loading state */}
        {isLoading && (
          <p className="text-sm text-muted-foreground text-center py-8">Loading templates...</p>
        )}

        {/* Empty state */}
        {!isLoading && (!templates || templates.length === 0) && (
          <p className="text-sm text-muted-foreground text-center py-8">
            No agent templates registered.
          </p>
        )}

        {/* Template list */}
        {templates?.map((template) => (
          <div key={template.name}>
            {editingTemplate?.name === template.name ? (
              <TemplateForm
                initial={template as Partial<FullTemplate>}
                onSave={handleEdit}
                onCancel={() => setEditingTemplate(null)}
                isSaving={updateTemplate.isPending}
              />
            ) : (
              <div>
                <PersonaCard
                  template={template}
                  override={personaOverrides[template.name]}
                  isEnabledForProject={isPersonaEnabledForProject(template.name)}
                  onToggleOverride={() => toggleOverride(template.name)}
                  onUpdateValue={(value) => updatePromptValue(template.name, value)}
                  onReset={() => resetOverride(template.name)}
                  onToggleProject={() => toggleProjectPersona(template.name)}
                  onEdit={() => setEditingTemplate(template)}
                  onDelete={() => handleDelete(template.name)}
                />
                {/* Delete confirmation */}
                {deletingName === template.name && (
                  <div className="mt-1 px-4 py-2 bg-destructive/10 rounded-lg border border-destructive/20 flex items-center justify-between gap-3">
                    <p className="text-xs text-destructive">
                      Delete <strong>{template.displayName}</strong>? This cannot be undone.
                    </p>
                    <div className="flex gap-2 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs h-6"
                        onClick={() => setDeletingName(null)}
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="text-xs h-6"
                        disabled={unregisterTemplate.isPending}
                        onClick={() => handleDelete(template.name)}
                      >
                        {unregisterTemplate.isPending ? 'Deleting...' : 'Delete'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
