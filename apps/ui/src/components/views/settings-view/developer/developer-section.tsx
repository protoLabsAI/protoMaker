import { Label } from '@protolabsai/ui/atoms';
import { Switch } from '@protolabsai/ui/atoms';
import { Code2, Flag, Server, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore, type ServerLogLevel } from '@/store/app-store';
import { toast } from 'sonner';
import type { FeatureFlags } from '@protolabsai/types';
import { useState } from 'react';

const LOG_LEVEL_OPTIONS: { value: ServerLogLevel; label: string; description: string }[] = [
  { value: 'error', label: 'Error', description: 'Only show error messages' },
  { value: 'warn', label: 'Warning', description: 'Show warnings and errors' },
  { value: 'info', label: 'Info', description: 'Show general information (default)' },
  { value: 'debug', label: 'Debug', description: 'Show all messages including debug' },
];

const FEATURE_FLAG_LABELS: Record<keyof FeatureFlags, { label: string; description: string }> = {
  designs: {
    label: 'Designs',
    description: 'Show the Designs (pen file) viewer in the project sidebar.',
  },
  docs: {
    label: 'Docs',
    description: 'Show the Docs viewer in the project sidebar.',
  },
  pipeline: {
    label: 'Authority Pipeline + HITL',
    description:
      'Enables HITL interrupt forms and pipeline gate cycling (TRIAGE, SPEC, PUBLISH). Off by default.',
  },
  specEditor: {
    label: 'Spec Editor',
    description: 'Show the Spec Editor in the sidebar Tools section.',
  },
  systemView: {
    label: 'System View',
    description: 'Show the System View (network/dependency graph) in the project sidebar.',
  },
  userPresenceDetection: {
    label: 'User Presence Detection',
    description:
      'Enable sensor-driven user presence awareness. Requires compatible sensor hardware or agent.',
  },
  reactorEnabled: {
    label: 'Ava Channel Reactor',
    description:
      'Enable the reactive orchestrator that monitors the Ava Channel and auto-responds to incoming messages. Requires hivemind mode.',
  },
};

export function DeveloperSection() {
  const {
    serverLogLevel,
    setServerLogLevel,
    enableRequestLogging,
    setEnableRequestLogging,
    featureFlags,
    setFeatureFlags,
    serverUrlOverride,
    serverStatus,
    serverInfo,
    recentConnections,
    connectToServer,
    removeRecentConnection,
  } = useAppStore();

  const [urlInput, setUrlInput] = useState(serverUrlOverride ?? '');

  return (
    <div
      className={cn(
        'rounded-lg overflow-hidden',
        'border border-border/50',
        'bg-gradient-to-br from-card/90 via-card/70 to-card/80 backdrop-blur-xl',
        'shadow-sm shadow-black/5'
      )}
    >
      <div className="p-4 border-b border-border/50 bg-gradient-to-r from-transparent via-accent/5 to-transparent">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-purple-500/20 to-purple-600/10 flex items-center justify-center border border-purple-500/20">
            <Code2 className="w-5 h-5 text-purple-500" />
          </div>
          <h2 className="text-lg font-semibold text-foreground tracking-tight">Developer</h2>
        </div>
        <p className="text-sm text-muted-foreground/80 ml-12">
          Advanced settings for debugging and development.
        </p>
      </div>
      <div className="p-4 space-y-4">
        {/* Server Log Level */}
        <div className="space-y-3">
          <Label className="text-foreground font-medium">Server Log Level</Label>
          <p className="text-xs text-muted-foreground">
            Control the verbosity of API server logs. Set to "Error" to only see error messages in
            the server console.
          </p>
          <select
            value={serverLogLevel}
            onChange={(e) => {
              setServerLogLevel(e.target.value as ServerLogLevel);
              toast.success(`Log level changed to ${e.target.value}`, {
                description: 'Server logging verbosity updated',
              });
            }}
            className={cn(
              'w-full px-3 py-2 rounded-lg',
              'bg-accent/30 border border-border/50',
              'text-foreground text-sm',
              'focus:outline-none focus:ring-2 focus:ring-purple-500/30'
            )}
          >
            {LOG_LEVEL_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} - {option.description}
              </option>
            ))}
          </select>
        </div>

        {/* HTTP Request Logging */}
        <div className="flex items-center justify-between pt-4 border-t border-border/30">
          <div className="space-y-1">
            <Label className="text-foreground font-medium">HTTP Request Logging</Label>
            <p className="text-xs text-muted-foreground">
              Log all HTTP requests (method, URL, status) to the server console.
            </p>
          </div>
          <Switch
            checked={enableRequestLogging}
            onCheckedChange={(checked) => {
              setEnableRequestLogging(checked);
              toast.success(checked ? 'Request logging enabled' : 'Request logging disabled', {
                description: 'HTTP request logging updated',
              });
            }}
          />
        </div>

        {/* Server Connection */}
        <div className="pt-4 border-t border-border/30 space-y-3">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-muted-foreground" />
            <Label className="text-foreground font-medium">Server Connection</Label>
            {/* Status badge */}
            <span
              className={cn(
                'ml-auto inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium',
                serverStatus === 'connected' &&
                  'bg-green-500/15 text-green-600 dark:text-green-400',
                serverStatus === 'disconnected' && 'bg-red-500/15 text-red-600 dark:text-red-400',
                serverStatus === 'connecting' &&
                  'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400'
              )}
            >
              <span
                className={cn(
                  'w-1.5 h-1.5 rounded-full',
                  serverStatus === 'connected' && 'bg-green-500',
                  serverStatus === 'disconnected' && 'bg-red-500',
                  serverStatus === 'connecting' && 'bg-yellow-500 animate-pulse'
                )}
              />
              {serverStatus === 'connected'
                ? 'Connected'
                : serverStatus === 'connecting'
                  ? 'Connecting…'
                  : 'Disconnected'}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Connect to a different Automaker server at runtime. Leave blank to use the default
            server.
          </p>

          {/* URL input + Connect button */}
          <div className="flex gap-2">
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && urlInput.trim()) {
                  void connectToServer(urlInput.trim()).then(() => {
                    toast.success('Server connection updated', {
                      description: urlInput.trim(),
                    });
                  });
                }
              }}
              placeholder="http://localhost:3008"
              className={cn(
                'flex-1 px-3 py-2 rounded-lg',
                'bg-accent/30 border border-border/50',
                'text-foreground text-sm placeholder:text-muted-foreground/50',
                'focus:outline-none focus:ring-2 focus:ring-purple-500/30'
              )}
            />
            <button
              onClick={() => {
                const url = urlInput.trim();
                if (!url) return;
                void connectToServer(url).then(() => {
                  toast.success('Server connection updated', {
                    description: url,
                  });
                });
              }}
              disabled={serverStatus === 'connecting' || !urlInput.trim()}
              className={cn(
                'px-3 py-2 rounded-lg text-sm font-medium',
                'bg-purple-500/20 text-purple-600 dark:text-purple-400',
                'border border-purple-500/30',
                'hover:bg-purple-500/30 transition-colors',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              {serverStatus === 'connecting' ? 'Connecting…' : 'Connect'}
            </button>
          </div>

          {/* Connected server info */}
          {serverStatus === 'connected' && serverInfo && (
            <div
              className={cn(
                'rounded-lg px-3 py-2 space-y-1',
                'bg-green-500/5 border border-green-500/20'
              )}
            >
              <p className="text-xs font-medium text-green-600 dark:text-green-400">
                Connected server
              </p>
              <p className="text-xs text-muted-foreground">
                Version: <span className="text-foreground">{serverInfo.version}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                Status: <span className="text-foreground">{serverInfo.status}</span>
              </p>
            </div>
          )}

          {/* Recent connections */}
          {recentConnections.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium">Recent connections</p>
              <div className="space-y-1">
                {recentConnections.map((conn) => (
                  <div
                    key={conn.url}
                    className={cn(
                      'flex items-center gap-2 px-2 py-1.5 rounded-lg',
                      'bg-accent/20 border border-border/30',
                      'group'
                    )}
                  >
                    <button
                      onClick={() => {
                        setUrlInput(conn.url);
                        void connectToServer(conn.url).then(() => {
                          toast.success('Server connection updated', {
                            description: conn.url,
                          });
                        });
                      }}
                      className="flex-1 text-left min-w-0"
                    >
                      <p className="text-xs text-foreground truncate">{conn.url}</p>
                      <p className="text-xs text-muted-foreground/70">
                        {new Date(conn.lastConnected).toLocaleString()}
                      </p>
                    </button>
                    <button
                      onClick={() => {
                        removeRecentConnection(conn.url);
                        toast.success('Removed from history');
                      }}
                      className={cn(
                        'flex-shrink-0 p-1 rounded',
                        'text-muted-foreground/50 hover:text-muted-foreground',
                        'opacity-0 group-hover:opacity-100 transition-opacity'
                      )}
                      aria-label={`Remove ${conn.url} from history`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Feature Flags */}
        <div className="pt-4 border-t border-border/30 space-y-3">
          <div className="flex items-center gap-2">
            <Flag className="w-4 h-4 text-muted-foreground" />
            <Label className="text-foreground font-medium">Feature Flags</Label>
          </div>
          <p className="text-xs text-muted-foreground">
            Toggle in-development UI features. Enabled by default in development; disable to
            replicate staging/production behavior.
          </p>
          <div className="space-y-3">
            {(Object.keys(featureFlags) as Array<keyof typeof featureFlags>).map((key) => {
              const meta = FEATURE_FLAG_LABELS[key];
              if (!meta) return null;
              return (
                <div key={key} className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm text-foreground">{meta.label}</Label>
                    <p className="text-xs text-muted-foreground">{meta.description}</p>
                  </div>
                  <Switch
                    checked={featureFlags[key]}
                    onCheckedChange={(checked) => {
                      setFeatureFlags({ [key]: checked });
                      toast.success(`${meta.label} ${checked ? 'enabled' : 'disabled'}`, {
                        description: 'Feature flag updated',
                      });
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
