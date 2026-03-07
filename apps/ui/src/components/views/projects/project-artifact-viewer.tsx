/**
 * ProjectArtifactViewer
 *
 * Renders ceremony reports and changelogs from a project's artifact list.
 * Uses existing atom/molecule components.
 */

import { useState } from 'react';
import { FileText, ScrollText, AlertTriangle, Mic, ChevronDown, ChevronRight } from 'lucide-react';
import { Card } from '@protolabsai/ui/atoms';
import type { ArtifactIndexEntry, ArtifactType } from '@protolabsai/types';

// ─── Config ───────────────────────────────────────────────────────────────────

const ARTIFACT_CONFIG: Record<
  ArtifactType,
  { icon: React.ComponentType<{ className?: string }>; label: string; color: string }
> = {
  'ceremony-report': {
    icon: Mic,
    label: 'Ceremony Report',
    color: 'text-purple-500',
  },
  changelog: {
    icon: ScrollText,
    label: 'Changelog',
    color: 'text-blue-500',
  },
  escalation: {
    icon: AlertTriangle,
    label: 'Escalation',
    color: 'text-amber-500',
  },
  standup: {
    icon: FileText,
    label: 'Standup',
    color: 'text-green-500',
  },
};

const DEFAULT_ARTIFACT_CONFIG = {
  icon: FileText,
  label: 'Artifact',
  color: 'text-muted-foreground',
};

// ─── Sub-component: Artifact row ───────────────────────────────────────────────

function ArtifactRow({ entry }: { entry: ArtifactIndexEntry }) {
  const [expanded, setExpanded] = useState(false);
  const config = ARTIFACT_CONFIG[entry.type] ?? DEFAULT_ARTIFACT_CONFIG;
  const Icon = config.icon;
  const Chevron = expanded ? ChevronDown : ChevronRight;

  return (
    <Card className="px-3 py-2.5">
      <button
        type="button"
        className="w-full flex items-center gap-2 text-left"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <Icon className={`w-4 h-4 flex-shrink-0 ${config.color}`} />
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {config.label}
        </span>
        <span className="text-[10px] text-muted-foreground ml-auto mr-1">
          {new Date(entry.timestamp).toLocaleDateString()}
        </span>
        <Chevron className="w-3 h-3 text-muted-foreground flex-shrink-0" />
      </button>
      {expanded && (
        <div className="mt-2 pt-2 border-t border-border">
          <p className="text-xs text-muted-foreground font-mono break-all">{entry.filename}</p>
        </div>
      )}
    </Card>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export interface ProjectArtifactViewerProps {
  /** Full artifact index entry list */
  artifacts: ArtifactIndexEntry[];
  /** If provided, only show entries matching these types */
  filterTypes?: ArtifactType[];
}

export function ProjectArtifactViewer({ artifacts, filterTypes }: ProjectArtifactViewerProps) {
  const SUPPORTED: ArtifactType[] = filterTypes ?? ['ceremony-report', 'changelog'];

  const filtered = artifacts.filter((a) => SUPPORTED.includes(a.type as ArtifactType));

  const sorted = [...filtered].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  if (sorted.length === 0) {
    return (
      <div className="py-8 text-center" data-testid="artifact-viewer-empty">
        <FileText className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">No artifacts available.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2" data-testid="artifact-viewer">
      {sorted.map((entry) => (
        <ArtifactRow key={entry.id} entry={entry} />
      ))}
    </div>
  );
}
