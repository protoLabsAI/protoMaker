import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Label } from '@protolabs/ui/atoms';
import { Switch } from '@protolabs/ui/atoms';
import { Input } from '@protolabs/ui/atoms';
import { Button } from '@protolabs/ui/atoms';
import { Slider } from '@protolabs/ui/atoms';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@protolabs/ui/atoms';
import { Mic, Download, Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getHttpApiClient } from '@/lib/http-api-client';
import type { VoiceSettings as VoiceSettingsType, WhisperModelSize } from '@automaker/types';

const DEFAULT_VOICE: VoiceSettingsType = {
  enabled: false,
  wakeWord: 'ava',
  modelSize: 'tiny' as WhisperModelSize,
  sensitivity: 0.5,
  inputDevice: '',
};

interface ModelInfo {
  size: string;
  downloaded: boolean;
  bytes: number;
  expectedBytes: number;
}

export function VoiceSettings() {
  const [settings, setSettings] = useState<VoiceSettingsType>(DEFAULT_VOICE);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const clientRef = useRef(getHttpApiClient());

  // Load settings and model status
  useEffect(() => {
    const client = clientRef.current;
    const load = async () => {
      try {
        const [settingsRes, modelsRes] = await Promise.all([
          client.settings.getGlobal(),
          client.voice.getModels(),
        ]);
        const globalSettings = settingsRes.settings as
          | (typeof settingsRes.settings & { voice?: VoiceSettingsType })
          | undefined;
        if (globalSettings?.voice) {
          setSettings(globalSettings.voice);
        }
        setModels(modelsRes.models);
      } catch {
        // Settings endpoint may not have voice yet — use defaults
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const saveSettings = useCallback(async (updated: VoiceSettingsType) => {
    setSettings(updated);
    try {
      await clientRef.current.settings.updateGlobal({ voice: updated });
    } catch {
      // Silently fail — settings will be retried
    }
  }, []);

  // Debounced save for text inputs (wake word)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const debouncedSave = useMemo(
    () => (updated: VoiceSettingsType) => {
      setSettings(updated);
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => saveSettings(updated), 500);
    },
    [saveSettings]
  );
  useEffect(() => () => clearTimeout(debounceTimerRef.current), []);

  const handleDownload = async (size: string) => {
    setDownloading(size);
    try {
      await clientRef.current.voice.downloadModel(size);
      // Refresh model status
      const modelsRes = await clientRef.current.voice.getModels();
      setModels(modelsRes.models);
    } catch {
      // Download failed
    } finally {
      setDownloading(null);
    }
  };

  if (loading) return null;

  const currentModel = models.find((m) => m.size === settings.modelSize);
  const modelReady = currentModel?.downloaded ?? false;

  return (
    <div className="space-y-4 pt-4 border-t border-border/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Mic className="w-4 h-4 text-brand-500" />
          <Label className="text-foreground font-medium">Voice Activation</Label>
        </div>
        <Switch
          checked={settings.enabled}
          onCheckedChange={(checked) => saveSettings({ ...settings, enabled: checked })}
          disabled={!modelReady}
        />
      </div>
      {!modelReady && settings.enabled && (
        <p className="text-xs text-amber-500">Download a model below to enable voice activation.</p>
      )}

      {/* Wake Word */}
      <div className="space-y-1.5">
        <Label className="text-sm text-muted-foreground">Wake Word</Label>
        <Input
          value={settings.wakeWord}
          onChange={(e) => debouncedSave({ ...settings, wakeWord: e.target.value })}
          placeholder="ava"
          className="max-w-48"
        />
        <p className="text-xs text-muted-foreground/70">Say this word to activate command mode.</p>
      </div>

      {/* Sensitivity */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-sm text-muted-foreground">Sensitivity</Label>
          <span className="text-xs text-muted-foreground tabular-nums">
            {Math.round(settings.sensitivity * 100)}%
          </span>
        </div>
        <Slider
          value={[settings.sensitivity]}
          onValueChange={([v]) => setSettings((s) => ({ ...s, sensitivity: v }))}
          onValueCommit={([v]) => saveSettings({ ...settings, sensitivity: v })}
          min={0.1}
          max={0.95}
          step={0.05}
          className="max-w-64"
        />
        <p className="text-xs text-muted-foreground/70">
          Higher values detect speech more easily but may trigger on background noise.
        </p>
      </div>

      {/* Model Selection */}
      <div className="space-y-1.5">
        <Label className="text-sm text-muted-foreground">Whisper Model</Label>
        <div className="flex items-center gap-2">
          <Select
            value={settings.modelSize}
            onValueChange={(v) => saveSettings({ ...settings, modelSize: v as WhisperModelSize })}
          >
            <SelectTrigger className="max-w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tiny">Tiny (75 MB) — Fast</SelectItem>
              <SelectItem value="base">Base (145 MB) — Balanced</SelectItem>
              <SelectItem value="small">Small (470 MB) — Accurate</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Model Download Status */}
      <div className="space-y-2">
        <Label className="text-sm text-muted-foreground">Downloaded Models</Label>
        <div className="space-y-1.5">
          {models.map((model) => (
            <div
              key={model.size}
              className={cn(
                'flex items-center justify-between p-2 rounded-lg',
                'bg-muted/30 border border-border/30'
              )}
            >
              <div className="flex items-center gap-2">
                {model.downloaded ? (
                  <Check className="w-3.5 h-3.5 text-green-500" />
                ) : (
                  <div className="w-3.5 h-3.5 rounded-full border border-muted-foreground/30" />
                )}
                <span className="text-sm text-foreground capitalize">{model.size}</span>
                <span className="text-xs text-muted-foreground">
                  {model.downloaded
                    ? `${(model.bytes / 1_000_000).toFixed(0)} MB`
                    : `${(model.expectedBytes / 1_000_000).toFixed(0)} MB`}
                </span>
              </div>
              {!model.downloaded && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDownload(model.size)}
                  disabled={downloading !== null}
                  className="h-7 px-2 text-xs"
                >
                  {downloading === model.size ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <>
                      <Download className="w-3.5 h-3.5 mr-1" />
                      Download
                    </>
                  )}
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
