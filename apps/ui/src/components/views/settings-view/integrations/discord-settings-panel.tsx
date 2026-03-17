/**
 * Discord Settings Panel
 *
 * Dedicated settings panel for Discord integration configuration.
 * Displays bot connection status, channel mapping, and notification preferences.
 * Renders inline within the integrations section when the Discord card is expanded.
 */

import { useCallback, useEffect, useState } from 'react';
import { Hash, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { Badge, Button, Input, Label, Switch, Spinner } from '@protolabsai/ui/atoms';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api-fetch';
import { useGlobalSettings } from '@/hooks/queries/use-settings';
import { useUpdateGlobalSettings } from '@/hooks/mutations/use-settings-mutations';
import type { IntegrationHealth, DiscordSettings } from '@protolabsai/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Well-known Discord channels with labels and descriptions */
const WELL_KNOWN_CHANNELS = [
  { key: 'primary', label: 'Primary (Ava)', description: 'Primary coordination channel' },
  { key: 'dev', label: 'Dev', description: 'Code and feature updates' },
  { key: 'infra', label: 'Infra', description: 'Infrastructure alerts' },
  { key: 'bugs', label: 'Bug Reports', description: 'Bug triage channel' },
  { key: 'suggestions', label: 'Suggestions', description: 'Ideas and suggestions' },
  { key: 'agentLogs', label: 'Agent Logs', description: 'Agent activity logs' },
  { key: 'ceremonies', label: 'Ceremonies', description: 'Ceremony announcements' },
] as const;

/** Notification preference toggles with labels and descriptions */
const NOTIFICATION_TOGGLES: Array<{
  key: keyof Pick<
    DiscordSettings,
    | 'notifyOnFeatureStart'
    | 'notifyOnFeatureComplete'
    | 'notifyOnMilestoneComplete'
    | 'notifyOnError'
    | 'autoNotify'
  >;
  label: string;
  description: string;
}> = [
  {
    key: 'autoNotify',
    label: 'Auto-mode notifications',
    description: 'Send progress updates during auto-mode execution',
  },
  {
    key: 'notifyOnFeatureStart',
    label: 'Feature start',
    description: 'Notify when an agent begins working on a feature',
  },
  {
    key: 'notifyOnFeatureComplete',
    label: 'Feature completion',
    description: 'Notify when a feature is successfully completed',
  },
  {
    key: 'notifyOnMilestoneComplete',
    label: 'Milestone completion',
    description: 'Notify when a project milestone is reached',
  },
  {
    key: 'notifyOnError',
    label: 'Error alerts',
    description: 'Notify on agent errors and failures',
  },
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CustomChannel {
  name: string;
  id: string;
}

interface DiscordSettingsPanelProps {
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Health status badge
// ---------------------------------------------------------------------------

const HEALTH_BADGE_STYLES: Record<string, { variant: 'default' | 'outline'; className: string }> = {
  connected: { variant: 'default', className: 'bg-emerald-600 text-white hover:bg-emerald-600' },
  disconnected: { variant: 'outline', className: 'text-muted-foreground' },
  degraded: { variant: 'default', className: 'bg-amber-500 text-white hover:bg-amber-500' },
  unconfigured: { variant: 'outline', className: 'text-muted-foreground' },
  disabled: { variant: 'outline', className: 'text-muted-foreground' },
};

function HealthStatusBadge({ health }: { health: IntegrationHealth | null }) {
  if (!health) return null;
  const style = HEALTH_BADGE_STYLES[health.status] ?? HEALTH_BADGE_STYLES.unconfigured;
  return (
    <Badge variant={style.variant} className={cn('text-xs capitalize', style.className)}>
      {health.status}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Main Panel Component
// ---------------------------------------------------------------------------

export function DiscordSettingsPanel({ onClose }: DiscordSettingsPanelProps) {
  const { data: settings } = useGlobalSettings();
  const updateSettings = useUpdateGlobalSettings({ showSuccessToast: false });

  const [health, setHealth] = useState<IntegrationHealth | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);

  const [customChannels, setCustomChannels] = useState<CustomChannel[]>([]);
  const [showAddChannel, setShowAddChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelId, setNewChannelId] = useState('');

  const discord = settings?.discord;

  // Fetch health on mount
  const fetchHealth = useCallback(async () => {
    setHealthLoading(true);
    try {
      const res = await apiFetch('/api/integrations/registry/health', 'POST', {
        body: { id: 'discord' },
      });
      if (res.ok) {
        const data = await res.json();
        const healthResult = data.health?.[0] ?? null;
        setHealth(healthResult);
      }
    } catch {
      // Silently fail -- health is best-effort
    } finally {
      setHealthLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  // Persist a partial DiscordSettings update
  const updateDiscord = useCallback(
    (patch: Partial<DiscordSettings>) => {
      const current = settings?.discord ?? {};
      updateSettings.mutate({
        discord: { ...current, ...patch },
      });
    },
    [settings?.discord, updateSettings]
  );

  // Persist a channel mapping update through userProfile.discord.channels
  const updateChannel = useCallback(
    (key: string, value: string) => {
      const profile = settings?.userProfile ?? {};
      const discordProfile = profile.discord ?? {};
      const channels = discordProfile.channels ?? {};
      updateSettings.mutate({
        userProfile: {
          ...profile,
          discord: {
            ...discordProfile,
            channels: { ...channels, [key]: value || undefined },
          },
        },
      });
    },
    [settings?.userProfile, updateSettings]
  );

  // Get channel value from userProfile
  const getChannelValue = useCallback(
    (key: string): string => {
      const channels = settings?.userProfile?.discord?.channels;
      if (!channels) return '';
      return (channels as Record<string, string | undefined>)[key] ?? '';
    },
    [settings?.userProfile?.discord?.channels]
  );

  // Custom channel management
  const addCustomChannel = () => {
    const name = newChannelName.trim();
    const id = newChannelId.trim();
    if (!name || !id) return;

    const alreadyExists = customChannels.some((c) => c.name === name);
    if (alreadyExists) return;

    setCustomChannels((prev) => [...prev, { name, id }]);
    updateChannel(name, id);
    setNewChannelName('');
    setNewChannelId('');
    setShowAddChannel(false);
  };

  const removeCustomChannel = (channelName: string) => {
    setCustomChannels((prev) => prev.filter((c) => c.name !== channelName));
    updateChannel(channelName, '');
  };

  return (
    <div className="space-y-6 rounded-lg border border-border bg-background p-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#5865F2]/10">
            <Hash className="w-4 h-4 text-[#5865F2]" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">Discord Settings</h3>
            <p className="text-xs text-muted-foreground">
              Configure bot connection, channels, and notifications
            </p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close Discord settings">
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Bot Status */}
      <BotStatusSection
        health={health}
        loading={healthLoading}
        guildId={discord?.guildId}
        onRefresh={fetchHealth}
      />

      {/* Channel Mapping */}
      <ChannelMappingSection
        getChannelValue={getChannelValue}
        onChannelChange={updateChannel}
        customChannels={customChannels}
        onRemoveCustom={removeCustomChannel}
        showAddChannel={showAddChannel}
        onShowAddChannel={setShowAddChannel}
        newChannelName={newChannelName}
        newChannelId={newChannelId}
        onNewChannelNameChange={setNewChannelName}
        onNewChannelIdChange={setNewChannelId}
        onAddCustomChannel={addCustomChannel}
      />

      {/* Notification Preferences */}
      <NotificationPreferencesSection discord={discord} onUpdate={updateDiscord} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bot Status Section
// ---------------------------------------------------------------------------

function BotStatusSection({
  health,
  loading,
  guildId,
  onRefresh,
}: {
  health: IntegrationHealth | null;
  loading: boolean;
  guildId?: string;
  onRefresh: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Bot Status
        </h4>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          disabled={loading}
          className="h-7 gap-1.5 text-xs"
        >
          <RefreshCw className={cn('w-3 h-3', loading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      <div className="rounded-md border border-border p-3 space-y-2">
        {loading && !health ? (
          <div className="flex items-center justify-center py-3">
            <Spinner />
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground">Connection</span>
              <HealthStatusBadge health={health} />
            </div>
            {health?.message && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Status</span>
                <span className="text-xs text-muted-foreground">{health.message}</span>
              </div>
            )}
            {guildId && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Guild ID</span>
                <span className="text-xs font-mono text-muted-foreground">{guildId}</span>
              </div>
            )}
            {health?.checkedAt && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Last checked</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(health.checkedAt).toLocaleTimeString()}
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Channel Mapping Section
// ---------------------------------------------------------------------------

function ChannelMappingSection({
  getChannelValue,
  onChannelChange,
  customChannels,
  onRemoveCustom,
  showAddChannel,
  onShowAddChannel,
  newChannelName,
  newChannelId,
  onNewChannelNameChange,
  onNewChannelIdChange,
  onAddCustomChannel,
}: {
  getChannelValue: (key: string) => string;
  onChannelChange: (key: string, value: string) => void;
  customChannels: CustomChannel[];
  onRemoveCustom: (name: string) => void;
  showAddChannel: boolean;
  onShowAddChannel: (show: boolean) => void;
  newChannelName: string;
  newChannelId: string;
  onNewChannelNameChange: (value: string) => void;
  onNewChannelIdChange: (value: string) => void;
  onAddCustomChannel: () => void;
}) {
  return (
    <div className="space-y-3">
      <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        Channel Mapping
      </h4>
      <p className="text-xs text-muted-foreground">
        Map Discord channel names to channel IDs for notification routing.
      </p>

      <div className="space-y-2">
        {WELL_KNOWN_CHANNELS.map((channel) => (
          <ChannelRow
            key={channel.key}
            label={channel.label}
            description={channel.description}
            value={getChannelValue(channel.key)}
            onChange={(value) => onChannelChange(channel.key, value)}
          />
        ))}

        {customChannels.map((channel) => (
          <ChannelRow
            key={channel.name}
            label={channel.name}
            description="Custom channel"
            value={channel.id}
            onChange={(value) => onChannelChange(channel.name, value)}
            onRemove={() => onRemoveCustom(channel.name)}
          />
        ))}
      </div>

      {showAddChannel ? (
        <div className="rounded-md border border-border p-3 space-y-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Channel name</Label>
            <Input
              value={newChannelName}
              onChange={(e) => onNewChannelNameChange(e.target.value)}
              placeholder="e.g., vip-lounge"
              className="h-8 text-xs"
              onKeyDown={(e) => {
                if (e.key === 'Enter') onAddCustomChannel();
                if (e.key === 'Escape') onShowAddChannel(false);
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Channel ID</Label>
            <Input
              value={newChannelId}
              onChange={(e) => onNewChannelIdChange(e.target.value)}
              placeholder="123456789012345678"
              className="h-8 text-xs font-mono"
              onKeyDown={(e) => {
                if (e.key === 'Enter') onAddCustomChannel();
                if (e.key === 'Escape') onShowAddChannel(false);
              }}
            />
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={onAddCustomChannel}
              disabled={!newChannelName.trim() || !newChannelId.trim()}
            >
              Add
            </Button>
            <Button size="sm" variant="outline" onClick={() => onShowAddChannel(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="w-full gap-1.5"
          onClick={() => onShowAddChannel(true)}
        >
          <Plus className="w-3.5 h-3.5" />
          Add Custom Channel
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Channel Row
// ---------------------------------------------------------------------------

function ChannelRow({
  label,
  description,
  value,
  onChange,
  onRemove,
}: {
  label: string;
  description: string;
  value: string;
  onChange: (value: string) => void;
  onRemove?: () => void;
}) {
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  return (
    <div className="flex items-center gap-3 rounded-md border border-border px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-foreground">{label}</span>
          {onRemove && (
            <Button
              variant="ghost"
              size="sm"
              className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive"
              onClick={onRemove}
              aria-label={`Remove ${label} channel`}
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Input
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={() => {
          if (localValue !== value) {
            onChange(localValue);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            (e.target as HTMLInputElement).blur();
          }
        }}
        placeholder="Channel ID"
        className="h-8 w-48 text-xs font-mono"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Notification Preferences Section
// ---------------------------------------------------------------------------

function NotificationPreferencesSection({
  discord,
  onUpdate,
}: {
  discord: DiscordSettings | undefined;
  onUpdate: (patch: Partial<DiscordSettings>) => void;
}) {
  return (
    <div className="space-y-3">
      <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        Notification Preferences
      </h4>
      <div className="space-y-1">
        {NOTIFICATION_TOGGLES.map((toggle) => (
          <div
            key={toggle.key}
            className="flex items-center justify-between rounded-md px-3 py-2.5"
          >
            <div className="min-w-0 flex-1">
              <span className="text-sm text-foreground">{toggle.label}</span>
              <p className="text-xs text-muted-foreground">{toggle.description}</p>
            </div>
            <Switch
              checked={!!discord?.[toggle.key]}
              onCheckedChange={(checked) => onUpdate({ [toggle.key]: checked })}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
