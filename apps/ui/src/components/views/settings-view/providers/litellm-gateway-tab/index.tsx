import { useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { Key, Globe, CheckCircle2, XCircle, Loader2, Info, RefreshCw, Network } from 'lucide-react';
import { Button } from '@protolabsai/ui/atoms';
import { Switch } from '@protolabsai/ui/atoms';
import { Label } from '@protolabsai/ui/atoms';
import { Input } from '@protolabsai/ui/atoms';
import { cn } from '@/lib/utils';
import { createLogger } from '@protolabsai/utils/logger';
import { getHttpApiClient } from '@/lib/http-api-client';
import type { LiteLLMGatewayConfig, ApiKeySource } from '@protolabsai/types';

const logger = createLogger('LiteLLMGatewayTab');

const DEFAULT_CONFIG: LiteLLMGatewayConfig = {
  enabled: false,
  baseUrl: 'http://localhost:4000',
  apiKeySource: 'inline',
  autoDiscoverModels: true,
  modelPrefix: 'litellm/',
};

interface TestResult {
  success: boolean;
  message: string;
}

type ConnectionStatus = 'idle' | 'connected' | 'error' | 'testing';

export function LiteLLMGatewayTab() {
  const [config, setConfig] = useState<LiteLLMGatewayConfig>(DEFAULT_CONFIG);
  const [showApiKey, setShowApiKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');
  const [discoveredModels, setDiscoveredModels] = useState<string[]>([]);

  // Load existing config on mount
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const api = getHttpApiClient();
        const result = await api.settings.getGlobal();
        if (result.success && result.settings?.litellmGateway) {
          setConfig(result.settings.litellmGateway);
        }
      } catch (error) {
        logger.error('Failed to load LiteLLM Gateway config:', error);
      }
    };
    loadConfig();
  }, []);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      const api = getHttpApiClient();
      const result = await api.settings.updateGlobal({ litellmGateway: config });
      if (result.success) {
        toast.success('LiteLLM Gateway settings saved');
      } else {
        toast.error(result.error || 'Failed to save settings');
      }
    } catch (error) {
      logger.error('Failed to save LiteLLM Gateway config:', error);
      toast.error('Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  }, [config]);

  const handleTestConnection = useCallback(async () => {
    if (!config.baseUrl.trim()) {
      setTestResult({ success: false, message: 'Please enter a base URL.' });
      return;
    }

    setIsTesting(true);
    setConnectionStatus('testing');
    setTestResult(null);

    try {
      const url = config.baseUrl.replace(/\/$/, '') + '/health';
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (config.apiKeySource === 'inline' && config.apiKey) {
        headers['Authorization'] = `Bearer ${config.apiKey}`;
      }

      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        setConnectionStatus('connected');
        setTestResult({ success: true, message: 'Connected successfully to LiteLLM Gateway.' });
      } else {
        setConnectionStatus('error');
        setTestResult({
          success: false,
          message: `Gateway returned status ${response.status}: ${response.statusText}`,
        });
      }
    } catch (error) {
      setConnectionStatus('error');
      setTestResult({
        success: false,
        message:
          error instanceof Error ? `Connection failed: ${error.message}` : 'Connection failed.',
      });
    } finally {
      setIsTesting(false);
    }
  }, [config]);

  const handleRefreshModels = useCallback(async () => {
    if (!config.baseUrl.trim()) {
      toast.error('Please enter a base URL first.');
      return;
    }

    setIsRefreshing(true);

    try {
      const url = config.baseUrl.replace(/\/$/, '') + '/models';
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (config.apiKeySource === 'inline' && config.apiKey) {
        headers['Authorization'] = `Bearer ${config.apiKey}`;
      }

      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(10000),
      });
      if (response.ok) {
        const data = await response.json();
        const models: string[] = (data?.data ?? [])
          .map((m: { id?: string }) => m.id ?? '')
          .filter(Boolean);
        setDiscoveredModels(models);
        toast.success(`Discovered ${models.length} model${models.length !== 1 ? 's' : ''}`);
      } else {
        toast.error(`Failed to fetch models: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to refresh models');
    } finally {
      setIsRefreshing(false);
    }
  }, [config]);

  const connectionStatusBadge = () => {
    if (connectionStatus === 'testing') {
      return (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2 className="w-3 h-3 animate-spin" />
          Testing...
        </span>
      );
    }
    if (connectionStatus === 'connected') {
      return (
        <span className="flex items-center gap-1 text-xs text-green-500">
          <CheckCircle2 className="w-3 h-3" />
          Connected
        </span>
      );
    }
    if (connectionStatus === 'error') {
      return (
        <span className="flex items-center gap-1 text-xs text-red-500">
          <XCircle className="w-3 h-3" />
          Error
        </span>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Info Banner */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
        <Info className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
        <div className="text-sm text-blue-400/90">
          <span className="font-medium">LiteLLM Gateway</span>
          <p className="text-xs text-blue-400/70 mt-1">
            Route requests through a LiteLLM proxy that aggregates multiple LLM providers behind a
            single OpenAI-compatible endpoint. Models are prefixed for easy identification.
          </p>
        </div>
      </div>

      {/* Main Config Card */}
      <div
        className={cn(
          'rounded-lg overflow-hidden',
          'border border-border/50',
          'bg-gradient-to-br from-card/90 via-card/70 to-card/80 backdrop-blur-xl',
          'shadow-sm shadow-black/5'
        )}
      >
        {/* Header with Enable Toggle */}
        <div className="p-4 border-b border-border/50 bg-gradient-to-r from-transparent via-accent/5 to-transparent">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500/20 to-blue-600/10 flex items-center justify-center border border-blue-500/20">
                <Network className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground tracking-tight">
                  LiteLLM Gateway
                </h2>
                <p className="text-xs text-muted-foreground">Enable LiteLLM proxy integration</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {connectionStatusBadge()}
              <Switch
                checked={config.enabled}
                onCheckedChange={(enabled) => setConfig((c) => ({ ...c, enabled }))}
                data-testid="litellm-gateway-enabled"
                aria-label="Enable LiteLLM Gateway"
              />
            </div>
          </div>
        </div>

        <div className="p-4 space-y-5">
          {/* Base URL */}
          <div className="space-y-2">
            <Label
              htmlFor="litellm-base-url"
              className="text-sm font-medium flex items-center gap-1.5"
            >
              <Globe className="h-3.5 w-3.5 text-muted-foreground" />
              Base URL
            </Label>
            <Input
              id="litellm-base-url"
              placeholder="http://localhost:4000"
              value={config.baseUrl}
              onChange={(e) => setConfig((c) => ({ ...c, baseUrl: e.target.value }))}
              className="font-mono text-sm"
              data-testid="litellm-base-url"
            />
            <p className="text-xs text-muted-foreground">
              The base URL for your LiteLLM Gateway instance (without trailing slash).
            </p>
          </div>

          {/* API Key Source */}
          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-1.5">
              <Key className="h-3.5 w-3.5 text-muted-foreground" />
              API Key Source
            </Label>
            <div className="flex gap-2">
              {(['inline', 'env', 'credentials'] as ApiKeySource[]).map((source) => (
                <button
                  key={source}
                  onClick={() => setConfig((c) => ({ ...c, apiKeySource: source }))}
                  data-testid={`litellm-api-key-source-${source}`}
                  className={cn(
                    'px-3 py-1.5 rounded-md text-xs font-medium border transition-colors',
                    config.apiKeySource === source
                      ? 'bg-blue-500/20 border-blue-500/40 text-blue-400'
                      : 'bg-transparent border-border/50 text-muted-foreground hover:bg-accent/20'
                  )}
                >
                  {source === 'inline' ? 'Inline' : source === 'env' ? 'Env Var' : 'Credentials'}
                </button>
              ))}
            </div>
          </div>

          {/* API Key (inline) */}
          {config.apiKeySource === 'inline' && (
            <div className="space-y-2">
              <Label htmlFor="litellm-api-key" className="text-sm font-medium">
                API Key
                <span className="ml-2 text-xs font-normal text-muted-foreground">(optional)</span>
              </Label>
              <div className="relative">
                <Input
                  id="litellm-api-key"
                  type={showApiKey ? 'text' : 'password'}
                  placeholder="sk-..."
                  value={config.apiKey ?? ''}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, apiKey: e.target.value || undefined }))
                  }
                  className="pr-20 font-mono text-sm"
                  data-testid="litellm-api-key"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1 h-7 px-2 text-xs"
                  onClick={() => setShowApiKey((v) => !v)}
                >
                  {showApiKey ? 'Hide' : 'Show'}
                </Button>
              </div>
            </div>
          )}

          {/* Env Var Name */}
          {config.apiKeySource === 'env' && (
            <div className="space-y-2">
              <Label htmlFor="litellm-env-var" className="text-sm font-medium">
                Environment Variable Name
              </Label>
              <Input
                id="litellm-env-var"
                placeholder="LITELLM_API_KEY"
                value={config.envVar ?? ''}
                onChange={(e) => setConfig((c) => ({ ...c, envVar: e.target.value || undefined }))}
                className="font-mono text-sm"
                data-testid="litellm-env-var"
              />
              <p className="text-xs text-muted-foreground">
                Name of the environment variable containing the LiteLLM API key.
              </p>
            </div>
          )}

          {/* Model Prefix */}
          <div className="space-y-2">
            <Label htmlFor="litellm-model-prefix" className="text-sm font-medium">
              Model Prefix
            </Label>
            <Input
              id="litellm-model-prefix"
              placeholder="litellm/"
              value={config.modelPrefix}
              onChange={(e) => setConfig((c) => ({ ...c, modelPrefix: e.target.value }))}
              className="font-mono text-sm"
              data-testid="litellm-model-prefix"
            />
            <p className="text-xs text-muted-foreground">
              Prefix added to model IDs for identification in model selectors.
            </p>
          </div>

          {/* Auto-Discover Toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-accent/10 border border-border/20">
            <div>
              <Label className="text-sm font-medium">Auto-Discover Models</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Automatically fetch available models from the gateway on startup.
              </p>
            </div>
            <Switch
              checked={config.autoDiscoverModels}
              onCheckedChange={(autoDiscoverModels) =>
                setConfig((c) => ({ ...c, autoDiscoverModels }))
              }
              data-testid="litellm-auto-discover"
              aria-label="Auto-discover models"
            />
          </div>

          {/* Test result */}
          {testResult && (
            <div
              className={cn(
                'flex items-center gap-2 p-3 rounded-lg text-sm',
                testResult.success
                  ? 'bg-green-500/10 text-green-600 border border-green-500/20'
                  : 'bg-red-500/10 text-red-600 border border-red-500/20'
              )}
              data-testid="litellm-test-result"
            >
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <XCircle className="w-4 h-4 shrink-0" />
              )}
              <span data-testid="litellm-test-result-message">{testResult.message}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-3 pt-1 flex-wrap">
            <Button
              onClick={handleSave}
              disabled={isSaving}
              data-testid="litellm-save"
              className={cn(
                'min-w-[120px] h-10',
                'bg-gradient-to-r from-blue-500 to-blue-600',
                'hover:from-blue-600 hover:to-blue-700',
                'text-white font-medium border-0',
                'shadow-md shadow-blue-500/20 hover:shadow-lg hover:shadow-blue-500/25',
                'transition-all duration-200 ease-out'
              )}
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Settings'
              )}
            </Button>

            <Button
              variant="outline"
              onClick={handleTestConnection}
              disabled={isTesting || !config.baseUrl.trim()}
              data-testid="litellm-test-connection"
              className="h-10"
            >
              {isTesting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Testing...
                </>
              ) : (
                'Test Connection'
              )}
            </Button>

            <Button
              variant="outline"
              onClick={handleRefreshModels}
              disabled={isRefreshing || !config.baseUrl.trim()}
              data-testid="litellm-refresh-models"
              className="h-10 gap-2"
            >
              <RefreshCw className={cn('w-4 h-4', isRefreshing && 'animate-spin')} />
              {isRefreshing ? 'Refreshing...' : 'Refresh Models'}
            </Button>
          </div>
        </div>
      </div>

      {/* Discovered Models */}
      {discoveredModels.length > 0 && (
        <div
          className={cn(
            'rounded-lg overflow-hidden',
            'border border-border/50',
            'bg-gradient-to-br from-card/90 via-card/70 to-card/80 backdrop-blur-xl',
            'shadow-sm shadow-black/5'
          )}
        >
          <div className="p-4 border-b border-border/50">
            <h2 className="text-base font-semibold text-foreground tracking-tight">
              Discovered Models
            </h2>
            <p className="text-sm text-muted-foreground/80 mt-0.5">
              {discoveredModels.length} model{discoveredModels.length !== 1 ? 's' : ''} found on the
              gateway.
            </p>
          </div>
          <div className="p-4 grid grid-cols-1 gap-2 max-h-64 overflow-y-auto">
            {discoveredModels.map((modelId) => (
              <div
                key={modelId}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent/10 border border-border/20"
              >
                <Network className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                <span className="text-xs font-mono text-foreground truncate">
                  {config.modelPrefix}
                  {modelId}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default LiteLLMGatewayTab;
