/**
 * Hook to load ceremony audit entries and subscribe to live ceremony:fired events.
 */

import { useEffect, useRef } from 'react';
import { useCeremonyStore } from '@/store/ceremony-store';
import { getHttpApiClient } from '@/lib/http-api-client';
import { apiGet } from '@/lib/api-fetch';
import type { CeremonyAuditEntry, EventType } from '@protolabs-ai/types';

interface CeremonyLogResponse {
  success: boolean;
  entries: CeremonyAuditEntry[];
  total: number;
}

/**
 * Load historical ceremony entries for a project.
 */
export function useLoadCeremonyEntries(projectPath: string | null) {
  const { setEntries, setLoading, setError, reset } = useCeremonyStore();
  const loadedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!projectPath) {
      reset();
      loadedRef.current = null;
      return;
    }

    // Avoid re-fetching for the same project
    if (loadedRef.current === projectPath) return;
    loadedRef.current = projectPath;

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await apiGet<CeremonyLogResponse>(
          `/api/ceremonies/log?projectPath=${encodeURIComponent(projectPath!)}&limit=100`
        );
        if (!cancelled && res.success) {
          setEntries(res.entries);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load ceremony log');
          // Reset loadedRef so a retry is possible after a failed first load
          loadedRef.current = null;
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [projectPath, setEntries, setLoading, setError, reset]);
}

/**
 * Subscribe to live ceremony:fired WebSocket events.
 */
export function useCeremonyEventStream(projectPath: string | null) {
  const addEntry = useCeremonyStore((s) => s.addEntry);

  useEffect(() => {
    if (!projectPath) return;

    const api = getHttpApiClient();
    const unsubscribe = api.subscribeToEvents((type: EventType, payload: unknown) => {
      if (type !== 'ceremony:fired') return;

      const p = payload as Record<string, unknown>;
      // Filter to current project
      if (p.projectPath && p.projectPath !== projectPath) return;

      const entry: CeremonyAuditEntry = {
        id: (p.id as string) ?? '',
        timestamp: (p.timestamp as string) ?? new Date().toISOString(),
        ceremonyType: p.ceremonyType as CeremonyAuditEntry['ceremonyType'],
        projectPath: (p.projectPath as string) ?? projectPath,
        projectSlug: p.projectSlug as string | undefined,
        milestoneSlug: p.milestoneSlug as string | undefined,
        deliveryStatus: (p.deliveryStatus as CeremonyAuditEntry['deliveryStatus']) ?? 'pending',
        payload: (p.payload as { title: string; summary?: string }) ?? { title: 'Ceremony' },
      };

      addEntry(entry);
    });

    return unsubscribe;
  }, [projectPath, addEntry]);
}
