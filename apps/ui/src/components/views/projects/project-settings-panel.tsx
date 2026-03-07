import { useState, useEffect } from 'react';
import { MessageSquare, Send, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@protolabsai/ui/atoms';
import { Input } from '@protolabsai/ui/atoms';
import { Label } from '@protolabsai/ui/atoms';
import { toast } from 'sonner';
import { useUpdateProjectSettings } from '@/hooks/mutations';
import { useProjectSettings } from '@/hooks/queries';
import type { Project } from '@/lib/electron';

interface ProjectSettingsPanelProps {
  project: Project;
}

/**
 * Validates a Discord webhook URL.
 * Must match: https://discord.com/api/webhooks/{id}/{token}
 * Also accepts canary/ptb subdomains.
 */
export function validateDiscordWebhookUrl(url: string): boolean {
  if (!url) return false;
  return /^https:\/\/(discord\.com|canary\.discord\.com|ptb\.discord\.com)\/api\/webhooks\/\d+\/[\w-]+$/.test(
    url
  );
}

export function ProjectSettingsPanel({ project }: ProjectSettingsPanelProps) {
  const updateProjectSettings = useUpdateProjectSettings();
  const { data: projectSettings } = useProjectSettings(project.path);

  const [webhookUrl, setWebhookUrl] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  // Sync from server when project settings load
  useEffect(() => {
    if (projectSettings?.ceremonySettings?.discordWebhookUrl) {
      setWebhookUrl(projectSettings.ceremonySettings.discordWebhookUrl);
    }
  }, [projectSettings?.ceremonySettings?.discordWebhookUrl]);

  const handleUrlChange = (value: string) => {
    setWebhookUrl(value);
    if (value && !validateDiscordWebhookUrl(value)) {
      setUrlError('Must be a valid Discord webhook URL (https://discord.com/api/webhooks/...)');
    } else {
      setUrlError(null);
    }
  };

  const handleSave = () => {
    if (webhookUrl && !validateDiscordWebhookUrl(webhookUrl)) {
      setUrlError('Must be a valid Discord webhook URL (https://discord.com/api/webhooks/...)');
      return;
    }

    const existingCeremonySettings = projectSettings?.ceremonySettings ?? {};

    updateProjectSettings.mutate(
      {
        projectPath: project.path,
        settings: {
          ceremonySettings: {
            ...existingCeremonySettings,
            discordWebhookUrl: webhookUrl || undefined,
          },
        },
      },
      {
        onSuccess: () => {
          toast.success('Settings saved', {
            description: 'Discord webhook URL has been updated.',
          });
        },
        onError: (error) => {
          toast.error('Failed to save settings', {
            description: error instanceof Error ? error.message : 'An unknown error occurred',
          });
        },
      }
    );
  };

  const handleTestWebhook = async () => {
    if (!webhookUrl || !validateDiscordWebhookUrl(webhookUrl)) {
      setUrlError('Must be a valid Discord webhook URL before testing');
      return;
    }

    setTestStatus('loading');
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: '✅ Test message from Automaker — your webhook is configured correctly!',
        }),
      });

      if (response.ok || response.status === 204) {
        setTestStatus('success');
        toast.success('Test message sent', {
          description: 'Your Discord webhook is working correctly.',
        });
      } else {
        setTestStatus('error');
        toast.error('Webhook test failed', {
          description: `Discord returned status ${response.status}. Check your webhook URL.`,
        });
      }
    } catch (error) {
      setTestStatus('error');
      toast.error('Webhook test failed', {
        description: error instanceof Error ? error.message : 'Network error — check your URL.',
      });
    } finally {
      setTimeout(() => setTestStatus('idle'), 3000);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <MessageSquare className="w-5 h-5 text-muted-foreground" />
          <h2 className="text-2xl font-bold">Discord Webhook</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Configure a Discord webhook URL to receive ceremony announcements directly in your Discord
          server, without requiring the Discord bot integration.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="discord-webhook-url">Discord Webhook URL</Label>
        <div className="flex gap-2">
          <Input
            id="discord-webhook-url"
            type="url"
            placeholder="https://discord.com/api/webhooks/..."
            value={webhookUrl}
            onChange={(e) => handleUrlChange(e.target.value)}
            className={urlError ? 'border-destructive' : ''}
            data-testid="discord-webhook-url-input"
          />
          <Button
            type="button"
            variant="outline"
            onClick={handleTestWebhook}
            disabled={testStatus === 'loading' || !webhookUrl}
            data-testid="test-webhook-button"
          >
            {testStatus === 'loading' && <Send className="w-4 h-4 animate-pulse" />}
            {testStatus === 'success' && <CheckCircle2 className="w-4 h-4 text-green-500" />}
            {testStatus === 'error' && <XCircle className="w-4 h-4 text-destructive" />}
            {testStatus === 'idle' && <Send className="w-4 h-4" />}
            <span className="ml-2">{testStatus === 'loading' ? 'Sending...' : 'Test webhook'}</span>
          </Button>
        </div>
        {urlError && (
          <p className="text-xs text-destructive" data-testid="webhook-url-error">
            {urlError}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Create a webhook in your Discord server settings and paste the URL here. Ceremonies will
          post to this URL when triggered.
        </p>
      </div>

      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={updateProjectSettings.isPending || !!urlError}
          data-testid="save-webhook-settings-button"
        >
          {updateProjectSettings.isPending ? 'Saving...' : 'Save Settings'}
        </Button>
      </div>
    </div>
  );
}
