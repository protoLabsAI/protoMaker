import { useState } from 'react';
import { Shield, AlertTriangle, Key, Eye, EyeOff, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface SecuritySectionProps {
  skipSandboxWarning: boolean;
  onSkipSandboxWarningChange: (skip: boolean) => void;
  githubWebhookSecret: string;
  onGithubWebhookSecretChange: (secret: string) => void;
}

export function SecuritySection({
  skipSandboxWarning,
  onSkipSandboxWarningChange,
  githubWebhookSecret,
  onGithubWebhookSecretChange,
}: SecuritySectionProps) {
  const [showSecret, setShowSecret] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const handleCopySecret = async () => {
    if (githubWebhookSecret) {
      await navigator.clipboard.writeText(githubWebhookSecret);
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    }
  };

  const handleCopyWebhookUrl = async () => {
    const webhookUrl = `${window.location.protocol}//${window.location.hostname}:3008/api/webhooks/github`;
    await navigator.clipboard.writeText(webhookUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  return (
    <div
      className={cn(
        'rounded-2xl overflow-hidden',
        'border border-border/50',
        'bg-gradient-to-br from-card/80 via-card/70 to-card/80 backdrop-blur-xl',
        'shadow-sm'
      )}
    >
      <div className="p-6 border-b border-border/30 bg-gradient-to-r from-primary/5 via-transparent to-transparent">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center border border-primary/20">
            <Shield className="w-5 h-5 text-primary" />
          </div>
          <h2 className="text-lg font-semibold text-foreground tracking-tight">Security</h2>
        </div>
        <p className="text-sm text-muted-foreground/80 ml-12">
          Configure security warnings and protections.
        </p>
      </div>
      <div className="p-6 space-y-4">
        {/* Sandbox Warning Toggle */}
        <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-muted/30 border border-border/30">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-500/15 to-amber-600/10 border border-amber-500/20 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
            </div>
            <div className="min-w-0 flex-1">
              <Label
                htmlFor="sandbox-warning-toggle"
                className="font-medium text-foreground cursor-pointer"
              >
                Show Sandbox Warning on Startup
              </Label>
              <p className="text-xs text-muted-foreground/70 mt-0.5">
                Display a security warning when not running in a sandboxed environment
              </p>
            </div>
          </div>
          <Switch
            id="sandbox-warning-toggle"
            checked={!skipSandboxWarning}
            onCheckedChange={(checked) => onSkipSandboxWarningChange(!checked)}
            data-testid="sandbox-warning-toggle"
          />
        </div>

        {/* Info text */}
        <p className="text-xs text-muted-foreground/60 px-4">
          When enabled, you&apos;ll see a warning on app startup if you&apos;re not running in a
          containerized environment (like Docker). This helps remind you to use proper isolation
          when running AI agents.
        </p>

        {/* GitHub Webhook Secret */}
        <div className="space-y-3 mt-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-600/10 flex items-center justify-center border border-blue-500/20">
              <Key className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground tracking-tight">
                GitHub Webhook Secret
              </h3>
              <p className="text-xs text-muted-foreground/80">
                Secret for validating inbound GitHub webhook requests
              </p>
            </div>
          </div>

          {/* Secret Input Field */}
          <div className="p-4 rounded-xl bg-muted/30 border border-border/30 space-y-3">
            <div className="space-y-2">
              <Label htmlFor="webhook-secret" className="text-sm font-medium text-foreground">
                Webhook Secret
              </Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="webhook-secret"
                    type={showSecret ? 'text' : 'password'}
                    value={githubWebhookSecret}
                    onChange={(e) => onGithubWebhookSecretChange(e.target.value)}
                    placeholder="Enter webhook secret..."
                    className="pr-10"
                    data-testid="webhook-secret-input"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full w-10 hover:bg-transparent"
                    onClick={() => setShowSecret(!showSecret)}
                    data-testid="toggle-secret-visibility"
                  >
                    {showSecret ? (
                      <EyeOff className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <Eye className="w-4 h-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleCopySecret}
                  disabled={!githubWebhookSecret}
                  data-testid="copy-secret-button"
                >
                  {copiedSecret ? (
                    <Check className="w-4 h-4 text-green-500" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground/60">
                This secret is used to verify that webhook payloads are coming from GitHub
              </p>
            </div>

            {/* Webhook URL */}
            <div className="space-y-2">
              <Label htmlFor="webhook-url" className="text-sm font-medium text-foreground">
                Webhook URL
              </Label>
              <div className="flex gap-2">
                <Input
                  id="webhook-url"
                  type="text"
                  value={`${window.location.protocol}//${window.location.hostname}:3008/api/webhooks/github`}
                  readOnly
                  className="font-mono text-xs"
                  data-testid="webhook-url-input"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleCopyWebhookUrl}
                  data-testid="copy-url-button"
                >
                  {copiedUrl ? (
                    <Check className="w-4 h-4 text-green-500" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground/60">
                Configure this URL in your GitHub repository webhook settings
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
