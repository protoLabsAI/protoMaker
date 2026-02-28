import { useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { Key, CheckCircle2, XCircle, Loader2, ExternalLink, Info } from 'lucide-react';
import { Button } from '@protolabs-ai/ui/atoms';
import { Switch } from '@protolabs-ai/ui/atoms';
import { Label } from '@protolabs-ai/ui/atoms';
import { Input } from '@protolabs-ai/ui/atoms';
import { cn } from '@/lib/utils';
import { getElectronAPI } from '@/lib/electron';
import { createLogger } from '@protolabs-ai/utils/logger';
import { ProviderToggle } from '../provider-toggle';

const logger = createLogger('GroqSettings');

/** Groq model definitions with display metadata */
const GROQ_MODEL_DEFINITIONS = [
  {
    id: 'groq-llama-3.3-70b-versatile',
    label: 'Llama 3.3 70B Versatile',
    description: "Meta's most capable Llama 3.3 model, great for complex reasoning.",
    badge: 'Balanced',
  },
  {
    id: 'groq-llama-3.1-8b-instant',
    label: 'Llama 3.1 8B Instant',
    description: 'Ultra-fast 8B model, ideal for low-latency tasks.',
    badge: 'Speed',
  },
  {
    id: 'groq-mixtral-8x7b-32768',
    label: 'Mixtral 8x7B',
    description: "Mistral's mixture-of-experts model with 32k context window.",
    badge: 'Balanced',
  },
  {
    id: 'groq-gemma2-9b-it',
    label: 'Gemma 2 9B IT',
    description: "Google's Gemma 2 instruction-tuned model.",
    badge: 'Speed',
  },
] as const;

type GroqModelId = (typeof GROQ_MODEL_DEFINITIONS)[number]['id'];

interface TestResult {
  success: boolean;
  message: string;
}

export function GroqSettingsTab() {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [enabledModels, setEnabledModels] = useState<Set<GroqModelId>>(
    new Set(GROQ_MODEL_DEFINITIONS.map((m) => m.id))
  );
  const [hasStoredKey, setHasStoredKey] = useState(false);

  // Load existing credentials on mount
  useEffect(() => {
    const loadCredentials = async () => {
      try {
        const api = getElectronAPI();
        if (api?.settings?.getCredentials) {
          const result = await api.settings.getCredentials();
          if (result.success && result.credentials) {
            // Check if groq key is configured (it comes back masked)
            const groqCred = (
              result.credentials as Record<string, { configured: boolean; masked: string }>
            )['groq'];
            if (groqCred?.configured) {
              setHasStoredKey(true);
              setApiKey(groqCred.masked || '');
            }
          }
        }
      } catch (error) {
        logger.error('Failed to load Groq credentials:', error);
      }
    };
    loadCredentials();
  }, []);

  const handleSaveApiKey = useCallback(async () => {
    if (!apiKey.trim()) {
      toast.error('Please enter an API key');
      return;
    }

    setIsSaving(true);
    try {
      const api = getElectronAPI();
      if (api?.settings?.updateCredentials) {
        const result = await api.settings.updateCredentials({
          apiKeys: { groq: apiKey.trim() } as Record<string, string>,
        });
        if (result.success) {
          setHasStoredKey(true);
          toast.success('Groq API key saved');
        } else {
          toast.error(result.error || 'Failed to save API key');
        }
      } else {
        // Fallback: store via global settings
        await api.settings.updateGlobal({ groqApiKey: apiKey.trim() });
        setHasStoredKey(true);
        toast.success('Groq API key saved');
      }
    } catch (error) {
      logger.error('Failed to save Groq API key:', error);
      toast.error('Failed to save API key');
    } finally {
      setIsSaving(false);
    }
  }, [apiKey]);

  const handleTestConnection = useCallback(async () => {
    if (!apiKey.trim()) {
      setTestResult({ success: false, message: 'Please enter an API key to test.' });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const api = getElectronAPI();
      // Call the Groq status/test endpoint if available
      if (api?.setup?.testGroqConnection) {
        const result = await api.setup.testGroqConnection(apiKey.trim());
        if (result.success) {
          setTestResult({ success: true, message: 'Connection successful! Groq API responded.' });
        } else {
          setTestResult({
            success: false,
            message: result.error || 'Failed to connect to Groq API.',
          });
        }
      } else {
        // Fallback: validate key format (Groq keys start with 'gsk_')
        if (apiKey.trim().startsWith('gsk_') && apiKey.trim().length > 20) {
          setTestResult({
            success: true,
            message: 'API key format looks valid. Save to confirm.',
          });
        } else {
          setTestResult({
            success: false,
            message: 'Invalid key format. Groq API keys start with "gsk_".',
          });
        }
      }
    } catch {
      setTestResult({ success: false, message: 'Network error. Please check your connection.' });
    } finally {
      setIsTesting(false);
    }
  }, [apiKey]);

  const handleModelToggle = useCallback((modelId: GroqModelId, enabled: boolean) => {
    setEnabledModels((prev) => {
      const next = new Set(prev);
      if (enabled) {
        next.add(modelId);
      } else {
        next.delete(modelId);
      }
      return next;
    });
  }, []);

  return (
    <div className="space-y-6">
      {/* Provider Visibility Toggle */}
      <ProviderToggle provider="groq" providerLabel="Groq" />

      {/* Info Banner */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-orange-500/10 border border-orange-500/20">
        <Info className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" />
        <div className="text-sm text-orange-400/90">
          <span className="font-medium">Fast LLM Inference</span>
          <p className="text-xs text-orange-400/70 mt-1">
            Groq provides ultra-fast inference for open-source models like Llama and Mixtral. Get a
            free API key at{' '}
            <a
              href="https://console.groq.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-orange-300 inline-flex items-center gap-1"
            >
              console.groq.com
              <ExternalLink className="w-3 h-3" />
            </a>
            .
          </p>
        </div>
      </div>

      {/* API Key Section */}
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
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-orange-500/20 to-orange-600/10 flex items-center justify-center border border-orange-500/20">
              <Key className="w-5 h-5 text-orange-500" />
            </div>
            <h2 className="text-lg font-semibold text-foreground tracking-tight">API Key</h2>
          </div>
          <p className="text-sm text-muted-foreground/80 ml-12">
            Your Groq API key is stored locally and used for model inference.
          </p>
        </div>

        <div className="p-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="groq-api-key" className="text-sm font-medium">
              Groq API Key
              {hasStoredKey && (
                <span className="ml-2 text-xs text-green-500 font-normal">(key saved)</span>
              )}
            </Label>
            <div className="relative">
              <Input
                id="groq-api-key"
                type={showKey ? 'text' : 'password'}
                placeholder="gsk_..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="pr-24 font-mono text-sm"
                data-testid="groq-api-key-input"
              />
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1 h-7 px-2 text-xs"
                onClick={() => setShowKey((v) => !v)}
                data-testid="toggle-groq-visibility"
              >
                {showKey ? 'Hide' : 'Show'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Get your free API key at{' '}
              <a
                href="https://console.groq.com/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                console.groq.com/keys
              </a>
              .
            </p>
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
              data-testid="groq-test-connection-result"
            >
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <XCircle className="w-4 h-4 shrink-0" />
              )}
              <span data-testid="groq-test-connection-message">{testResult.message}</span>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-3 pt-2">
            <Button
              onClick={handleSaveApiKey}
              disabled={isSaving || !apiKey.trim()}
              data-testid="save-groq-api-key"
              className={cn(
                'min-w-[120px] h-10',
                'bg-gradient-to-r from-orange-500 to-orange-600',
                'hover:from-orange-600 hover:to-orange-600',
                'text-white font-medium border-0',
                'shadow-md shadow-orange-500/20 hover:shadow-lg hover:shadow-orange-500/25',
                'transition-all duration-200 ease-out',
                'hover:scale-[1.02] active:scale-[0.98]'
              )}
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Key'
              )}
            </Button>

            <Button
              variant="outline"
              onClick={handleTestConnection}
              disabled={isTesting || !apiKey.trim()}
              data-testid="test-groq-connection"
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
          </div>
        </div>
      </div>

      {/* Models Section */}
      <div
        className={cn(
          'rounded-lg overflow-hidden',
          'border border-border/50',
          'bg-gradient-to-br from-card/90 via-card/70 to-card/80 backdrop-blur-xl',
          'shadow-sm shadow-black/5'
        )}
      >
        <div className="p-4 border-b border-border/50">
          <h2 className="text-lg font-semibold text-foreground tracking-tight">Available Models</h2>
          <p className="text-sm text-muted-foreground/80 mt-1">
            Enable or disable Groq models for use in model selectors.
          </p>
        </div>

        <div className="p-4 space-y-3">
          {GROQ_MODEL_DEFINITIONS.map((model) => {
            const isEnabled = enabledModels.has(model.id);
            return (
              <div
                key={model.id}
                className="flex items-center justify-between p-3 rounded-lg bg-accent/10 border border-border/20 hover:bg-accent/20 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground truncate">
                      {model.label}
                    </span>
                    {model.badge && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-500 font-medium shrink-0">
                        {model.badge}
                      </span>
                    )}
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium shrink-0">
                      Groq
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {model.description}
                  </p>
                  <p className="text-[10px] font-mono text-muted-foreground/60 mt-0.5">
                    {model.id.replace('groq-', '')}
                  </p>
                </div>
                <Switch
                  checked={isEnabled}
                  onCheckedChange={(checked) => handleModelToggle(model.id, checked)}
                  className="ml-4 shrink-0"
                />
              </div>
            );
          })}
        </div>

        {/* Note about free tier */}
        <div className="px-4 pb-4">
          <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
            <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              Groq offers a generous free tier with rate limits. Upgrade at{' '}
              <a
                href="https://console.groq.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:underline"
              >
                console.groq.com
              </a>{' '}
              for higher throughput.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default GroqSettingsTab;
