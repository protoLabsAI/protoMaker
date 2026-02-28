import { useCallback, useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Plus, Trash2 } from 'lucide-react';
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
  Spinner,
} from '@protolabs-ai/ui/atoms';
import { apiFetch } from '@/lib/api-fetch';
import { useAppStore } from '@/store/app-store';
import { useSignalChannels } from '@/hooks/use-signal-channels';
import { useGlobalSettings } from '@/hooks/queries/use-settings';
import { useUpdateGlobalSettings } from '@/hooks/mutations/use-settings-mutations';
import type {
  IntegrationDescriptor,
  ConfigField,
  DiscordChannelSignalConfig,
  UserProfile,
} from '@protolabs-ai/types';
import type { SignalIntent } from '@protolabs-ai/types';

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

  const signalChannels = useSignalChannels(isDiscord ? (currentProject?.path ?? null) : null);

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

      // Also save signal channels for Discord
      if (isDiscord) {
        const channelsSaved = await signalChannels.save();
        if (!channelsSaved && signalChannels.error) {
          throw new Error(signalChannels.error);
        }
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
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
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

            {isDiscord && (
              <SignalSourcesSection
                channels={signalChannels.channels}
                loading={signalChannels.loading}
                onChange={signalChannels.setChannels}
              />
            )}

            {isDiscord && <DiscordProfileSection />}
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
// Signal Sources Section — only shown for the Discord integration
// ---------------------------------------------------------------------------

const INTENT_OPTIONS: Array<{ value: SignalIntent | 'auto'; label: string }> = [
  { value: 'auto', label: 'Auto (classify automatically)' },
  { value: 'work_order', label: 'Work Order' },
  { value: 'idea', label: 'Idea' },
  { value: 'feedback', label: 'Feedback' },
  { value: 'conversational', label: 'Conversational' },
];

function SignalSourcesSection({
  channels,
  loading,
  onChange,
}: {
  channels: DiscordChannelSignalConfig[];
  loading: boolean;
  onChange: (channels: DiscordChannelSignalConfig[]) => void;
}) {
  const [newChannelId, setNewChannelId] = useState('');
  const [newChannelName, setNewChannelName] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const channelIdRef = useRef<HTMLInputElement>(null);

  const handleAdd = () => {
    const id = newChannelId.trim();
    const name = newChannelName.trim() || id;
    if (!id) return;

    const already = channels.some((c) => c.channelId === id);
    if (already) return;

    onChange([
      ...channels,
      {
        channelId: id,
        channelName: name,
        intentOverride: undefined,
        autoFeature: false,
        enabled: true,
      },
    ]);
    setNewChannelId('');
    setNewChannelName('');
    setShowAddForm(false);
  };

  const updateChannel = (index: number, patch: Partial<DiscordChannelSignalConfig>) => {
    const updated = channels.map((c, i) => (i === index ? { ...c, ...patch } : c));
    onChange(updated);
  };

  const removeChannel = (index: number) => {
    onChange(channels.filter((_, i) => i !== index));
  };

  const handleShowAdd = () => {
    setShowAddForm(true);
    setTimeout(() => channelIdRef.current?.focus(), 0);
  };

  return (
    <div className="space-y-3">
      <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Signal Sources</h4>

      {loading ? (
        <div className="flex items-center justify-center py-4">
          <Spinner />
        </div>
      ) : channels.length === 0 && !showAddForm ? (
        <p className="text-xs text-zinc-400 dark:text-zinc-500">
          No channels monitored. Add a Discord channel to start receiving signals.
        </p>
      ) : (
        <div className="space-y-2">
          {channels.map((channel, index) => (
            <div
              key={channel.channelId}
              className="rounded-md border border-zinc-200 dark:border-zinc-700 p-3 space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{channel.channelName}</p>
                  <p className="text-xs text-zinc-400 truncate font-mono">{channel.channelId}</p>
                </div>
                <button
                  type="button"
                  onClick={() => removeChannel(index)}
                  className="shrink-0 text-zinc-400 hover:text-red-500 transition-colors"
                  aria-label="Remove channel"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs text-zinc-500">Intent override</Label>
                  <Select
                    value={channel.intentOverride ?? 'auto'}
                    onValueChange={(v) =>
                      updateChannel(index, {
                        intentOverride: v === 'auto' ? undefined : (v as SignalIntent),
                      })
                    }
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INTENT_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value} className="text-xs">
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-zinc-500">Auto-feature</Label>
                  <div className="flex items-center h-8">
                    <Switch
                      checked={channel.autoFeature}
                      onCheckedChange={(v) => updateChannel(index, { autoFeature: v })}
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <Label className="text-xs text-zinc-500">Enabled</Label>
                <Switch
                  checked={channel.enabled}
                  onCheckedChange={(v) => updateChannel(index, { enabled: v })}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {showAddForm ? (
        <div className="rounded-md border border-zinc-200 dark:border-zinc-700 p-3 space-y-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Channel ID</Label>
            <Input
              ref={channelIdRef}
              value={newChannelId}
              onChange={(e) => setNewChannelId(e.target.value)}
              placeholder="123456789012345678"
              className="h-8 text-xs font-mono"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAdd();
                if (e.key === 'Escape') setShowAddForm(false);
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Channel name (optional)</Label>
            <Input
              value={newChannelName}
              onChange={(e) => setNewChannelName(e.target.value)}
              placeholder="#channel-name"
              className="h-8 text-xs"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAdd();
                if (e.key === 'Escape') setShowAddForm(false);
              }}
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAdd} disabled={!newChannelId.trim()}>
              Add
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowAddForm(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" className="w-full gap-1.5" onClick={handleShowAdd}>
          <Plus className="w-3.5 h-3.5" />
          Add Channel
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Discord profile section — reads/writes userProfile.discord.* and additionalAllowedUsers
// ---------------------------------------------------------------------------

function DiscordProfileSection() {
  const { data: settings } = useGlobalSettings();
  const updateSettings = useUpdateGlobalSettings({ showSuccessToast: false });
  const [local, setLocal] = useState<UserProfile>({});
  const [allowedUsersText, setAllowedUsersText] = useState('');

  useEffect(() => {
    if (settings?.userProfile) {
      setLocal(settings.userProfile);
      setAllowedUsersText((settings.userProfile.additionalAllowedUsers ?? []).join(', '));
    }
  }, [settings?.userProfile]);

  const save = useCallback(
    (overrides?: Partial<UserProfile>) => {
      const toSave = overrides ? { ...local, ...overrides } : local;
      updateSettings.mutate({ userProfile: toSave });
    },
    [local, updateSettings]
  );

  const saveAllowedUsers = useCallback(() => {
    const users = allowedUsersText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const updated = { ...local, additionalAllowedUsers: users };
    setLocal(updated);
    updateSettings.mutate({ userProfile: updated });
  }, [allowedUsersText, local, updateSettings]);

  return (
    <>
      <div className="space-y-3">
        <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Bot Identity</h4>
        <div className="space-y-1.5">
          <Label className="text-sm">Discord username</Label>
          <Input
            value={local.discord?.username ?? ''}
            onChange={(e) =>
              setLocal((p) => ({
                ...p,
                discord: { ...p.discord, username: e.target.value },
              }))
            }
            onBlur={() => save()}
            placeholder="Discord username"
          />
        </div>
      </div>

      <div className="space-y-3">
        <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
          Notification Channels
        </h4>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-sm">Primary</Label>
            <Input
              className="font-mono"
              value={local.discord?.channels?.primary ?? ''}
              onChange={(e) =>
                setLocal((p) => ({
                  ...p,
                  discord: {
                    ...p.discord,
                    channels: { ...p.discord?.channels, primary: e.target.value },
                  },
                }))
              }
              onBlur={() => save()}
              placeholder="Channel ID"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Dev</Label>
            <Input
              className="font-mono"
              value={local.discord?.channels?.dev ?? ''}
              onChange={(e) =>
                setLocal((p) => ({
                  ...p,
                  discord: {
                    ...p.discord,
                    channels: { ...p.discord?.channels, dev: e.target.value },
                  },
                }))
              }
              onBlur={() => save()}
              placeholder="Channel ID"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Infra</Label>
            <Input
              className="font-mono"
              value={local.discord?.channels?.infra ?? ''}
              onChange={(e) =>
                setLocal((p) => ({
                  ...p,
                  discord: {
                    ...p.discord,
                    channels: { ...p.discord?.channels, infra: e.target.value },
                  },
                }))
              }
              onBlur={() => save()}
              placeholder="Channel ID"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Deployments</Label>
            <Input
              className="font-mono"
              value={local.discord?.channels?.deployments ?? ''}
              onChange={(e) =>
                setLocal((p) => ({
                  ...p,
                  discord: {
                    ...p.discord,
                    channels: { ...p.discord?.channels, deployments: e.target.value },
                  },
                }))
              }
              onBlur={() => save()}
              placeholder="Channel ID"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Alerts</Label>
            <Input
              className="font-mono"
              value={local.discord?.channels?.alerts ?? ''}
              onChange={(e) =>
                setLocal((p) => ({
                  ...p,
                  discord: {
                    ...p.discord,
                    channels: { ...p.discord?.channels, alerts: e.target.value },
                  },
                }))
              }
              onBlur={() => save()}
              placeholder="Channel ID"
            />
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
          Trusted Users
        </h4>
        <div className="space-y-1.5">
          <Label className="text-sm">Trusted Discord users (comma-separated usernames)</Label>
          <Input
            value={allowedUsersText}
            onChange={(e) => setAllowedUsersText(e.target.value)}
            onBlur={() => saveAllowedUsers()}
            placeholder="username1, username2"
          />
          <p className="text-xs text-zinc-500">
            These users can interact with agents and trigger reaction abilities.
          </p>
        </div>
      </div>
    </>
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
