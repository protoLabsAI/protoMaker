/**
 * useSignalChannels
 *
 * Manages the list of Discord signal source channels for a project.
 * Fetches current channel configs from GET /api/integrations/signal-channels
 * and saves updates via PUT /api/integrations/signal-channels.
 */

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api-fetch';
import type { DiscordChannelSignalConfig } from '@protolabs-ai/types';

export interface UseSignalChannelsReturn {
  channels: DiscordChannelSignalConfig[];
  loading: boolean;
  saving: boolean;
  error: string | null;
  setChannels: (channels: DiscordChannelSignalConfig[]) => void;
  save: () => Promise<boolean>;
  refresh: () => void;
}

export function useSignalChannels(projectPath: string | null | undefined): UseSignalChannelsReturn {
  const [channels, setChannels] = useState<DiscordChannelSignalConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshCounter, setRefreshCounter] = useState(0);

  useEffect(() => {
    if (!projectPath) return;

    setLoading(true);
    setError(null);

    (async () => {
      try {
        const res = await apiFetch(
          `/api/integrations/signal-channels?projectPath=${encodeURIComponent(projectPath)}`,
          'GET'
        );
        if (!res.ok) throw new Error(`Failed to load signal channels: ${res.status}`);
        const data = await res.json();
        setChannels(data.channels ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load signal channels');
      } finally {
        setLoading(false);
      }
    })();
  }, [projectPath, refreshCounter]);

  const save = useCallback(async (): Promise<boolean> => {
    if (!projectPath) return false;

    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch('/api/integrations/signal-channels', 'PUT', {
        body: { projectPath, channels },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Save failed: ${res.status}`);
      }
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save signal channels');
      return false;
    } finally {
      setSaving(false);
    }
  }, [projectPath, channels]);

  const refresh = useCallback(() => {
    setRefreshCounter((c) => c + 1);
  }, []);

  return { channels, loading, saving, error, setChannels, save, refresh };
}
