import { useCallback, useEffect, useState } from 'react';
import {
  Radio,
  RefreshCw,
  Plus,
  Copy,
  Check,
  Wifi,
  WifiOff,
  Clock,
  AlertTriangle,
  Activity,
} from 'lucide-react';
import { Button } from '@protolabs-ai/ui/atoms';
import { Spinner } from '@protolabs-ai/ui/atoms';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app-store';
import { apiFetch } from '@/lib/api-fetch';
import { getApiKey, getServerUrlSync } from '@/lib/http-api-client';
import type { SensorConfig, SensorState } from '@protolabs-ai/types';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface SensorEntry {
  sensor: SensorConfig;
  state: SensorState;
}

interface RegisterFormState {
  name: string;
  description: string;
  dataShape: string;
  ttl: string;
}

// ─── Presence state → notification channel routing (static config) ──────────

type PresenceKey = 'active' | 'idle' | 'afk' | 'headless';

const PRESENCE_ROUTING: Array<{
  state: PresenceKey;
  label: string;
  channel: string;
  description: string;
}> = [
  {
    state: 'active',
    label: 'Active',
    channel: 'In-App',
    description: 'User is at the keyboard — notifications appear in the app.',
  },
  {
    state: 'idle',
    label: 'Idle',
    channel: 'In-App',
    description: 'User has been inactive briefly — notifications still appear in the app.',
  },
  {
    state: 'afk',
    label: 'Away (AFK)',
    channel: 'Push / Discord',
    description: 'User stepped away — notifications are routed to external channels.',
  },
  {
    state: 'headless',
    label: 'Headless',
    channel: 'Push / Discord',
    description: 'No UI session active — all notifications go through external channels.',
  },
];

// ─── Helpers ────────────────────────────────────────────────────────────────────

function formatRelativeTime(isoString?: string): string {
  if (!isoString) return 'Never';
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  if (diffSecs < 60) return `${diffSecs}s ago`;
  const diffMins = Math.floor(diffSecs / 60);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
}

// ─── Sub-components ─────────────────────────────────────────────────────────────

function SensorStatusBadge({ state }: { state: SensorState }) {
  const configs: Record<SensorState, { label: string; cls: string; icon: React.ReactNode }> = {
    active: {
      label: 'Active',
      cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
      icon: <Wifi className="w-3 h-3" />,
    },
    stale: {
      label: 'Stale',
      cls: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
      icon: <AlertTriangle className="w-3 h-3" />,
    },
    offline: {
      label: 'Offline',
      cls: 'bg-red-500/15 text-red-400 border-red-500/30',
      icon: <WifiOff className="w-3 h-3" />,
    },
  };

  const cfg = configs[state] ?? configs.offline;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border',
        cfg.cls
      )}
    >
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable
    }
  };

  return (
    <Button variant="ghost" size="sm" onClick={handleCopy} className="h-7 w-7 p-0 shrink-0">
      {copied ? (
        <Check className="w-3.5 h-3.5 text-emerald-400" />
      ) : (
        <Copy className="w-3.5 h-3.5" />
      )}
    </Button>
  );
}

// ─── Main Section ────────────────────────────────────────────────────────────

export function SensorsSection() {
  const featureFlags = useAppStore((s) => s.featureFlags);

  // Only render when userPresenceDetection is enabled
  if (!featureFlags?.userPresenceDetection) {
    return null;
  }

  return <SensorsSectionInner />;
}

function SensorsSectionInner() {
  const [sensors, setSensors] = useState<SensorEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Registration form state
  const [showForm, setShowForm] = useState(false);
  const [formState, setFormState] = useState<RegisterFormState>({
    name: '',
    description: '',
    dataShape: '',
    ttl: '',
  });
  const [registering, setRegistering] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [registerSuccess, setRegisterSuccess] = useState(false);

  // API credentials
  const apiKey = getApiKey();
  const serverUrl = getServerUrlSync();
  const reportEndpoint = `${serverUrl}/api/sensors/report`;

  const fetchSensors = useCallback(async () => {
    try {
      setError(null);
      const res = await apiFetch('/api/sensors', 'GET');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSensors(data.sensors ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sensors');
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchSensors();
      setLoading(false);
    })();
  }, [fetchSensors]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchSensors();
    setRefreshing(false);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegistering(true);
    setRegisterError(null);
    setRegisterSuccess(false);

    try {
      const body: Record<string, string> = {
        name: formState.name.trim(),
      };
      if (formState.description.trim()) body.description = formState.description.trim();
      if (formState.dataShape.trim()) body.dataShapeDescription = formState.dataShape.trim();
      if (formState.ttl.trim()) body.ttl = formState.ttl.trim();

      const res = await apiFetch('/api/sensors/register', 'POST', { body });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }

      setRegisterSuccess(true);
      setFormState({ name: '', description: '', dataShape: '', ttl: '' });
      setShowForm(false);

      // Refresh sensor list
      await fetchSensors();
    } catch (err) {
      setRegisterError(err instanceof Error ? err.message : 'Failed to register sensor');
    } finally {
      setRegistering(false);
    }
  };

  return (
    <div
      className={cn(
        'rounded-lg overflow-hidden',
        'border border-border/50',
        'bg-gradient-to-br from-card/90 via-card/70 to-card/80 backdrop-blur-xl',
        'shadow-sm shadow-black/5'
      )}
    >
      {/* Header */}
      <div className="p-4 border-b border-border/50 bg-gradient-to-r from-transparent via-accent/5 to-transparent">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-violet-500/20 to-violet-600/10 flex items-center justify-center border border-violet-500/20">
              <Radio className="w-5 h-5 text-violet-400" />
            </div>
            <h2 className="text-lg font-semibold text-foreground tracking-tight">Sensors</h2>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing || loading}
            className="gap-1.5"
          >
            {refreshing ? (
              <Spinner size="sm" className="mr-1" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Refresh
          </Button>
        </div>
        <p className="text-sm text-muted-foreground/80 ml-12">
          Registered sensors, webhook registration, and presence-based notification routing.
        </p>
      </div>

      <div className="p-4 space-y-6">
        {/* ── API Credentials ─────────────────────────────────────────────── */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
            <Activity className="w-4 h-4 text-muted-foreground" />
            Report Endpoint
          </h3>
          <p className="text-xs text-muted-foreground">
            Use this URL and API key to POST sensor readings from external devices or scripts.
          </p>

          {/* Endpoint URL */}
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-md bg-accent/30 border border-border/40 font-mono text-xs text-foreground/80 overflow-x-auto">
              <span className="shrink-0 text-muted-foreground">POST</span>
              <span className="truncate">{reportEndpoint}</span>
            </div>
            <CopyButton value={reportEndpoint} />
          </div>

          {/* API Key */}
          {apiKey ? (
            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-md bg-accent/30 border border-border/40 font-mono text-xs text-foreground/80 overflow-x-auto">
                <span className="shrink-0 text-muted-foreground">X-API-Key</span>
                <span className="truncate">{apiKey}</span>
              </div>
              <CopyButton value={apiKey} />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">
              API key not available — authenticate first.
            </p>
          )}
        </div>

        {/* ── Registered Sensors ───────────────────────────────────────────── */}
        <div className="space-y-3 pt-4 border-t border-border/30">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-foreground">Registered Sensors</h3>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setShowForm((v) => !v);
                setRegisterError(null);
                setRegisterSuccess(false);
              }}
              className="gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Register Sensor
            </Button>
          </div>

          {/* Registration success banner */}
          {registerSuccess && (
            <div className="p-2 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs">
              Sensor registered successfully.
            </div>
          )}

          {/* Registration Form */}
          {showForm && (
            <form
              onSubmit={handleRegister}
              className="space-y-3 p-4 rounded-lg border border-border/40 bg-accent/10"
            >
              <h4 className="text-sm font-medium text-foreground">New External Sensor</h4>

              {registerError && (
                <div className="p-2 rounded-md bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
                  {registerError}
                </div>
              )}

              <div className="space-y-2">
                <label className="block text-xs font-medium text-muted-foreground">
                  Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formState.name}
                  onChange={(e) => setFormState((s) => ({ ...s, name: e.target.value }))}
                  placeholder="e.g. Office Desk Sensor"
                  className="w-full px-3 py-2 rounded-md border border-border/50 bg-background text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-medium text-muted-foreground">
                  Description
                </label>
                <input
                  type="text"
                  value={formState.description}
                  onChange={(e) => setFormState((s) => ({ ...s, description: e.target.value }))}
                  placeholder="e.g. PIR motion sensor on desk"
                  className="w-full px-3 py-2 rounded-md border border-border/50 bg-background text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-medium text-muted-foreground">
                  Data Shape Description
                </label>
                <input
                  type="text"
                  value={formState.dataShape}
                  onChange={(e) => setFormState((s) => ({ ...s, dataShape: e.target.value }))}
                  placeholder='e.g. { presence: "present" | "absent", confidence: 0–1 }'
                  className="w-full px-3 py-2 rounded-md border border-border/50 bg-background text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-medium text-muted-foreground">
                  TTL (seconds)
                </label>
                <input
                  type="number"
                  min="1"
                  value={formState.ttl}
                  onChange={(e) => setFormState((s) => ({ ...s, ttl: e.target.value }))}
                  placeholder="e.g. 300"
                  className="w-full px-3 py-2 rounded-md border border-border/50 bg-background text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <Button type="submit" size="sm" disabled={registering || !formState.name.trim()}>
                  {registering ? <Spinner size="sm" className="mr-1.5" /> : null}
                  Register
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowForm(false)}
                  disabled={registering}
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}

          {/* Sensor List */}
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Spinner size="lg" />
            </div>
          ) : error ? (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              {error}
            </div>
          ) : sensors.length === 0 ? (
            <div className="py-8 text-center">
              <Radio className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No sensors registered yet.</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Click "Register Sensor" to add an external webhook sensor.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {sensors.map(({ sensor, state }) => (
                <div
                  key={sensor.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-accent/20 border border-border/30"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-medium text-foreground truncate">
                        {sensor.name}
                      </span>
                      <SensorStatusBadge state={state} />
                    </div>
                    {sensor.description && (
                      <p className="text-xs text-muted-foreground truncate">{sensor.description}</p>
                    )}
                    <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground/60">
                      <Clock className="w-3 h-3" />
                      <span>Last seen: {formatRelativeTime(sensor.lastSeenAt)}</span>
                    </div>
                  </div>
                  <div className="shrink-0 ml-4">
                    <span className="text-xs text-muted-foreground/50 font-mono truncate max-w-[120px] block text-right">
                      {sensor.id}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Notification Routing Table ───────────────────────────────────── */}
        <div className="space-y-3 pt-4 border-t border-border/30">
          <div>
            <h3 className="text-sm font-medium text-foreground">Notification Routing</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Which notification channel fires for each user presence state.
            </p>
          </div>

          <div className="overflow-hidden rounded-lg border border-border/40">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-accent/20 border-b border-border/30">
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                    Presence State
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                    Channel
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground hidden sm:table-cell">
                    Notes
                  </th>
                </tr>
              </thead>
              <tbody>
                {PRESENCE_ROUTING.map(({ state, label, channel, description }, idx) => (
                  <tr
                    key={state}
                    className={cn(
                      'border-b border-border/20 last:border-0',
                      idx % 2 === 0 ? 'bg-transparent' : 'bg-accent/10'
                    )}
                  >
                    <td className="px-3 py-2">
                      <PresenceStateBadge state={state} label={label} />
                    </td>
                    <td className="px-3 py-2 text-xs font-medium text-foreground/80">{channel}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground hidden sm:table-cell">
                      {description}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function PresenceStateBadge({ state, label }: { state: PresenceKey; label: string }) {
  const clsMap: Record<PresenceKey, string> = {
    active: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    idle: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    afk: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
    headless: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border',
        clsMap[state]
      )}
    >
      {label}
    </span>
  );
}
