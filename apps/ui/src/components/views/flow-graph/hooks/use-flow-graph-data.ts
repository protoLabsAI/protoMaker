/**
 * useFlowGraphData — Main adapter hook for the engine observability dashboard.
 *
 * Builds React Flow nodes and edges from:
 * 1. Engine service status (via /api/engine/status)
 * 2. Pipeline tracker (WebSocket events mapped to stages)
 * 3. Integration status
 * 4. Running agents & active features from app store
 */

import { useMemo } from 'react';
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
} from '../constants';
import type {
  EngineServiceNodeData,
  EngineServiceId,
  IntegrationNodeData,
  FeatureNodeData,
  AgentNodeData,
  PipelineStageNodeData,
} from '../types';

/** Engine status response shape from /api/engine/status */
interface EngineStatusResponse {
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
}

function getServiceStatus(
  serviceId: EngineServiceId,
  engineStatus: EngineStatusResponse | undefined
): { status: 'active' | 'idle' | 'error'; throughput: number; statusLine?: string } {
  if (!engineStatus) return { status: 'idle', throughput: 0 };

  switch (serviceId) {
    case 'signal-sources':
      return {
        status: engineStatus.signalIntake?.active ? 'active' : 'idle',
        throughput: 0,
        statusLine: 'Linear, GitHub, Discord, MCP',
      };
    case 'triage':
      return {
        status: engineStatus.signalIntake?.active ? 'active' : 'idle',
        throughput: 0,
        statusLine: 'Ava classifies: Ops vs GTM',
      };
    case 'project-planning': {
      const activePRDs = engineStatus.projectLifecycle?.activePRDs ?? 0;
      return {
        status: activePRDs > 0 ? 'active' : 'idle',
        throughput: activePRDs,
        statusLine: 'SPARC PRD + Antagonistic Review',
      };
    }
    case 'decomposition':
      return {
        status: 'idle',
        throughput: 0,
        statusLine: 'Milestones \u2192 Epics \u2192 Features',
      };
    case 'launch':
      return {
        status: engineStatus.autoMode?.running ? 'active' : 'idle',
        throughput: 0,
        statusLine: 'Activate auto-mode + Lead Engineer',
      };
    case 'signal-intake':
      return {
        status: engineStatus.signalIntake?.active ? 'active' : 'idle',
        throughput: 0,
        statusLine: 'Classifies signals from GitHub, Linear, Discord',
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
    case 'git-workflow':
      return {
        status: 'idle',
        throughput: 0,
        statusLine: 'Commit → Push → PR → Merge',
      };
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
    case 'reflection':
      return {
        status: 'idle',
        throughput: 0,
        statusLine: 'Retro, metrics, knowledge update',
      };
    default:
      return { status: 'idle', throughput: 0 };
  }
}

/**
 * Map engine service IDs to their associated LangGraph flow IDs
 */
const SERVICE_TO_GRAPH_MAP: Partial<Record<EngineServiceId, string>> = {
  'auto-mode': 'coordinator-flow',
  'project-planning': 'project-planning',
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
  const { stageAggregates } = usePipelineTracker();

  const engineStatus = engineStatusData as EngineStatusResponse | undefined;

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

  const nodes = useMemo(() => {
    const result: Node[] = [];

    // 1. Engine service nodes
    for (const svc of ENGINE_SERVICES) {
      const { status, throughput, statusLine } = getServiceStatus(svc.serviceId, engineStatus);
      const graphId = SERVICE_TO_GRAPH_MAP[svc.serviceId];
      const data: EngineServiceNodeData = {
        label: svc.label,
        serviceId: svc.serviceId,
        status,
        throughput,
        statusLine,
        graphId,
        onNodeClick,
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
    const integrations = integrationStatus as
      | Record<string, { connected?: boolean; status?: string }>
      | undefined;
    const integrationDefs = [
      { id: NODE_IDS.github, label: 'GitHub', type: 'github' as const, key: 'github' },
      { id: NODE_IDS.linear, label: 'Linear', type: 'linear' as const, key: 'linear' },
      { id: NODE_IDS.discord, label: 'Discord', type: 'discord' as const, key: 'discord' },
    ];

    for (const intDef of integrationDefs) {
      const intStatus = integrations?.[intDef.key];
      const intData: IntegrationNodeData = {
        label: intDef.label,
        integrationType: intDef.type,
        connected: intStatus?.connected ?? false,
        status: intStatus?.status ?? 'unknown',
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
  }, [engineStatus, integrationStatus, stageAggregates, activeFeatures, runningAgents]);

  // Build edges: static service flow + pipeline + bridge + dynamic
  const edges = useMemo(() => {
    const result: Edge[] = [...STATIC_EDGES, ...PIPELINE_EDGES, ...BRIDGE_EDGES];

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
  }, [activeFeatures, runningAgents, nodes]);

  return { nodes, edges };
}
