import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { MessageSquare, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { toast } from 'sonner';

export function DiscordSettings() {
  // State for Discord settings
  const [discordEnabled, setDiscordEnabled] = useState(false);
  const [guildId, setGuildId] = useState('');
  const [notifyOnFeatureSuccess, setNotifyOnFeatureSuccess] = useState(true);
  const [notifyOnFeatureError, setNotifyOnFeatureError] = useState(true);
  const [notifyOnAutoModeComplete, setNotifyOnAutoModeComplete] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [botPermissionsGranted, setBotPermissionsGranted] = useState(false);

  const handleTestConnection = async () => {
    setConnectionStatus('testing');

    // Simulate connection test
    setTimeout(() => {
      if (guildId) {
        setConnectionStatus('success');
        setBotPermissionsGranted(true);
        toast.success('Discord connection successful', {
          description: 'Bot permissions verified',
        });
      } else {
        setConnectionStatus('error');
        toast.error('Connection failed', {
          description: 'Please enter a valid Guild ID',
        });
      }

      // Reset status after 3 seconds
      setTimeout(() => setConnectionStatus('idle'), 3000);
    }, 1500);
  };

  return (
    <div
      className={cn(
        'rounded-2xl overflow-hidden',
        'border border-border/50',
        'bg-gradient-to-br from-card/90 via-card/70 to-card/80 backdrop-blur-xl',
        'shadow-sm shadow-black/5'
      )}
    >
      <div className="p-6 border-b border-border/50 bg-gradient-to-r from-transparent via-accent/5 to-transparent">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500/20 to-indigo-600/10 flex items-center justify-center border border-indigo-500/20">
            <MessageSquare className="w-5 h-5 text-indigo-500" />
          </div>
          <h2 className="text-lg font-semibold text-foreground tracking-tight">Discord Integration</h2>
        </div>
        <p className="text-sm text-muted-foreground/80 ml-12">
          Configure Discord notifications for feature status updates and auto-mode events.
        </p>
      </div>

      <div className="p-6 space-y-6">
        {/* Global Discord Integration Toggle */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Label className="text-foreground font-medium">Enable Discord Integration</Label>
            <p className="text-xs text-muted-foreground">
              Send notifications to Discord when features complete or fail
            </p>
          </div>
          <Switch
            checked={discordEnabled}
            onCheckedChange={(checked) => {
              setDiscordEnabled(checked);
              toast.success(
                checked ? 'Discord integration enabled' : 'Discord integration disabled'
              );
            }}
          />
        </div>

        {/* Guild ID Input */}
        {discordEnabled && (
          <>
            <div className="space-y-3">
              <Label className="text-foreground font-medium">Default Guild ID</Label>
              <p className="text-xs text-muted-foreground">
                The Discord server (guild) ID where notifications will be sent
              </p>
              <Input
                value={guildId}
                onChange={(e) => setGuildId(e.target.value)}
                placeholder="e.g., 1234567890123456789"
                className="bg-accent/30 border-border/50 font-mono"
              />
            </div>

            {/* Notification Preferences */}
            <div className="space-y-4 pt-2">
              <Label className="text-foreground font-medium">Notification Preferences</Label>
              <p className="text-xs text-muted-foreground mb-3">
                Choose which events trigger Discord notifications
              </p>

              {/* Feature Success */}
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label className="text-sm font-normal">Feature Success</Label>
                  <p className="text-xs text-muted-foreground">
                    Notify when a feature completes successfully
                  </p>
                </div>
                <Switch
                  checked={notifyOnFeatureSuccess}
                  onCheckedChange={setNotifyOnFeatureSuccess}
                />
              </div>

              {/* Feature Error */}
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label className="text-sm font-normal">Feature Error</Label>
                  <p className="text-xs text-muted-foreground">
                    Notify when a feature fails with an error
                  </p>
                </div>
                <Switch
                  checked={notifyOnFeatureError}
                  onCheckedChange={setNotifyOnFeatureError}
                />
              </div>

              {/* Auto-Mode Complete */}
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label className="text-sm font-normal">Auto-Mode Complete</Label>
                  <p className="text-xs text-muted-foreground">
                    Notify when auto-mode finishes processing all features
                  </p>
                </div>
                <Switch
                  checked={notifyOnAutoModeComplete}
                  onCheckedChange={setNotifyOnAutoModeComplete}
                />
              </div>
            </div>

            {/* Bot Permission Status */}
            <div className="space-y-3 pt-2">
              <Label className="text-foreground font-medium">Bot Permissions</Label>
              <div
                className={cn(
                  'flex items-center gap-3 p-3 rounded-lg border',
                  botPermissionsGranted
                    ? 'bg-green-500/10 border-green-500/30'
                    : 'bg-muted/30 border-border/50'
                )}
              >
                {botPermissionsGranted ? (
                  <>
                    <Check className="w-4 h-4 text-green-500" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-green-500">Permissions Granted</p>
                      <p className="text-xs text-muted-foreground">
                        Bot has required permissions to send messages
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <X className="w-4 h-4 text-muted-foreground" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">Not Connected</p>
                      <p className="text-xs text-muted-foreground">
                        Test connection to verify bot permissions
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Test Connection Button */}
            <div className="pt-2">
              <Button
                onClick={handleTestConnection}
                disabled={!guildId || connectionStatus === 'testing'}
                className="w-full"
                variant={connectionStatus === 'success' ? 'default' : 'outline'}
              >
                {connectionStatus === 'testing' && 'Testing Connection...'}
                {connectionStatus === 'success' && (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Connection Successful
                  </>
                )}
                {connectionStatus === 'error' && (
                  <>
                    <X className="w-4 h-4 mr-2" />
                    Connection Failed
                  </>
                )}
                {connectionStatus === 'idle' && 'Test Connection'}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
