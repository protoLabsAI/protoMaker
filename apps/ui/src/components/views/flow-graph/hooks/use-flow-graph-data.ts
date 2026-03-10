/**
 * useFlowGraphData — Main adapter hook for the engine observability dashboard.
 *
 * Builds React Flow nodes and edges from:
 * 1. Engine service status (via /api/engine/status)
 * 2. Pipeline tracker (WebSocket events mapped to stages)
 * 3. Integration status
 * 4. Running agents & active features from app store
 */

import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import type { Node, Edge } from '@xyflow/react';
import { useAppStore } from '@/store/app-store';
import { useRunningAgents } from '@/hooks/queries/use-running-agents';
import { useIntegrationStatus, useEngineStatus } from '@/hooks/queries/use-metrics';
import { usePipelineTracker } from './use-pipeline-tracker';
import {
  NODE_IDS,
  ENGINE_SERVICES,
  INTEGRATION_POSITIONS,
  STATIC_EDGES,
  PIPELINE_STAGES,
  PIPELINE_EDGES,
  BRIDGE_EDGES,
  DYNAMIC_ZONE_START_Y,
  DYNAMIC_ZONE_CENTER_X,
  PIPELINE_PHASE_TO_SERVICE,
} from '../constants';
import { usePipelineProgress } from './use-pipeline-progress';
import type {
  EngineServiceNodeData,
  EngineServiceId,
  IntegrationNodeData,
  FeatureNodeData,
  AgentNodeData,
  PipelineStageNodeData,
  ToolExecution,
} from '../types';
import { getHttpApiClient } from '@/lib/http-api-client';
import type { EventType } from '@protolabsai/types';

/** Engine status response shape from /api/engine/status */
interface EngineStatusResponse {
  gtmEnabled?: boolean;
  signalIntake?: { active?: boolean };
  autoMode?: {
    running?: boolean;
    queueDepth?: number;
    runningAgents?: number;
    runningFeatures?: string[];
  };
  agentExecution?: {
    activeAgents?: Array<{
      featureId: string;
      model?: string;
      startTime?: number;
      costUsd?: number;
      title?: string;
    }>;
  };
  gitWorkflow?: Record<string, unknown>;
  prFeedback?: {
    trackedPRs?: number;
    remediationActive?: number;
  };
  leadEngineer?: {
    running?: boolean;
    sessions?: Array<{
      projectPath?: string;
      flowState?: string;
      actionsTaken?: number;
    }>;
  };
  projectLifecycle?: {
    totalProjects?: number;
    activeProjects?: number;
    activePRDs?: number;
  };
  contentPipeline?: {
    activeFlows: number;
    pendingDrafts: number;
    completedToday: number;
  };
  reflection?: {
    ceremonies: {
      total: number;
      lastCeremonyAt: string | null;
      counts: Record<string, number>;
    };
    reflections: {
      active: boolean;
      activeProject: string | null;
      reflectionCount: number;
      lastReflection: {
        projectTitle: string;
        completedAt: string;
      } | null;
    };
    completions: {
      completionCounts: { epics: number; milestones: number; projects: number };
      emittedMilestones: number;
      emittedProjects: number;
    };
  };
}

function getServiceStatus(
  serviceId: EngineServiceId,
  engineStatus: EngineStatusResponse | undefined
): { status: 'active' | 'idle' | 'error'; throughput: number; statusLine?: string } {
  if (!engineStatus) return { status: 'idle', throughput: 0 };

  switch (serviceId) {
    case 'signal-sources': {
      // TODO: Wire real signal counts once SignalIntakeService exposes metrics
      const isActive = engineStatus.signalIntake?.active ?? false;
      return {
        status: isActive ? 'active' : 'idle',
        throughput: 0, // TODO: Show real signal count when available
        statusLine: isActive ? 'Monitoring sources' : 'GitHub, Discord, MCP',
      };
    }
    case 'triage': {
      // TODO: Wire ops/gtm routing counts once available
      const isActive = engineStatus.signalIntake?.active ?? false;
      return {
        status: isActive ? 'active' : 'idle',
        throughput: 0, // TODO: Show signal processing rate when available
        statusLine: isActive ? 'Classifying signals' : 'Route signals: Ops vs GTM',
      };
    }
    case 'decomposition': {
      const activeProjects = engineStatus.projectLifecycle?.activeProjects ?? 0;
      return {
        status: activeProjects > 0 ? 'active' : 'idle',
        throughput: activeProjects,
        // Decomposition hierarchy: Projects → Milestones → Phases
        // On the board, milestones become epics and phases become features
        statusLine: 'Projects \u2192 Milestones \u2192 Features',
      };
    }
    case 'launch':
      return {
        status: engineStatus.autoMode?.running ? 'active' : 'idle',
        throughput: 0,
        statusLine: 'Queue features + start agents',
      };
    case 'auto-mode': {
      const am = engineStatus.autoMode;
      const running = am?.running ?? false;
      return {
        status: running ? 'active' : 'idle',
        throughput: am?.runningAgents ?? 0,
        statusLine: running
          ? `${am?.runningAgents ?? 0} agents, ${am?.queueDepth ?? 0} queued`
          : undefined,
      };
    }
    case 'agent-execution': {
      const agents = engineStatus.agentExecution?.activeAgents ?? [];
      return {
        status: agents.length > 0 ? 'active' : 'idle',
        throughput: agents.length,
        statusLine: agents.length > 0 ? `${agents.length} running` : undefined,
      };
    }
    case 'git-workflow': {
      // TODO: Wire real active workflow count once GitWorkflowService exposes metrics
      // For now, infer activity from PR feedback tracking
      const trackedPRs = engineStatus.prFeedback?.trackedPRs ?? 0;
      return {
        status: trackedPRs > 0 ? 'active' : 'idle',
        throughput: trackedPRs,
        statusLine:
          trackedPRs > 0 ? `${trackedPRs} workflows active` : 'Commit → Push → PR → Merge',
      };
    }
    case 'pr-feedback': {
      const pf = engineStatus.prFeedback;
      const tracked = pf?.trackedPRs ?? 0;
      const remediating = pf?.remediationActive ?? 0;
      return {
        status: remediating > 0 ? 'active' : tracked > 0 ? 'active' : 'idle',
        throughput: tracked,
        statusLine: tracked > 0 ? `${tracked} tracked, ${remediating} remediating` : undefined,
      };
    }
    case 'lead-engineer-rules': {
      const le = engineStatus.leadEngineer;
      const running = le?.running ?? false;
      const sessions = le?.sessions?.length ?? 0;
      return {
        status: running ? 'active' : 'idle',
        throughput: sessions,
        statusLine: running ? `${sessions} active sessions` : 'Subscribes to all events',
      };
    }
    case 'content-pipeline': {
      const contentFlows = engineStatus.contentPipeline;
      const activeFlows = contentFlows?.activeFlows ?? 0;
      const pendingDrafts = contentFlows?.pendingDrafts ?? 0;
      return {
        status: activeFlows > 0 || pendingDrafts > 0 ? 'active' : 'idle',
        throughput: activeFlows + pendingDrafts,
        statusLine:
          activeFlows > 0
            ? `${activeFlows} running, ${pendingDrafts} pending review`
            : pendingDrafts > 0
              ? `${pendingDrafts} drafts pending review`
              : 'Research \u2192 Draft \u2192 Review \u2192 Publish',
      };
    }
    case 'reflection': {
      const r = engineStatus.reflection;
      const totalCeremonies = r?.ceremonies?.total ?? 0;
      const reflectionActive = r?.reflections?.active ?? false;
      const completions = r?.completions?.completionCounts;
      const totalCompletions =
        (completions?.epics ?? 0) + (completions?.milestones ?? 0) + (completions?.projects ?? 0);
      return {
        status: reflectionActive ? 'active' : totalCeremonies > 0 ? 'active' : 'idle',
        throughput: totalCeremonies + (r?.reflections?.reflectionCount ?? 0),
        statusLine: reflectionActive
          ? `Reflecting on ${r?.reflections?.activeProject}`
          : totalCeremonies > 0
            ? `${totalCeremonies} ceremonies, ${totalCompletions} completions`
            : 'Retro \u2192 Reflection \u2192 Knowledge synthesis',
      };
    }
    default:
      return { status: 'idle', throughput: 0 };
  }
}

/**
 * Map engine service IDs to their associated LangGraph flow IDs
 */
const SERVICE_TO_GRAPH_MAP: Partial<Record<EngineServiceId, string>> = {
  'auto-mode': 'coordinator-flow',
  'agent-execution': 'content-creation',
  'pr-feedback': 'antagonistic-review',
  'signal-sources': 'research-flow',
  triage: 'review-flow',
  'content-pipeline': 'content-creation',
};

export function useFlowGraphData(
  onNodeClick?: (serviceId: EngineServiceId, graphId: string) => void
) {
  const currentProject = useAppStore((s) => s.currentProject);
  const features = useAppStore((s) => s.features);
  const projectPath = currentProject?.path;

  const { data: runningAgentsData } = useRunningAgents();
  const { data: integrationStatus } = useIntegrationStatus(projectPath);
  const { data: engineStatusData } = useEngineStatus(projectPath);
  const { stageAggregates } = usePipelineTracker({ projectPath });

  const engineStatus = engineStatusData as EngineStatusResponse | undefined;

  // Tool execution state for agent nodes
  const [toolExecutionsByFeature, setToolExecutionsByFeature] = useState<
    Map<
      string,
      { activeTool: { name: string; startedAt: string } | null; executions: ToolExecution[] }
    >
  >(new Map());

  // Debouncing: batch updates per featureId (max 1 per 500ms)
  const pendingUpdates = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const toolUpdateQueue = useRef<
    Map<
      string,
      {
        activeTool: { name: string; startedAt: string } | null;
        executions: ToolExecution[];
      }
    >
  >(new Map());

  const flushToolUpdate = useCallback((featureId: string) => {
    const queued = toolUpdateQueue.current.get(featureId);
    if (queued) {
      setToolExecutionsByFeature((prev) => {
        const next = new Map(prev);
        next.set(featureId, queued);
        return next;
      });
      toolUpdateQueue.current.delete(featureId);
    }
  }, []);

  const scheduleToolUpdate = useCallback(
    (
      featureId: string,
      update: {
        activeTool: { name: string; startedAt: string } | null;
        executions: ToolExecution[];
      }
    ) => {
      // Update the queue
      toolUpdateQueue.current.set(featureId, update);

      // Clear existing timeout
      const existingTimeout = pendingUpdates.current.get(featureId);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
      }

      // Schedule flush after 500ms
      const timeout = setTimeout(() => {
        flushToolUpdate(featureId);
        pendingUpdates.current.delete(featureId);
      }, 500);

      pendingUpdates.current.set(featureId, timeout);
    },
    [flushToolUpdate]
  );

  // WebSocket subscription for tool execution events
  useEffect(() => {
    const api = getHttpApiClient();

    const unsubscribe = api.subscribeToEvents((type: EventType, payload: unknown) => {
      if (type === 'feature:tool-use') {
        const data = payload as {
          featureId: string;
          tool: { name: string; durationMs?: number; success?: boolean };
        };

        if (!data?.featureId || !data?.tool?.name) {
          return;
        }

        const { featureId, tool } = data;
        const timestamp = Date.now();

        setToolExecutionsByFeature((prev) => {
          const current = prev.get(featureId) || { activeTool: null, executions: [] };
          const newExecutions = [...current.executions];

          // Check if this is a completion event (has durationMs)
          if (tool.durationMs !== undefined) {
            // Tool completed — add to history if not duplicate
            const isDuplicate = newExecutions.some(
              (e) => e.name === tool.name && Math.abs(e.timestamp - timestamp) < 1000
            );

            if (!isDuplicate) {
              newExecutions.push({
                name: tool.name,
                durationMs: tool.durationMs,
                success: tool.success,
                timestamp,
              });
            }

            // Clear active tool badge
            scheduleToolUpdate(featureId, {
              activeTool: null,
              executions: newExecutions,
            });
          } else {
            // Tool started — set active tool badge
            scheduleToolUpdate(featureId, {
              activeTool: { name: tool.name, startedAt: new Date().toISOString() },
              executions: newExecutions,
            });
          }

          return prev;
        });
      }
    });

    return () => {
      unsubscribe();
      // Clear all pending timeouts on unmount
      pendingUpdates.current.forEach((timeout) => clearTimeout(timeout));
      pendingUpdates.current.clear();
    };
  }, [scheduleToolUpdate]);

  // Pipeline progress overlay
  const { selected: selectedPipeline } = usePipelineProgress();
  const currentPhase = selectedPipeline?.currentPhase ?? null;
  const branch = selectedPipeline?.branch ?? null;
  const awaitingGate = selectedPipeline?.awaitingGate ?? false;
  const pipelineState = selectedPipeline?.pipelineState ?? null;

  // Determine which service node should be highlighted by the pipeline
  const highlightedServiceId = useMemo(() => {
    if (!currentPhase || !branch) return null;
    return PIPELINE_PHASE_TO_SERVICE[currentPhase]?.[branch] ?? null;
  }, [currentPhase, branch]);

  const allRunningAgents = runningAgentsData?.agents ?? [];
  const runningAgents = useMemo(
    () =>
      projectPath
        ? allRunningAgents.filter((a) => a.projectPath === projectPath)
        : allRunningAgents,
    [allRunningAgents, projectPath]
  );

  // Active features: in_progress or review
  const activeFeatures = useMemo(
    () =>
      features.filter((f) => {
        const s = f.status as string;
        return s === 'in_progress' || s === 'review';
      }),
    [features]
  );

  const gtmEnabled = engineStatus?.gtmEnabled ?? false;

  const nodes = useMemo(() => {
    const result: Node[] = [];

    // 1. Engine service nodes (filter out content-pipeline when GTM is disabled)
    const services = gtmEnabled
      ? ENGINE_SERVICES
      : ENGINE_SERVICES.filter((s) => s.serviceId !== 'content-pipeline');
    for (const svc of services) {
      const { status, throughput, statusLine } = getServiceStatus(svc.serviceId, engineStatus);
      const graphId = SERVICE_TO_GRAPH_MAP[svc.serviceId];
      const pipelineHighlight =
        highlightedServiceId === svc.serviceId
          ? awaitingGate
            ? ('gate-waiting' as const)
            : ('processing' as const)
          : undefined;
      // Resolve Langfuse trace/span for this service's pipeline phase
      let pipelineTraceId: string | undefined;
      let pipelineSpanId: string | undefined;
      if (pipelineHighlight && pipelineState) {
        pipelineTraceId = pipelineState.traceId;
        const phase = currentPhase;
        if (phase && pipelineState.phaseSpanIds?.[phase]) {
          pipelineSpanId = pipelineState.phaseSpanIds[phase];
        }
      }
      const data: EngineServiceNodeData = {
        label: svc.label,
        serviceId: svc.serviceId,
        status,
        throughput,
        statusLine,
        graphId,
        onNodeClick,
        pipelineHighlight,
        pipelineTraceId,
        pipelineSpanId,
      };
      result.push({
        id: svc.nodeId,
        type: 'engine-service',
        position: svc.position,
        data,
        draggable: false,
      });
    }

    // 2. Integration nodes
    // Server returns different field names per integration:
    //   discord: { connected, botOnline }
    //   github:  { authenticated }
    const integrations = integrationStatus as
      | {
          discord?: { connected?: boolean; botOnline?: boolean };
          github?: { authenticated?: boolean };
        }
      | undefined;

    const integrationDefs: Array<{
      id: string;
      label: string;
      type: 'github' | 'discord';
      isConnected: () => boolean;
      getStatus: () => string;
    }> = [
      {
        id: NODE_IDS.github,
        label: 'GitHub',
        type: 'github',
        isConnected: () => integrations?.github?.authenticated ?? false,
        getStatus: () => (integrations?.github?.authenticated ? 'authenticated' : 'offline'),
      },
      {
        id: NODE_IDS.discord,
        label: 'Discord',
        type: 'discord',
        isConnected: () => integrations?.discord?.connected ?? false,
        getStatus: () =>
          integrations?.discord?.connected
            ? integrations?.discord?.botOnline
              ? 'bot online'
              : 'connected'
            : 'offline',
      },
    ];

    for (const intDef of integrationDefs) {
      const intData: IntegrationNodeData = {
        label: intDef.label,
        integrationType: intDef.type,
        connected: intDef.isConnected(),
        status: intDef.getStatus(),
      };
      result.push({
        id: intDef.id,
        type: 'integration',
        position: INTEGRATION_POSITIONS[intDef.id],
        data: intData,
        draggable: false,
      });
    }

    // 3. Pipeline stage nodes (always enabled)
    for (const stage of PIPELINE_STAGES) {
      const aggregate = stageAggregates.find((a) => a.stageId === stage.stageId);
      const pipelineData: PipelineStageNodeData = {
        stageId: stage.stageId,
        label: stage.label,
        status: aggregate?.status || 'idle',
        workItems: aggregate?.workItems || [],
      };
      result.push({
        id: stage.nodeId,
        type: 'pipeline-stage',
        position: stage.position,
        data: pipelineData,
        draggable: false,
      });
    }

    // 4. Dynamic feature nodes (below pipeline)
    const featureSpacing = 200;
    const featureStartX =
      DYNAMIC_ZONE_CENTER_X - ((activeFeatures.length - 1) * featureSpacing) / 2;

    activeFeatures.forEach((feature, i) => {
      const featureData: FeatureNodeData = {
        featureId: feature.id,
        title: feature.title || 'Untitled',
        status: feature.status,
        branchName: feature.branchName as string | undefined,
        lastTraceId: feature.lastTraceId as string | undefined,
      };
      result.push({
        id: `feature-${feature.id}`,
        type: 'feature',
        position: {
          x: featureStartX + i * featureSpacing,
          y: DYNAMIC_ZONE_START_Y,
        },
        data: featureData,
        draggable: true,
      });
    });

    // 5. Dynamic agent nodes (below their feature)
    runningAgents.forEach((agent) => {
      const parentFeatureNode = result.find((n) => n.id === `feature-${agent.featureId}`);
      const toolData = toolExecutionsByFeature.get(agent.featureId);
      const agentData: AgentNodeData = {
        featureId: agent.featureId,
        title: agent.title || 'Agent',
        model: agent.model,
        startTime: agent.startTime || Date.now(),
        isAutoMode: agent.isAutoMode,
        description: agent.description,
        projectPath: agent.projectPath,
        projectName: agent.projectName,
        branchName: agent.branchName,
        costUsd: agent.costUsd,
        activeTool: toolData?.activeTool || null,
        toolExecutions: toolData?.executions || [],
      };
      result.push({
        id: `agent-${agent.featureId}`,
        type: 'agent',
        position: parentFeatureNode
          ? { x: parentFeatureNode.position.x + 10, y: parentFeatureNode.position.y + 100 }
          : { x: DYNAMIC_ZONE_CENTER_X, y: DYNAMIC_ZONE_START_Y + 100 },
        data: agentData,
        draggable: true,
      });
    });

    return result;
  }, [
    engineStatus,
    integrationStatus,
    stageAggregates,
    activeFeatures,
    runningAgents,
    highlightedServiceId,
    awaitingGate,
    pipelineState,
    gtmEnabled,
    toolExecutionsByFeature,
  ]);

  // Build edges: static service flow + pipeline + bridge + dynamic
  const edges = useMemo(() => {
    // Filter out the GTM edge when content pipeline is disabled
    const staticEdges = gtmEnabled
      ? STATIC_EDGES
      : STATIC_EDGES.filter((e) => e.id !== 'e-triage-content');
    const result: Edge[] = [...staticEdges, ...PIPELINE_EDGES, ...BRIDGE_EDGES];

    // Auto-mode -> active features (workflow edges)
    for (const feature of activeFeatures) {
      result.push({
        id: `e-auto-feature-${feature.id}`,
        source: NODE_IDS.autoMode,
        target: `feature-${feature.id}`,
        type: 'workflow',
        sourceHandle: 'bottom',
      });
    }

    // Feature -> agent edges
    for (const agent of runningAgents) {
      if (nodes.some((n) => n.id === `feature-${agent.featureId}`)) {
        result.push({
          id: `e-feature-agent-${agent.featureId}`,
          source: `feature-${agent.featureId}`,
          target: `agent-${agent.featureId}`,
          type: 'workflow',
        });
      }
    }

    return result;
  }, [activeFeatures, runningAgents, nodes, gtmEnabled]);

  return { nodes, edges, gtmEnabled };
}
