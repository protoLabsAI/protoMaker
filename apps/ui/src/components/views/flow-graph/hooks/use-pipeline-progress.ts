/**
 * usePipelineProgress — Tracks ALL active pipeline states for the current project.
 *
 * Hydrates from the features store, then keeps each pipeline up-to-date via
 * pipeline:* WebSocket events keyed by featureId.
 *
 * Exposes a `selectedFeatureId` + setter so the UI can focus on one pipeline
 * while still showing all active pipelines in a selector.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { PipelinePhase, PipelineBranch, PipelineState } from '@automaker/types';
import { useAppStore } from '@/store/app-store';
import { getHttpApiClient } from '@/lib/http-api-client';

/** Data for a single tracked pipeline */
export interface PipelineEntry {
  featureId: string;
  featureTitle: string;
  pipelineState: PipelineState;
  currentPhase: PipelinePhase;
  branch: PipelineBranch;
  awaitingGate: boolean;
}

export interface PipelineEvent {
  type: string;
  phase: PipelinePhase;
  timestamp: string;
  detail?: string;
  featureId?: string;
}

export interface PipelineProgressData {
  /** All tracked pipelines (active first, then completed) */
  pipelines: PipelineEntry[];
  /** The currently selected pipeline (for progress bar / gate actions) */
  selected: PipelineEntry | null;
  /** ID of the currently selected pipeline feature */
  selectedFeatureId: string | null;
  /** Switch the focused pipeline */
  setSelectedFeatureId: (id: string | null) => void;
  /** Recent pipeline events (all pipelines) */
  recentEvents: PipelineEvent[];
  /** Resolve a gate on the currently selected pipeline */
  resolveGate: (action: 'advance' | 'reject') => Promise<void>;
}

const MAX_EVENTS = 50;

export function usePipelineProgress(): PipelineProgressData {
  const currentProject = useAppStore((s) => s.currentProject);
  const features = useAppStore((s) => s.features);
  const projectPath = currentProject?.path;

  // Map of featureId → { pipelineState, featureTitle }
  const [pipelineMap, setPipelineMap] = useState<
    Map<string, { pipelineState: PipelineState; featureTitle: string }>
  >(new Map());
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null);
  const [recentEvents, setRecentEvents] = useState<PipelineEvent[]>([]);
  const projectPathRef = useRef(projectPath);
  projectPathRef.current = projectPath;

  // Hydrate from features store — collect ALL features with pipeline state
  useEffect(() => {
    const newMap = new Map<string, { pipelineState: PipelineState; featureTitle: string }>();
    for (const f of features) {
      if (f.pipelineState) {
        newMap.set(f.id, {
          pipelineState: f.pipelineState as PipelineState,
          featureTitle: f.title || f.id.slice(0, 8),
        });
      }
    }
    setPipelineMap(newMap);

    // Auto-select: prefer first active (non-PUBLISH) pipeline, fall back to any
    setSelectedFeatureId((prev) => {
      if (prev && newMap.has(prev)) return prev;
      for (const [id, { pipelineState }] of newMap) {
        if (pipelineState.currentPhase !== 'PUBLISH') return id;
      }
      const firstKey = newMap.keys().next().value;
      return firstKey ?? null;
    });
  }, [features]);

  // Subscribe to pipeline WebSocket events — upsert by featureId
  useEffect(() => {
    const api = getHttpApiClient();
    const unsubscribe = api.subscribeToEvents((type: string, payload: any) => {
      if (!type.startsWith('pipeline:')) return;

      const phase = payload?.phase as PipelinePhase | undefined;
      const featureId = payload?.featureId as string | undefined;

      // Add to recent events with featureId
      if (phase) {
        setRecentEvents((prev) => {
          const event: PipelineEvent = {
            type,
            phase,
            timestamp: new Date().toISOString(),
            detail: payload?.reason || payload?.action,
            featureId,
          };
          return [event, ...prev].slice(0, MAX_EVENTS);
        });
      }

      // Upsert pipeline state by featureId
      if (payload?.pipelineState && featureId) {
        setPipelineMap((prev) => {
          const next = new Map(prev);
          const existing = prev.get(featureId);
          next.set(featureId, {
            pipelineState: payload.pipelineState as PipelineState,
            featureTitle: existing?.featureTitle || featureId.slice(0, 8),
          });
          return next;
        });

        // Auto-select if nothing is selected
        setSelectedFeatureId((prev) => prev ?? featureId);
      }
    });
    return () => unsubscribe();
  }, []);

  // Build pipelines array — active (non-PUBLISH) first, then completed
  const pipelines = useMemo<PipelineEntry[]>(() => {
    const active: PipelineEntry[] = [];
    const completed: PipelineEntry[] = [];
    for (const [featureId, { pipelineState, featureTitle }] of pipelineMap) {
      const entry: PipelineEntry = {
        featureId,
        featureTitle,
        pipelineState,
        currentPhase: pipelineState.currentPhase,
        branch: pipelineState.branch,
        awaitingGate: pipelineState.awaitingGate ?? false,
      };
      if (pipelineState.currentPhase === 'PUBLISH') {
        completed.push(entry);
      } else {
        active.push(entry);
      }
    }
    return [...active, ...completed];
  }, [pipelineMap]);

  const selected = useMemo(
    () => pipelines.find((p) => p.featureId === selectedFeatureId) ?? pipelines[0] ?? null,
    [pipelines, selectedFeatureId]
  );

  const resolveGate = useCallback(
    async (action: 'advance' | 'reject') => {
      const fid = selected?.featureId;
      if (!projectPathRef.current || !fid) return;
      const api = getHttpApiClient();
      await api.engine.pipelineGateResolve(projectPathRef.current, fid, action);
    },
    [selected?.featureId]
  );

  return {
    pipelines,
    selected,
    selectedFeatureId: selected?.featureId ?? null,
    setSelectedFeatureId,
    recentEvents,
    resolveGate,
  };
}
