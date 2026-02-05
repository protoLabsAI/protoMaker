import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { MessageSquare, RefreshCw, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { useUpdateProjectSettings } from '@/hooks/mutations';
import type { Project } from '@/lib/electron';
import type { DiscordSettings } from '@automaker/types';

interface ProjectDiscordSectionProps {
  project: Project;
}

interface DiscordFormData {
  enabled: boolean;
  featuresChannel: string;
  errorsChannel: string;
  completionsChannel: string;
  autoCreateChannels: boolean;
}

export function ProjectDiscordSection({ project }: ProjectDiscordSectionProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const updateProjectSettings = useUpdateProjectSettings();

  // Load Discord settings from project settings
  const [discordSettings, setDiscordSettings] = useState<DiscordSettings>(() => {
    return (
      (project.settings?.discordSettings as DiscordSettings) || {
        enabled: false,
        channelMapping: {},
        autoCreateChannels: false,
      }
    );
  });

  const { register, handleSubmit, watch, setValue } = useForm<DiscordFormData>({
    defaultValues: {
      enabled: discordSettings.enabled || false,
      featuresChannel: discordSettings.channelMapping?.features || '',
      errorsChannel: discordSettings.channelMapping?.errors || '',
      completionsChannel: discordSettings.channelMapping?.completions || '',
      autoCreateChannels: discordSettings.autoCreateChannels || false,
    },
  });

  const enabled = watch('enabled');

  const onSubmit = async (data: DiscordFormData) => {
    const newDiscordSettings: DiscordSettings = {
      enabled: data.enabled,
      channelMapping: {
        features: data.featuresChannel || undefined,
        errors: data.errorsChannel || undefined,
        completions: data.completionsChannel || undefined,
      },
      autoCreateChannels: data.autoCreateChannels,
    };

    updateProjectSettings.mutate(
      {
        projectPath: project.path,
        settings: { discordSettings: newDiscordSettings },
      },
      {
        onSuccess: () => {
          setDiscordSettings(newDiscordSettings);
          toast.success('Discord settings saved', {
            description: 'Your Discord configuration has been updated.',
          });
        },
        onError: (error) => {
          console.error('Error saving Discord settings:', error);
          toast.error('Failed to save settings', {
            description: error instanceof Error ? error.message : 'An unknown error occurred',
          });
        },
      }
    );
  };

  const handleRefreshChannels = async () => {
    setIsRefreshing(true);
    try {
      // TODO: Implement Discord channel sync via MCP
      // This would call the Discord MCP server to fetch available channels
      toast.info('Channel sync coming soon', {
        description: 'Discord channel synchronization will be available in a future update.',
      });
    } catch (error) {
      toast.error('Failed to refresh channels', {
        description: error instanceof Error ? error.message : 'An unknown error occurred',
      });
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  const openDiscordChannel = (channelId: string) => {
    if (!channelId) return;

    // Discord channel URLs follow the pattern: https://discord.com/channels/{server_id}/{channel_id}
    // For now, we'll just show a toast since we don't know the server ID
    toast.info('Discord channel link', {
      description: `Channel ID: ${channelId}. Open Discord to view this channel.`,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <MessageSquare className="w-5 h-5 text-muted-foreground" />
          <h2 className="text-2xl font-bold">Discord Integration</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Configure Discord notifications for project events via the Discord MCP server.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Enable Discord */}
        <div className="flex items-center justify-between rounded-lg border border-border bg-card p-4">
          <div className="space-y-0.5 flex-1">
            <Label htmlFor="discordEnabled" className="text-base font-medium">
              Enable Discord Integration
            </Label>
            <p className="text-sm text-muted-foreground">
              Send project notifications to Discord channels via MCP.
            </p>
          </div>
          <Switch
            id="discordEnabled"
            {...register('enabled')}
            checked={watch('enabled')}
            onCheckedChange={(checked) => setValue('enabled', checked)}
          />
        </div>

        {enabled && (
          <>
            {/* Channel Mapping */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-medium">Channel Mapping</h3>
                  <p className="text-sm text-muted-foreground">
                    Map project events to Discord channels using channel IDs.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleRefreshChannels}
                  disabled={isRefreshing}
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                  Sync Channels
                </Button>
              </div>

              {/* Features Channel */}
              <div className="space-y-2">
                <Label htmlFor="featuresChannel">Features Channel</Label>
                <div className="flex gap-2">
                  <Input
                    id="featuresChannel"
                    placeholder="Channel ID for feature notifications"
                    {...register('featuresChannel')}
                    className="flex-1"
                  />
                  {watch('featuresChannel') && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => openDiscordChannel(watch('featuresChannel'))}
                    >
                      <ExternalLink className="w-4 h-4" />
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Notifications for feature creation, updates, and status changes.
                </p>
              </div>

              {/* Errors Channel */}
              <div className="space-y-2">
                <Label htmlFor="errorsChannel">Errors Channel</Label>
                <div className="flex gap-2">
                  <Input
                    id="errorsChannel"
                    placeholder="Channel ID for error notifications"
                    {...register('errorsChannel')}
                    className="flex-1"
                  />
                  {watch('errorsChannel') && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => openDiscordChannel(watch('errorsChannel'))}
                    >
                      <ExternalLink className="w-4 h-4" />
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Notifications for build failures, agent errors, and other issues.
                </p>
              </div>

              {/* Completions Channel */}
              <div className="space-y-2">
                <Label htmlFor="completionsChannel">Completions Channel</Label>
                <div className="flex gap-2">
                  <Input
                    id="completionsChannel"
                    placeholder="Channel ID for completion notifications"
                    {...register('completionsChannel')}
                    className="flex-1"
                  />
                  {watch('completionsChannel') && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => openDiscordChannel(watch('completionsChannel'))}
                    >
                      <ExternalLink className="w-4 h-4" />
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Notifications for completed features, PRs merged, and milestones reached.
                </p>
              </div>
            </div>

            {/* Auto-Create Channels */}
            <div className="flex items-center justify-between rounded-lg border border-border bg-card p-4">
              <div className="space-y-0.5 flex-1">
                <Label htmlFor="autoCreateChannels" className="text-base font-medium">
                  Auto-Create Channels
                </Label>
                <p className="text-sm text-muted-foreground">
                  Automatically create Discord channels if they don't exist.
                </p>
              </div>
              <Switch
                id="autoCreateChannels"
                {...register('autoCreateChannels')}
                checked={watch('autoCreateChannels')}
                onCheckedChange={(checked) => setValue('autoCreateChannels', checked)}
              />
            </div>
          </>
        )}

        {/* Save Button */}
        <div className="flex justify-end">
          <Button type="submit" disabled={updateProjectSettings.isPending}>
            {updateProjectSettings.isPending ? 'Saving...' : 'Save Settings'}
          </Button>
        </div>
      </form>

      {/* Documentation */}
      <div className="rounded-lg border border-border bg-muted/50 p-4 space-y-2">
        <h3 className="font-medium text-sm">Setting up Discord Integration</h3>
        <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
          <li>Ensure the Discord MCP server is configured in your Claude settings</li>
          <li>Enable Discord integration above</li>
          <li>Enter Discord channel IDs for the events you want to track</li>
          <li>Optionally enable auto-create channels to have them created automatically</li>
          <li>Save your settings</li>
          <li>Use the /discord Claude plugin command to manage Discord integration</li>
        </ol>
        <p className="text-xs text-muted-foreground mt-2">
          <strong>Note:</strong> You can find channel IDs by right-clicking a channel in Discord and
          selecting "Copy ID". Make sure Developer Mode is enabled in Discord settings.
        </p>
      </div>
    </div>
  );
}
