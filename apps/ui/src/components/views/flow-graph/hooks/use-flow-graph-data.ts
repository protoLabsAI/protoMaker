/**
 * useFlowGraphData — Main adapter hook
 *
 * Transforms existing hooks + board store into React Flow nodes and edges.
 * Static nodes: Ava, crew, services, integrations (fixed positions)
 * Dynamic nodes: features (from store), agents (from running agents)
 */

import { useMemo } from 'react';
import type { Node, Edge } from '@xyflow/react';
import { useAppStore } from '@/store/app-store';
import { useRunningAgents } from '@/hooks/queries/use-running-agents';
import { useCrewStatus } from '@/hooks/queries/use-crew-status';
import {
  useIntegrationStatus,
  useCapacityMetrics,
  useSystemHealth,
} from '@/hooks/queries/use-metrics';
import {
  NODE_IDS,
  STATIC_POSITIONS,
  STATIC_EDGES,
  CREW_NODE_ID_MAP,
  CREW_DISPLAY_NAMES,
  DYNAMIC_ZONE_START_Y,
  DYNAMIC_ZONE_CENTER_X,
} from '../constants';
import type {
  OrchestratorNodeData,
  CrewNodeData,
  ServiceNodeData,
  IntegrationNodeData,
  FeatureNodeData,
  AgentNodeData,
} from '../types';

export function useFlowGraphData() {
  const currentProject = useAppStore((s) => s.currentProject);
  const features = useAppStore((s) => s.features);
  const projectPath = currentProject?.path;

  const { data: runningAgentsData } = useRunningAgents();
  const { data: crewStatus } = useCrewStatus();
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

  // Auto-mode status from health data (untyped API response)
  const health = healthData as Record<string, any> | undefined;
  const autoModeRunning = health?.autoMode?.status === 'running';
  const capacity = capacityData as Record<string, any> | undefined;
  const queueDepth = (capacity?.backlog as number) ?? 0;

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

    // 2. Crew nodes (members is now an array after transform in useCrewStatus)
    const crewMembers = crewStatus?.members ?? [];
    for (const member of crewMembers) {
      const nodeId = CREW_NODE_ID_MAP[member.id];
      if (!nodeId) continue; // Skip Ava and GTM in crew nodes

      const crewData: CrewNodeData = {
        id: member.id,
        label: CREW_DISPLAY_NAMES[member.id] || member.id,
        enabled: member.enabled,
        isRunning: member.running,
        lastCheckTime: member.lastCheck?.timestamp ?? null,
        lastSeverity: member.lastCheck?.result?.severity ?? null,
      };
      result.push({
        id: nodeId,
        type: 'crew',
        position: STATIC_POSITIONS[nodeId],
        data: crewData,
        draggable: false,
      });
    }

    // Add crew nodes with defaults if not returned from API
    for (const [memberId, nodeId] of Object.entries(CREW_NODE_ID_MAP)) {
      if (result.some((n) => n.id === nodeId)) continue;
      const crewData: CrewNodeData = {
        id: memberId,
        label: CREW_DISPLAY_NAMES[memberId] || memberId,
        enabled: false,
        isRunning: false,
        lastCheckTime: null,
        lastSeverity: null,
      };
      result.push({
        id: nodeId,
        type: 'crew',
        position: STATIC_POSITIONS[nodeId],
        data: crewData,
        draggable: false,
      });
    }

    // 3. Service nodes
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
      running: false, // TODO: wire to actual lead engineer status
      queueDepth: 0,
    };
    result.push({
      id: NODE_IDS.leadEngineer,
      type: 'service',
      position: STATIC_POSITIONS[NODE_IDS.leadEngineer],
      data: leadEngData,
      draggable: false,
    });

    // 4. Integration nodes
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

    // 5. Dynamic feature nodes
    const featureSpacing = 200;
    const featureStartX =
      DYNAMIC_ZONE_CENTER_X - ((activeFeatures.length - 1) * featureSpacing) / 2;

    activeFeatures.forEach((feature, i) => {
      const featureData: FeatureNodeData = {
        featureId: feature.id,
        title: feature.title || 'Untitled',
        status: feature.status,
        branchName: feature.branchName as string | undefined,
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

    // 6. Dynamic agent nodes (below their feature)
    runningAgents.forEach((agent) => {
      const parentFeatureNode = result.find((n) => n.id === `feature-${agent.featureId}`);
      const agentData: AgentNodeData = {
        featureId: agent.featureId,
        title: agent.title || 'Agent',
        model: agent.model,
        startTime: agent.startTime || Date.now(),
        isAutoMode: agent.isAutoMode,
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
    agentCount,
    activeFeatures,
    autoModeRunning,
    queueDepth,
    crewStatus,
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

    return result;
  }, [activeFeatures, runningAgents, nodes]);

  return { nodes, edges };
}
