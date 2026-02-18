/**
 * useFlowGraphData — Main adapter hook
 *
 * Transforms existing hooks + board store into React Flow nodes and edges.
 * Static nodes: Ava, services, integrations (fixed positions)
 * Dynamic nodes: features (from store), agents (from running agents)
 */

import { useMemo } from 'react';
import type { Node, Edge } from '@xyflow/react';
import { useAppStore } from '@/store/app-store';
import { useRunningAgents } from '@/hooks/queries/use-running-agents';
import {
  useIntegrationStatus,
  useCapacityMetrics,
  useSystemHealth,
} from '@/hooks/queries/use-metrics';
import {
  NODE_IDS,
  STATIC_POSITIONS,
  STATIC_EDGES,
  DYNAMIC_ZONE_START_Y,
  DYNAMIC_ZONE_CENTER_X,
  PIPELINE_STAGES,
  PIPELINE_EDGES,
} from '../constants';
import type {
  OrchestratorNodeData,
  ServiceNodeData,
  IntegrationNodeData,
  FeatureNodeData,
  AgentNodeData,
  PipelineStageNodeData,
} from '../types';
import type { StageAggregate } from './use-pipeline-tracker';

export interface UseFlowGraphDataOptions {
  pipelineEnabled?: boolean;
  stageAggregates?: StageAggregate[];
}

export function useFlowGraphData(options: UseFlowGraphDataOptions = {}) {
  const { pipelineEnabled = false, stageAggregates = [] } = options;
  const currentProject = useAppStore((s) => s.currentProject);
  const features = useAppStore((s) => s.features);
  const projectPath = currentProject?.path;

  const { data: runningAgentsData } = useRunningAgents();
  const { data: integrationStatus } = useIntegrationStatus(projectPath);
  const { data: capacityData } = useCapacityMetrics(projectPath);
  const { data: healthData } = useSystemHealth(projectPath);

  const allRunningAgents = runningAgentsData?.agents ?? [];
  // Filter to current project to avoid node ID collisions across projects
  const runningAgents = useMemo(
    () =>
      projectPath
        ? allRunningAgents.filter((a) => a.projectPath === projectPath)
        : allRunningAgents,
    [allRunningAgents, projectPath]
  );
  const agentCount = runningAgents.length;

  // Active features: in_progress or waiting_approval (review)
  const activeFeatures = useMemo(
    () => features.filter((f) => f.status === 'in_progress' || f.status === 'waiting_approval'),
    [features]
  );

  // Typed health dashboard response fields
  const health = healthData as
    | {
        autoMode?: { isRunning?: boolean; runningCount?: number };
        leadEngineer?: { running?: boolean; sessionCount?: number };
      }
    | undefined;
  const autoModeRunning = health?.autoMode?.isRunning === true;
  const leadEngineerRunning = health?.leadEngineer?.running === true;
  const capacity = capacityData as { backlogSize?: number; maxConcurrency?: number } | undefined;
  const queueDepth = capacity?.backlogSize ?? 0;

  const nodes = useMemo(() => {
    const result: Node[] = [];

    // 1. Orchestrator (Ava)
    const avaData: OrchestratorNodeData = {
      label: 'Ava',
      status: agentCount > 0 ? 'active' : 'idle',
      agentCount,
      featureCount: activeFeatures.length,
      autoModeRunning,
    };
    result.push({
      id: NODE_IDS.ava,
      type: 'orchestrator',
      position: STATIC_POSITIONS[NODE_IDS.ava],
      data: avaData,
      draggable: false,
    });

    // 2. Service nodes
    const autoModeData: ServiceNodeData = {
      label: 'Auto-Mode',
      serviceType: 'auto-mode',
      running: autoModeRunning,
      queueDepth,
    };
    result.push({
      id: NODE_IDS.autoMode,
      type: 'service',
      position: STATIC_POSITIONS[NODE_IDS.autoMode],
      data: autoModeData,
      draggable: false,
    });

    const leadEngData: ServiceNodeData = {
      label: 'Lead Engineer',
      serviceType: 'lead-engineer',
      running: leadEngineerRunning,
      queueDepth: 0,
    };
    result.push({
      id: NODE_IDS.leadEngineer,
      type: 'service',
      position: STATIC_POSITIONS[NODE_IDS.leadEngineer],
      data: leadEngData,
      draggable: false,
    });

    // 3. Integration nodes
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
        position: STATIC_POSITIONS[intDef.id],
        data: intData,
        draggable: false,
      });
    }

    // 4. Dynamic feature nodes
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

    // 6. Pipeline stage nodes (if enabled)
    if (pipelineEnabled) {
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
    }

    return result;
  }, [
    agentCount,
    activeFeatures,
    autoModeRunning,
    leadEngineerRunning,
    queueDepth,
    integrationStatus,
    runningAgents,
  ]);

  // Build edges: static + dynamic
  const edges = useMemo(() => {
    const result: Edge[] = [...STATIC_EDGES];

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

    // Pipeline edges (if enabled)
    if (pipelineEnabled) {
      result.push(...PIPELINE_EDGES);

      // Bridge edge: auto-mode service -> in_progress stage
      result.push({
        id: 'e-bridge-auto-pipeline',
        source: NODE_IDS.autoMode,
        target: NODE_IDS.pipelineInProgress,
        type: 'workflow',
        animated: true,
      });
    }

    return result;
  }, [activeFeatures, runningAgents, nodes, pipelineEnabled]);

  return { nodes, edges };
}
