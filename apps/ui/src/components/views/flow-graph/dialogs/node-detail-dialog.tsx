/**
 * Node Detail Dialog — Click any flow graph node to view details.
 *
 * Switches on nodeType to render type-specific content sections.
 * All displayed text is scrubbed of PII for safe screenshots/demos.
 */

import { useState, useCallback } from 'react';
import {
  Brain,
  Server,
  GitPullRequest,
  LayoutGrid,
  HeartPulse,
  Cog,
  Plug,
  FileCode,
  Bot,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@protolabs/ui/atoms';
import { useCrewStatus } from '@/hooks/queries/use-crew-status';
import { useStopFeature } from '@/hooks/mutations';
import { AgentOutputModal } from '@/components/views/board-view/dialogs/agent-output-modal';
import {
  OrchestratorSection,
  CrewSection,
  ServiceSection,
  IntegrationSection,
  FeatureSection,
  AgentSection,
} from './node-detail-sections';
import type {
  OrchestratorNodeData,
  CrewNodeData,
  ServiceNodeData,
  IntegrationNodeData,
  FeatureNodeData,
  AgentNodeData,
} from '../types';

export interface SelectedNode {
  nodeId: string;
  nodeType: string;
  nodeData: Record<string, unknown>;
}

interface NodeDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  node: SelectedNode | null;
}

const NODE_TYPE_ICONS: Record<string, typeof Brain> = {
  orchestrator: Brain,
  crew: Server,
  service: Cog,
  integration: Plug,
  feature: FileCode,
  agent: Bot,
};

const CREW_ICONS: Record<string, typeof Server> = {
  'crew-frank': Server,
  'crew-pr-maintainer': GitPullRequest,
  'crew-board-janitor': LayoutGrid,
  'crew-system-health': HeartPulse,
};

function getNodeTitle(node: SelectedNode): string {
  const data = node.nodeData;
  if (data.label && typeof data.label === 'string') return data.label;
  if (data.title && typeof data.title === 'string') return data.title;
  return node.nodeId;
}

function getNodeSubtitle(nodeType: string): string {
  const subtitles: Record<string, string> = {
    orchestrator: 'Orchestrator',
    crew: 'Crew Member',
    service: 'Service',
    integration: 'Integration',
    feature: 'Feature',
    agent: 'Running Agent',
  };
  return subtitles[nodeType] || 'Node';
}

export function NodeDetailDialog({ open, onOpenChange, node }: NodeDetailDialogProps) {
  const { data: crewStatus } = useCrewStatus();
  const stopFeature = useStopFeature();
  const [showLogsModal, setShowLogsModal] = useState(false);

  const handleStop = useCallback(() => {
    if (!node || node.nodeType !== 'agent') return;
    const agentData = node.nodeData as AgentNodeData;
    stopFeature.mutate(
      { featureId: agentData.featureId, projectPath: agentData.projectPath },
      { onSuccess: () => onOpenChange(false) }
    );
  }, [node, stopFeature, onOpenChange]);

  if (!node) return null;

  const Icon =
    (node.nodeType === 'crew' ? CREW_ICONS[node.nodeId] : null) ||
    NODE_TYPE_ICONS[node.nodeType] ||
    Cog;
  const title = getNodeTitle(node);
  const subtitle = getNodeSubtitle(node.nodeType);

  // Find the full crew member status for crew nodes
  const crewMemberStatus =
    node.nodeType === 'crew' && crewStatus?.members
      ? crewStatus.members.find((m) => m.id === (node.nodeData as CrewNodeData).id)
      : undefined;

  const agentData = node.nodeType === 'agent' ? (node.nodeData as AgentNodeData) : null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-violet-500/15 text-violet-400">
                <Icon className="w-4 h-4" />
              </div>
              <div>
                <DialogTitle className="text-base">{title}</DialogTitle>
                <DialogDescription className="text-xs">{subtitle}</DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="mt-2">
            {node.nodeType === 'orchestrator' && (
              <OrchestratorSection data={node.nodeData as OrchestratorNodeData} />
            )}
            {node.nodeType === 'crew' && (
              <CrewSection data={node.nodeData as CrewNodeData} memberStatus={crewMemberStatus} />
            )}
            {node.nodeType === 'service' && (
              <ServiceSection data={node.nodeData as ServiceNodeData} />
            )}
            {node.nodeType === 'integration' && (
              <IntegrationSection data={node.nodeData as IntegrationNodeData} />
            )}
            {node.nodeType === 'feature' && (
              <FeatureSection data={node.nodeData as FeatureNodeData} />
            )}
            {node.nodeType === 'agent' && agentData && (
              <AgentSection
                data={agentData}
                onStop={handleStop}
                onViewLogs={() => setShowLogsModal(true)}
                isStopping={stopFeature.isPending}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Agent Output Modal — rendered outside the Dialog to avoid z-index issues */}
      {agentData && showLogsModal && (
        <AgentOutputModal
          open={true}
          onClose={() => setShowLogsModal(false)}
          projectPath={agentData.projectPath}
          featureDescription={agentData.description || agentData.title}
          featureId={agentData.featureId}
          featureStatus="running"
          branchName={agentData.branchName}
        />
      )}
    </>
  );
}
