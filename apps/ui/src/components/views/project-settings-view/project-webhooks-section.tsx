import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Webhook, Copy, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { Button } from '@protolabs/ui/atoms';
import { Input } from '@protolabs/ui/atoms';
import { Label } from '@protolabs/ui/atoms';
import { Switch } from '@protolabs/ui/atoms';
import { toast } from 'sonner';
import { useUpdateProjectSettings } from '@/hooks/mutations';
import type { Project } from '@/lib/electron';
import type { WebhookSettings } from '@automaker/types';

interface ProjectWebhooksSectionProps {
  project: Project;
}

interface WebhookFormData {
  webhookEnabled: boolean;
  webhookSecret: string;
  autoCreateFromIssues: boolean;
  autoCreateLabels: string;
}

export function ProjectWebhooksSection({ project }: ProjectWebhooksSectionProps) {
  const [showSecret, setShowSecret] = useState(false);
  const [copiedWebhookUrl, setCopiedWebhookUrl] = useState(false);
  const updateProjectSettings = useUpdateProjectSettings();

  // Load webhook settings from project settings
  const [webhookSettings, setWebhookSettings] = useState<WebhookSettings>(() => {
    return (
      (project.settings?.webhookSettings as WebhookSettings) || {
        webhookEnabled: false,
        webhookSecret: '',
        autoCreateFromIssues: false,
        autoCreateLabels: [],
      }
    );
  });

  const { register, handleSubmit, watch, setValue } = useForm<WebhookFormData>({
    defaultValues: {
      webhookEnabled: webhookSettings.webhookEnabled || false,
      webhookSecret: webhookSettings.webhookSecret || '',
      autoCreateFromIssues: webhookSettings.autoCreateFromIssues || false,
      autoCreateLabels: webhookSettings.autoCreateLabels?.join(', ') || '',
    },
  });

  const webhookEnabled = watch('webhookEnabled');

  const onSubmit = async (data: WebhookFormData) => {
    // Parse comma-separated labels into array
    const labels = data.autoCreateLabels
      .split(',')
      .map((label) => label.trim())
      .filter((label) => label.length > 0);

    const newWebhookSettings: WebhookSettings = {
      webhookEnabled: data.webhookEnabled,
      webhookSecret: data.webhookSecret,
      autoCreateFromIssues: data.autoCreateFromIssues,
      autoCreateLabels: labels,
    };

    updateProjectSettings.mutate(
      {
        projectPath: project.path,
        settings: { webhookSettings: newWebhookSettings },
      },
      {
        onSuccess: () => {
          setWebhookSettings(newWebhookSettings);
          toast.success('Webhook settings saved', {
            description: 'Your webhook configuration has been updated.',
          });
        },
        onError: (error) => {
          console.error('Error saving webhook settings:', error);
          toast.error('Failed to save settings', {
            description: error instanceof Error ? error.message : 'An unknown error occurred',
          });
        },
      }
    );
  };

  const generateSecret = () => {
    // Generate a random 32-byte hex string
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    const secret = Array.from(array)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    setValue('webhookSecret', secret);
  };

  const copyWebhookUrl = async () => {
    const webhookUrl = `${window.location.protocol}//${window.location.hostname}:3008/api/github/webhook?project=${encodeURIComponent(project.path)}`;

    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopiedWebhookUrl(true);
      toast.success('Webhook URL copied', {
        description: 'The webhook URL has been copied to your clipboard.',
      });
      setTimeout(() => setCopiedWebhookUrl(false), 2000);
    } catch (_error) {
      toast.error('Failed to copy URL', {
        description: 'Could not copy webhook URL to clipboard.',
      });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Webhook className="w-5 h-5 text-muted-foreground" />
          <h2 className="text-2xl font-bold">Webhooks</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Configure GitHub webhooks to automatically receive events and create features from issues.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Enable Webhooks */}
        <div className="flex items-center justify-between rounded-lg border border-border bg-card p-4">
          <div className="space-y-0.5 flex-1">
            <Label htmlFor="webhookEnabled" className="text-base font-medium">
              Enable Webhooks
            </Label>
            <p className="text-sm text-muted-foreground">
              Accept incoming webhook events from GitHub for this project.
            </p>
          </div>
          <Switch
            id="webhookEnabled"
            {...register('webhookEnabled')}
            checked={watch('webhookEnabled')}
            onCheckedChange={(checked) => setValue('webhookEnabled', checked)}
          />
        </div>

        {/* Webhook Secret */}
        {webhookEnabled && (
          <>
            <div className="space-y-2">
              <Label htmlFor="webhookSecret">Webhook Secret</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="webhookSecret"
                    type={showSecret ? 'text' : 'password'}
                    placeholder="Enter or generate a webhook secret"
                    {...register('webhookSecret', {
                      required: webhookEnabled,
                    })}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret(!showSecret)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-accent rounded-md transition-colors"
                    tabIndex={-1}
                  >
                    {showSecret ? (
                      <EyeOff className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <Eye className="w-4 h-4 text-muted-foreground" />
                    )}
                  </button>
                </div>
                <Button type="button" onClick={generateSecret} variant="outline">
                  Generate
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                This secret is used to verify webhook signatures from GitHub. Copy this value and
                add it to your GitHub webhook configuration.
              </p>
            </div>

            {/* Webhook URL */}
            <div className="space-y-2">
              <Label>Webhook URL</Label>
              <div className="flex gap-2">
                <Input
                  value={`${window.location.protocol}//${window.location.hostname}:3008/api/github/webhook?project=${encodeURIComponent(project.path)}`}
                  readOnly
                  className="flex-1 font-mono text-xs"
                />
                <Button type="button" onClick={copyWebhookUrl} variant="outline" size="sm">
                  {copiedWebhookUrl ? (
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Use this URL when configuring the webhook in your GitHub repository settings.
              </p>
            </div>

            {/* Auto-Create Features */}
            <div className="space-y-4 rounded-lg border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5 flex-1">
                  <Label htmlFor="autoCreateFromIssues" className="text-base font-medium">
                    Auto-Create Features from Issues
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Automatically create board features when GitHub issues are opened.
                  </p>
                </div>
                <Switch
                  id="autoCreateFromIssues"
                  {...register('autoCreateFromIssues')}
                  checked={watch('autoCreateFromIssues')}
                  onCheckedChange={(checked) => setValue('autoCreateFromIssues', checked)}
                />
              </div>

              {watch('autoCreateFromIssues') && (
                <div className="space-y-2 pt-2">
                  <Label htmlFor="autoCreateLabels">Required Labels (Optional)</Label>
                  <Input
                    id="autoCreateLabels"
                    placeholder="feature, enhancement (comma-separated)"
                    {...register('autoCreateLabels')}
                  />
                  <p className="text-xs text-muted-foreground">
                    Only create features for issues with these labels. Leave empty to create
                    features for all issues.
                  </p>
                </div>
              )}
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
        <h3 className="font-medium text-sm">Setting up GitHub Webhooks</h3>
        <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
          <li>Enable webhooks and generate a secret above</li>
          <li>Copy the webhook URL and secret</li>
          <li>Go to your GitHub repository → Settings → Webhooks → Add webhook</li>
          <li>Paste the webhook URL in the "Payload URL" field</li>
          <li>Set "Content type" to "application/json"</li>
          <li>Paste the secret in the "Secret" field</li>
          <li>Select individual events: Issues, Pull requests, Pushes (or "Send me everything")</li>
          <li>Click "Add webhook"</li>
        </ol>
      </div>
    </div>
  );
}
