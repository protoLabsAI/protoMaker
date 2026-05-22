/**
 * protoCLI settings tab — the namesake provider's configuration page.
 *
 * Renders a status card backed by `GET /api/setup/proto-status` (see
 * apps/server/src/routes/setup/routes/proto-status.ts) that reports:
 *
 *   - whether the `proto` CLI binary is installed (version + resolved path)
 *   - whether gateway auth is configured (GATEWAY_API_KEY / OPENAI_API_KEY)
 *   - whether the gateway is reachable + how many models it advertises
 *
 * Surfaces the install command + a short explainer for the auth env vars.
 * Unlike Claude / Cursor / Codex, there's no per-user login step here —
 * protoCLI authenticates against the LiteLLM gateway via an org-issued env
 * var, so the UI's job is to confirm that's wired and surface the actionable
 * fix when it isn't.
 */

import { useState, useCallback, useEffect } from 'react';
import { Bot, CheckCircle2, XCircle, Loader2, RefreshCw, AlertCircle } from 'lucide-react';
import { Button } from '@protolabsai/ui/atoms';
import { Label } from '@protolabsai/ui/atoms';
import { cn } from '@/lib/utils';
import { getElectronAPI } from '@/lib/electron';
import { createLogger } from '@protolabsai/utils/logger';

const logger = createLogger('ProtoCliSettings');

interface ProtoStatus {
  installed: boolean;
  version: string | null;
  path: string | null;
  gateway: {
    hasApiKey: boolean;
    apiKeySource: 'GATEWAY_API_KEY' | 'OPENAI_API_KEY' | 'none';
    baseUrl: string;
    reachable: boolean;
    status?: number | null;
    modelCount: number | null;
    error: string | null;
  };
  installCommand: string;
  loginCommand: string;
}

export function ProtoCliSettingsTab() {
  const [status, setStatus] = useState<ProtoStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const api = getElectronAPI();
      if (!api.setup?.protoStatus) {
        throw new Error('Setup API not available — try refreshing.');
      }
      const result = await api.setup.protoStatus();
      if (!result.success) {
        throw new Error(result.error || 'Status request failed');
      }
      setStatus({
        installed: result.installed,
        version: result.version,
        path: result.path,
        gateway: result.gateway,
        installCommand: result.installCommand,
        loginCommand: result.loginCommand,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn('proto-status fetch failed', msg);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Derive an at-a-glance "everything wired" boolean so the header dot can
  // render green / yellow / red without scattering ternaries through the JSX.
  const overallOk = !!status?.installed && status.gateway.hasApiKey && status.gateway.reachable;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-brand-500/20 to-brand-600/10 border border-brand-500/20 flex items-center justify-center">
            <Bot className="w-5 h-5 text-brand-500" />
          </div>
          <div>
            <h2 className="text-xl font-semibold tracking-tight">protoCLI</h2>
            <p className="text-sm text-muted-foreground">
              The namesake SDK. Routes every agent run through the protoLabs gateway.
            </p>
          </div>
        </div>
      </header>

      <section
        className={cn(
          'rounded-lg border bg-card/60 backdrop-blur-xl shadow-sm',
          overallOk ? 'border-emerald-500/30' : 'border-amber-500/30'
        )}
      >
        <div className="p-4 border-b border-border/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'inline-block w-2 h-2 rounded-full',
                overallOk
                  ? 'bg-emerald-500 animate-pulse'
                  : status
                    ? 'bg-amber-500'
                    : 'bg-muted-foreground'
              )}
            />
            <h3 className="text-sm font-semibold">Connection Status</h3>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void refresh()}
            disabled={loading}
            className="h-7 gap-1"
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            <span className="text-xs">Refresh</span>
          </Button>
        </div>

        <div className="p-4 space-y-3">
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/30 text-sm">
              <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {status && (
            <>
              <StatusRow
                label="CLI installed"
                ok={status.installed}
                detail={
                  status.installed
                    ? `${status.version ?? 'unknown version'}${status.path ? ` — ${status.path}` : ''}`
                    : 'proto binary not found on PATH'
                }
              />
              <StatusRow
                label="Gateway auth"
                ok={status.gateway.hasApiKey}
                detail={
                  status.gateway.hasApiKey
                    ? `via $${status.gateway.apiKeySource}`
                    : 'no GATEWAY_API_KEY or OPENAI_API_KEY in environment'
                }
              />
              <StatusRow
                label="Gateway reachable"
                ok={status.gateway.reachable}
                detail={
                  status.gateway.reachable
                    ? `${status.gateway.baseUrl} — ${status.gateway.modelCount ?? '?'} models available`
                    : (status.gateway.error ?? `unreachable at ${status.gateway.baseUrl}`)
                }
              />
            </>
          )}

          {!status && !error && !loading && (
            <p className="text-sm text-muted-foreground">Loading status…</p>
          )}
        </div>
      </section>

      {status && !status.installed && (
        <section className="rounded-lg border border-border/50 bg-card/60 p-4 space-y-2">
          <Label className="text-sm font-semibold">Install protoCLI</Label>
          <p className="text-xs text-muted-foreground">
            The bundled SDK works without the standalone CLI, but installing it globally lets you
            run protoCLI in any terminal.
          </p>
          <code className="block bg-muted/50 rounded px-3 py-2 text-xs font-mono">
            {status.installCommand}
          </code>
        </section>
      )}

      {status && !status.gateway.hasApiKey && (
        <section className="rounded-lg border border-border/50 bg-card/60 p-4 space-y-2">
          <Label className="text-sm font-semibold">Wire up gateway auth</Label>
          <p className="text-xs text-muted-foreground">
            protoCLI reads its API key from the environment — either{' '}
            <code className="bg-muted/50 px-1 rounded">GATEWAY_API_KEY</code> (preferred) or{' '}
            <code className="bg-muted/50 px-1 rounded">OPENAI_API_KEY</code>. The base URL defaults
            to <code className="bg-muted/50 px-1 rounded">https://api.proto-labs.ai/v1</code> and
            can be overridden with{' '}
            <code className="bg-muted/50 px-1 rounded">GATEWAY_BASE_URL</code>.
          </p>
        </section>
      )}
    </div>
  );
}

function StatusRow({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <div className="flex items-start gap-3 text-sm">
      {ok ? (
        <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
      ) : (
        <XCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="font-medium">{label}</div>
        <div className="text-xs text-muted-foreground break-all">{detail}</div>
      </div>
    </div>
  );
}

export default ProtoCliSettingsTab;
