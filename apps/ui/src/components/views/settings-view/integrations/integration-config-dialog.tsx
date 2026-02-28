import { useCallback, useEffect, useState } from 'react';
import { Eye, EyeOff, Pencil, Trash2, Plus, ChevronLeft } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Button,
  Input,
  Label,
  Switch,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Badge,
  Spinner,
} from '@protolabs-ai/ui/atoms';
import { apiFetch } from '@/lib/api-fetch';
import { useAppStore } from '@/store/app-store';
import {
  useReactionAbilities,
  useSaveReactionAbilities,
} from '@/hooks/queries/use-reaction-abilities';
import type {
  IntegrationDescriptor,
  ConfigField,
  ReactionAbility,
  ReactionAbilityIntent,
} from '@protolabs-ai/types';

interface IntegrationConfigDialogProps {
  integrationId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export function IntegrationConfigDialog({
  integrationId,
  open,
  onOpenChange,
  onSaved,
}: IntegrationConfigDialogProps) {
  const [descriptor, setDescriptor] = useState<IntegrationDescriptor | null>(null);
  const [values, setValues] = useState<Record<string, string | number | boolean>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [revealedSecrets, setRevealedSecrets] = useState<Set<string>>(new Set());
  const currentProject = useAppStore((s) => s.currentProject);

  const isDiscord = integrationId === 'discord';

  // Fetch descriptor when opened
  useEffect(() => {
    if (!open || !integrationId) return;

    setLoading(true);
    setRevealedSecrets(new Set());

    (async () => {
      try {
        const res = await apiFetch('/api/integrations/registry/get', 'POST', {
          body: { id: integrationId },
        });
        if (!res.ok) throw new Error(`Failed to load: ${res.status}`);
        const data = await res.json();
        setDescriptor(data.integration);

        // Initialize values from defaults
        const initial: Record<string, string | number | boolean> = {};
        for (const field of data.integration.configFields ?? []) {
          if (field.defaultValue !== undefined) {
            initial[field.key] = field.defaultValue;
          }
        }

        // Load existing project integration settings if available
        if (currentProject) {
          try {
            const settingsRes = await apiFetch('/api/integrations/get', 'POST', {
              body: { projectPath: currentProject },
            });
            if (!settingsRes.ok) throw new Error('settings unavailable');
            const settingsData = await settingsRes.json();
            const integrationSettings = settingsData.integrations?.[integrationId];
            if (integrationSettings) {
              for (const field of data.integration.configFields ?? []) {
                if (integrationSettings[field.key] !== undefined) {
                  initial[field.key] = integrationSettings[field.key];
                }
              }
            }
          } catch {
            // Settings not available yet — use defaults
          }
        }

        setValues(initial);
      } catch (error) {
        console.error('Failed to load integration config:', error);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, integrationId, currentProject]);

  const setValue = useCallback((key: string, value: string | number | boolean) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const toggleSecret = useCallback((key: string) => {
    setRevealedSecrets((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleSave = async () => {
    if (!descriptor || !currentProject) return;

    setSaving(true);
    setSaveError(null);
    try {
      // Save via existing integrations/update endpoint
      const integrations: Record<string, Record<string, unknown>> = {};
      const config: Record<string, unknown> = { enabled: true };
      for (const field of descriptor.configFields) {
        const val = values[field.key];
        if (val !== undefined && val !== '') {
          config[field.key] = val;
        }
      }
      integrations[descriptor.id] = config;

      const res = await apiFetch('/api/integrations/update', 'POST', {
        body: { projectPath: currentProject, integrations },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Save failed: ${res.status}`);
      }

      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save configuration';
      setSaveError(msg);
      console.error('Failed to save integration config:', err);
    } finally {
      setSaving(false);
    }
  };

  // Group fields
  const groupedFields = (descriptor?.configFields ?? []).reduce<Record<string, ConfigField[]>>(
    (acc, field) => {
      const group = field.group ?? 'General';
      if (!acc[group]) acc[group] = [];
      acc[group].push(field);
      return acc;
    },
    {}
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={
          isDiscord
            ? 'max-w-2xl max-h-[80vh] overflow-y-auto'
            : 'max-w-lg max-h-[80vh] overflow-y-auto'
        }
      >
        <DialogHeader>
          <DialogTitle>{descriptor?.name ?? 'Integration'} Configuration</DialogTitle>
          <DialogDescription>{descriptor?.description}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner />
          </div>
        ) : (
          <div className="space-y-6 py-2">
            {Object.entries(groupedFields).map(([group, fields]) => (
              <div key={group} className="space-y-3">
                <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                  {group}
                </h4>
                <div className="space-y-3">
                  {fields.map((field) => (
                    <FieldRenderer
                      key={field.key}
                      field={field}
                      value={values[field.key]}
                      revealed={revealedSecrets.has(field.key)}
                      onChange={(v) => setValue(field.key, v)}
                      onToggleReveal={() => toggleSecret(field.key)}
                    />
                  ))}
                </div>
              </div>
            ))}

            {isDiscord && currentProject && (
              <DiscordReactionAbilitiesSection projectPath={currentProject.path} />
            )}
          </div>
        )}

        {saveError && <p className="text-sm text-red-600 dark:text-red-400">{saveError}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Field renderer — auto-renders the right input for each ConfigField type
// ---------------------------------------------------------------------------

function FieldRenderer({
  field,
  value,
  revealed,
  onChange,
  onToggleReveal,
}: {
  field: ConfigField;
  value: string | number | boolean | undefined;
  revealed: boolean;
  onChange: (value: string | number | boolean) => void;
  onToggleReveal: () => void;
}) {
  switch (field.type) {
    case 'boolean':
      return (
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm">{field.label}</Label>
            {field.description && (
              <p className="text-xs text-zinc-500 mt-0.5">{field.description}</p>
            )}
          </div>
          <Switch checked={!!value} onCheckedChange={(v) => onChange(v)} />
        </div>
      );

    case 'secret':
      return (
        <div className="space-y-1.5">
          <Label className="text-sm">{field.label}</Label>
          {field.description && <p className="text-xs text-zinc-500">{field.description}</p>}
          <div className="relative">
            <Input
              type={revealed ? 'text' : 'password'}
              value={(value as string) ?? ''}
              onChange={(e) => onChange(e.target.value)}
              placeholder={field.placeholder}
              className="pr-9"
            />
            <button
              type="button"
              onClick={onToggleReveal}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
            >
              {revealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
      );

    case 'number':
      return (
        <div className="space-y-1.5">
          <Label className="text-sm">{field.label}</Label>
          {field.description && <p className="text-xs text-zinc-500">{field.description}</p>}
          <Input
            type="number"
            value={value !== undefined ? String(value) : ''}
            onChange={(e) => {
              const num = Number(e.target.value);
              if (!Number.isNaN(num)) onChange(num);
            }}
            placeholder={field.placeholder}
          />
        </div>
      );

    case 'select':
      return (
        <div className="space-y-1.5">
          <Label className="text-sm">{field.label}</Label>
          {field.description && <p className="text-xs text-zinc-500">{field.description}</p>}
          <Select value={(value as string) ?? ''} onValueChange={(v) => onChange(v)}>
            <SelectTrigger>
              <SelectValue placeholder={field.placeholder ?? 'Select...'} />
            </SelectTrigger>
            <SelectContent>
              {field.options?.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );

    case 'url':
    case 'string':
    default:
      return (
        <div className="space-y-1.5">
          <Label className="text-sm">{field.label}</Label>
          {field.description && <p className="text-xs text-zinc-500">{field.description}</p>}
          <Input
            type={field.type === 'url' ? 'url' : 'text'}
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
          />
        </div>
      );
  }
}

// ---------------------------------------------------------------------------
// Discord Reaction Abilities Section
// ---------------------------------------------------------------------------

const INTENT_LABELS: Record<ReactionAbilityIntent, string> = {
  work_order: 'Work Order',
  idea: 'Idea',
  feedback: 'Feedback',
  conversational: 'Conversational',
};

const INTENT_VARIANTS: Record<ReactionAbilityIntent, 'default' | 'secondary' | 'outline'> = {
  work_order: 'default',
  idea: 'secondary',
  feedback: 'secondary',
  conversational: 'outline',
};

function makeBlankAbility(): ReactionAbility {
  return {
    id: crypto.randomUUID(),
    emoji: '',
    label: '',
    intent: 'feedback',
    channels: [],
    allowedRoles: [],
    allowedUsers: [],
    autoFeature: true,
    enabled: true,
  };
}

type FormMode = 'list' | 'add' | 'edit';

interface AbilityFormDraft {
  id: string;
  emoji: string;
  label: string;
  intent: ReactionAbilityIntent;
  channels: string;
  allowedRoles: string;
  allowedUsers: string;
  autoFeature: boolean;
  enabled: boolean;
}

function abilityToFormDraft(ability: ReactionAbility): AbilityFormDraft {
  return {
    id: ability.id,
    emoji: ability.emoji,
    label: ability.label,
    intent: ability.intent,
    channels: (ability.channels ?? []).join(', '),
    allowedRoles: (ability.allowedRoles ?? []).join(', '),
    allowedUsers: (ability.allowedUsers ?? []).join(', '),
    autoFeature: ability.autoFeature ?? true,
    enabled: ability.enabled,
  };
}

function formDraftToAbility(draft: AbilityFormDraft): ReactionAbility {
  const splitTrim = (s: string) =>
    s
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);

  return {
    id: draft.id,
    emoji: draft.emoji.trim(),
    label: draft.label.trim(),
    intent: draft.intent,
    channels: splitTrim(draft.channels),
    allowedRoles: splitTrim(draft.allowedRoles),
    allowedUsers: splitTrim(draft.allowedUsers),
    autoFeature: draft.autoFeature,
    enabled: draft.enabled,
  };
}

function channelSummary(channels: string[] | undefined): string {
  if (!channels || channels.length === 0) return 'All channels';
  return `${channels.length} channel${channels.length === 1 ? '' : 's'}`;
}

function trustSummary(roles: string[] | undefined): string {
  if (!roles || roles.length === 0) return 'All members';
  return `${roles.length} role${roles.length === 1 ? '' : 's'}`;
}

function DiscordReactionAbilitiesSection({ projectPath }: { projectPath: string }) {
  const { data: abilities = [], isLoading } = useReactionAbilities(projectPath);
  const { mutate: saveAbilities, isPending: isSaving } = useSaveReactionAbilities(projectPath);

  const [formMode, setFormMode] = useState<FormMode>('list');
  const [formDraft, setFormDraft] = useState<AbilityFormDraft>(() =>
    abilityToFormDraft(makeBlankAbility())
  );
  const [formError, setFormError] = useState<string | null>(null);

  const setDraftField = <K extends keyof AbilityFormDraft>(key: K, value: AbilityFormDraft[K]) => {
    setFormDraft((prev) => ({ ...prev, [key]: value }));
  };

  const handleAdd = () => {
    setFormDraft(abilityToFormDraft(makeBlankAbility()));
    setFormError(null);
    setFormMode('add');
  };

  const handleEdit = (ability: ReactionAbility) => {
    setFormDraft(abilityToFormDraft(ability));
    setFormError(null);
    setFormMode('edit');
  };

  const handleDelete = (id: string) => {
    const updated = abilities.filter((a) => a.id !== id);
    saveAbilities(updated);
  };

  const handleToggleEnabled = (id: string, enabled: boolean) => {
    const updated = abilities.map((a) => (a.id === id ? { ...a, enabled } : a));
    saveAbilities(updated);
  };

  const handleFormSubmit = () => {
    if (!formDraft.emoji.trim()) {
      setFormError('Emoji is required');
      return;
    }
    if (!formDraft.label.trim()) {
      setFormError('Label is required');
      return;
    }

    const ability = formDraftToAbility(formDraft);
    let updated: ReactionAbility[];

    if (formMode === 'add') {
      updated = [...abilities, ability];
    } else {
      updated = abilities.map((a) => (a.id === ability.id ? ability : a));
    }

    setFormError(null);
    saveAbilities(updated, {
      onSuccess: () => setFormMode('list'),
    });
  };

  const handleFormCancel = () => {
    setFormMode('list');
    setFormError(null);
  };

  return (
    <div className="space-y-3 border-t border-zinc-200 dark:border-zinc-700 pt-4">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
          Reaction Abilities
        </h4>
        {formMode === 'list' && (
          <Button variant="outline" size="sm" onClick={handleAdd} className="h-7 gap-1 text-xs">
            <Plus className="w-3 h-3" />
            Add
          </Button>
        )}
        {formMode !== 'list' && (
          <button
            type="button"
            onClick={handleFormCancel}
            className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
          >
            <ChevronLeft className="w-3 h-3" />
            Back to list
          </button>
        )}
      </div>

      {formMode === 'list' && (
        <>
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Spinner />
            </div>
          ) : abilities.length === 0 ? (
            <p className="text-sm text-zinc-500 py-3">
              No reaction abilities configured. Add one to let trusted users tag messages with
              reactions.
            </p>
          ) : (
            <div className="space-y-2">
              {abilities.map((ability) => (
                <div
                  key={ability.id}
                  className="flex items-center gap-3 rounded-md border border-zinc-200 dark:border-zinc-700 px-3 py-2"
                >
                  <span className="text-2xl leading-none select-none">{ability.emoji}</span>
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium truncate">{ability.label}</span>
                      <Badge variant={INTENT_VARIANTS[ability.intent]} className="text-xs shrink-0">
                        {INTENT_LABELS[ability.intent]}
                      </Badge>
                    </div>
                    <p className="text-xs text-zinc-500">
                      {channelSummary(ability.channels)} &middot;{' '}
                      {trustSummary(ability.allowedRoles)}
                    </p>
                  </div>
                  <Switch
                    checked={ability.enabled}
                    onCheckedChange={(enabled) => handleToggleEnabled(ability.id, enabled)}
                    disabled={isSaving}
                    aria-label="Enable ability"
                  />
                  <button
                    type="button"
                    onClick={() => handleEdit(ability)}
                    className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                    aria-label="Edit ability"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(ability.id)}
                    disabled={isSaving}
                    className="text-zinc-400 hover:text-red-500"
                    aria-label="Delete ability"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {(formMode === 'add' || formMode === 'edit') && (
        <div className="space-y-3 rounded-md border border-zinc-200 dark:border-zinc-700 p-3">
          <h5 className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
            {formMode === 'add' ? 'New Reaction Ability' : 'Edit Reaction Ability'}
          </h5>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Emoji</Label>
              <Input
                value={formDraft.emoji}
                onChange={(e) => setDraftField('emoji', e.target.value)}
                placeholder="e.g. \uD83D\uDC1B or :bug:123"
                className="text-base"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Label</Label>
              <Input
                value={formDraft.label}
                onChange={(e) => setDraftField('label', e.target.value)}
                placeholder="e.g. Report Bug"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Intent</Label>
            <Select
              value={formDraft.intent}
              onValueChange={(v) => setDraftField('intent', v as ReactionAbilityIntent)}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="work_order">Work Order</SelectItem>
                <SelectItem value="idea">Idea</SelectItem>
                <SelectItem value="feedback">Feedback</SelectItem>
                <SelectItem value="conversational">Conversational</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Channels (comma-separated IDs, blank = all)</Label>
            <Input
              value={formDraft.channels}
              onChange={(e) => setDraftField('channels', e.target.value)}
              placeholder="123456789, 987654321"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Allowed Roles (comma-separated IDs, blank = any role)</Label>
            <Input
              value={formDraft.allowedRoles}
              onChange={(e) => setDraftField('allowedRoles', e.target.value)}
              placeholder="111111111, 222222222"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Allowed Users (comma-separated IDs)</Label>
            <Input
              value={formDraft.allowedUsers}
              onChange={(e) => setDraftField('allowedUsers', e.target.value)}
              placeholder="333333333"
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label className="text-xs">Auto-create Feature</Label>
              <p className="text-xs text-zinc-500">
                Automatically create a board feature on reaction
              </p>
            </div>
            <Switch
              checked={formDraft.autoFeature}
              onCheckedChange={(v) => setDraftField('autoFeature', v)}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label className="text-xs">Enabled</Label>
            <Switch
              checked={formDraft.enabled}
              onCheckedChange={(v) => setDraftField('enabled', v)}
            />
          </div>

          {formError && <p className="text-xs text-red-600 dark:text-red-400">{formError}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={handleFormCancel} className="h-7 text-xs">
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleFormSubmit}
              disabled={isSaving}
              className="h-7 text-xs"
            >
              {isSaving ? 'Saving...' : formMode === 'add' ? 'Add Ability' : 'Update Ability'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
