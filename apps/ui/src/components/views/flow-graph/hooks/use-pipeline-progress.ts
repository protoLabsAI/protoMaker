/**
 * usePipelineProgress — Tracks unified pipeline state for the active project.
 *
 * Fetches pipeline state for features with active pipelines and subscribes
 * to pipeline:* WebSocket events for real-time updates.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  PipelinePhase,
  PipelineBranch,
  PipelineState,
  PhaseTransition,
} from '@automaker/types';
import { useAppStore } from '@/store/app-store';
import { getHttpApiClient } from '@/lib/http-api-client';

export interface PipelineProgressData {
  /** Whether any feature has an active pipeline */
  active: boolean;
  /** The feature ID with the active pipeline (most recent) */
  featureId: string | null;
  /** Current pipeline state */
  pipelineState: PipelineState | null;
  /** Convenience: current phase */
  currentPhase: PipelinePhase | null;
  /** Convenience: pipeline branch */
  branch: PipelineBranch | null;
  /** Whether a gate is currently waiting for user action */
  awaitingGate: boolean;
  /** Recent pipeline events for the event log */
  recentEvents: PipelineEvent[];
  /** Resolve a gate (advance or reject) */
  resolveGate: (action: 'advance' | 'reject') => Promise<void>;
}

export interface PipelineEvent {
  type: string;
  phase: PipelinePhase;
  timestamp: string;
  detail?: string;
}

const MAX_EVENTS = 50;

export function usePipelineProgress(): PipelineProgressData {
  const currentProject = useAppStore((s) => s.currentProject);
  const features = useAppStore((s) => s.features);
  const projectPath = currentProject?.path;

  const [pipelineState, setPipelineState] = useState<PipelineState | null>(null);
  const [activeFeatureId, setActiveFeatureId] = useState<string | null>(null);
  const [recentEvents, setRecentEvents] = useState<PipelineEvent[]>([]);
  const projectPathRef = useRef(projectPath);
  projectPathRef.current = projectPath;

  // Find the most recent feature with a pipeline
  useEffect(() => {
    const pipelineFeature = features.find((f) => {
      const ps = f.pipelineState as PipelineState | undefined;
      return ps && ps.currentPhase !== 'PUBLISH';
    });
    if (pipelineFeature) {
      setActiveFeatureId(pipelineFeature.id);
      setPipelineState(pipelineFeature.pipelineState as PipelineState);
    } else {
      // Check for any feature with pipeline state (including completed ones)
      const anyPipeline = features.find((f) => f.pipelineState);
      if (anyPipeline) {
        setActiveFeatureId(anyPipeline.id);
        setPipelineState(anyPipeline.pipelineState as PipelineState);
      } else {
        setActiveFeatureId(null);
        setPipelineState(null);
      }
    }
  }, [features]);

  // Subscribe to pipeline WebSocket events
  useEffect(() => {
    const api = getHttpApiClient();
    const unsubscribe = api.subscribeToEvents((type: string, payload: any) => {
      if (!type.startsWith('pipeline:')) return;

      const phase = payload?.phase as PipelinePhase | undefined;
      const featureId = payload?.featureId as string | undefined;

      // Add to recent events
      if (phase) {
        setRecentEvents((prev) => {
          const event: PipelineEvent = {
            type,
            phase,
            timestamp: new Date().toISOString(),
            detail: payload?.reason || payload?.action,
          };
          return [event, ...prev].slice(0, MAX_EVENTS);
        });
      }

      // Update pipeline state from event payload
      if (payload?.pipelineState && featureId) {
        setPipelineState(payload.pipelineState as PipelineState);
        setActiveFeatureId(featureId);
      }
    });
    return () => unsubscribe();
  }, []);

  const resolveGate = useCallback(
    async (action: 'advance' | 'reject') => {
      if (!projectPathRef.current || !activeFeatureId) return;
      const api = getHttpApiClient();
      await api.engine.pipelineGateResolve(projectPathRef.current, activeFeatureId, action);
    },
    [activeFeatureId]
  );

  return {
    active: pipelineState !== null,
    featureId: activeFeatureId,
    pipelineState,
    currentPhase: pipelineState?.currentPhase ?? null,
    branch: pipelineState?.branch ?? null,
    awaitingGate: pipelineState?.awaitingGate ?? false,
    recentEvents,
    resolveGate,
  };
}
