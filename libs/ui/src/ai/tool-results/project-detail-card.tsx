/**
 * ProjectDetailCard — Full project view for get_project tool results.
 *
 * Renders a detail card with:
 * - Title with status badge
 * - Goal description
 * - PRD summary (situation + approach, truncated)
 * - Milestone breakdown with phase counts and completion percentages
 */

import { Loader2, FolderKanban } from 'lucide-react';
import { cn } from '../../lib/utils.js';
import type { ToolResultRendererProps } from '../tool-result-registry.js';

interface Phase {
  number?: number;
  name?: string;
  title?: string;
  featureId?: string;
  status?: string;
  [key: string]: unknown;
}

interface Milestone {
  number?: number;
  slug?: string;
  title?: string;
  description?: string;
  status?: string;
  phases?: Phase[];
  [key: string]: unknown;
}

interface SPARCPrd {
  situation?: string;
  problem?: string;
  approach?: string;
  results?: string;
  constraints?: string;
  [key: string]: unknown;
}

interface Project {
  slug: string;
  title?: string;
  goal?: string;
  status?: string;
  milestones?: Milestone[];
  prd?: SPARCPrd;
  lead?: string;
  priority?: string;
  [key: string]: unknown;
}

/** Normalize tool output — supports both raw data and ToolResult wrapper */
function extractProject(output: unknown): Project | null {
  if (!output || typeof output !== 'object') return null;
  const o = output as Record<string, unknown>;
  // Unwrap ToolResult envelope: { success: true, data: { ... } }
  if ('success' in o && 'data' in o && typeof o.data === 'object' && o.data !== null) {
    const data = o.data as Record<string, unknown>;
    if ('slug' in data) return data as Project;
    if ('project' in data && typeof data.project === 'object' && data.project !== null) {
      return data.project as Project;
    }
  }
  // Direct project object
  if ('slug' in o) return o as Project;
  return null;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  ongoing: { label: 'Ongoing', color: 'text-blue-400', bg: 'bg-blue-400/10' },
  researching: { label: 'Researching', color: 'text-purple-500', bg: 'bg-purple-500/10' },
  drafting: { label: 'Drafting', color: 'text-amber-400', bg: 'bg-amber-400/10' },
  reviewing: { label: 'Reviewing', color: 'text-amber-500', bg: 'bg-amber-500/10' },
  approved: { label: 'Approved', color: 'text-cyan-500', bg: 'bg-cyan-500/10' },
  scaffolded: { label: 'Scaffolded', color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
  active: { label: 'Active', color: 'text-blue-500', bg: 'bg-blue-500/10' },
  completed: { label: 'Completed', color: 'text-green-500', bg: 'bg-green-500/10' },
};

const MILESTONE_STATUS_CONFIG: Record<string, { color: string; dot: string }> = {
  stub: { color: 'text-muted-foreground/60', dot: 'bg-muted-foreground/30' },
  planning: { color: 'text-purple-400', dot: 'bg-purple-400' },
  planned: { color: 'text-cyan-500', dot: 'bg-cyan-500' },
  pending: { color: 'text-muted-foreground', dot: 'bg-muted-foreground/60' },
  'in-progress': { color: 'text-blue-500', dot: 'bg-blue-500' },
  completed: { color: 'text-green-500', dot: 'bg-green-500' },
};

function getStatusConfig(status: string | undefined) {
  return (
    STATUS_CONFIG[status ?? ''] ?? {
      label: status ?? 'Unknown',
      color: 'text-muted-foreground',
      bg: 'bg-muted/60',
    }
  );
}

function getMilestoneStatusConfig(status: string | undefined) {
  return (
    MILESTONE_STATUS_CONFIG[status ?? ''] ?? {
      color: 'text-muted-foreground',
      dot: 'bg-muted-foreground/30',
    }
  );
}

/** Truncate long text for preview */
function truncate(text: string, maxLen = 160): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trimEnd() + '…';
}

function MilestoneRow({ milestone, index }: { milestone: Milestone; index: number }) {
  const phases = Array.isArray(milestone.phases) ? milestone.phases : [];
  const phaseCount = phases.length;
  // Count phases that have been scaffolded (featureId present) as a proxy for done
  const doneCount = phases.filter((p) => p.featureId).length;
  const pct = phaseCount > 0 ? Math.round((doneCount / phaseCount) * 100) : 0;
  const msCfg = getMilestoneStatusConfig(milestone.status);

  return (
    <div className="flex items-center gap-2 rounded px-2 py-1 hover:bg-muted/40">
      {/* Number */}
      <span className="w-4 shrink-0 text-center font-mono text-[10px] text-muted-foreground/60">
        {milestone.number ?? index + 1}
      </span>

      {/* Status dot */}
      <span className={cn('size-1.5 shrink-0 rounded-full', msCfg.dot)} />

      {/* Title */}
      <span className="flex-1 truncate text-foreground/80">
        {milestone.title ?? milestone.slug ?? `Milestone ${index + 1}`}
      </span>

      {/* Phase count + completion */}
      {phaseCount > 0 && (
        <span className="shrink-0 text-[10px] text-muted-foreground" title={`${pct}% complete`}>
          {phaseCount} phase{phaseCount !== 1 ? 's' : ''} · {pct}%
        </span>
      )}

      {/* Milestone status */}
      <span className={cn('shrink-0 text-[10px]', msCfg.color)}>{milestone.status ?? 'stub'}</span>
    </div>
  );
}

export function ProjectDetailCard({ output, state }: ToolResultRendererProps) {
  const isLoading =
    state === 'input-streaming' || state === 'input-available' || state === 'approval-responded';

  if (isLoading) {
    return (
      <div
        data-slot="project-detail-card"
        className="flex items-center gap-2 rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
      >
        <Loader2 className="size-3.5 animate-spin" />
        <span>Loading project…</span>
      </div>
    );
  }

  const project = extractProject(output);

  if (!project) {
    return (
      <div
        data-slot="project-detail-card"
        className="rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
      >
        Project not found
      </div>
    );
  }

  const statusCfg = getStatusConfig(project.status);
  const milestones = Array.isArray(project.milestones) ? project.milestones : [];
  const completedMilestones = milestones.filter((m) => m.status === 'completed').length;

  return (
    <div
      data-slot="project-detail-card"
      className="rounded-md border border-border/50 bg-muted/30 p-3 text-xs"
    >
      {/* Header: icon + title */}
      <div className="mb-2 flex items-start gap-2">
        <FolderKanban className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="font-medium leading-snug text-foreground/90">
            {project.title ?? project.slug}
          </p>
          {project.slug && (
            <p className="mt-0.5 font-mono text-[10px] text-muted-foreground/60">{project.slug}</p>
          )}
        </div>
      </div>

      {/* Status + priority row */}
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className={cn('rounded px-1.5 py-0.5 font-medium', statusCfg.bg, statusCfg.color)}>
          {statusCfg.label}
        </span>
        {project.priority && project.priority !== 'none' && (
          <span className="rounded bg-muted/80 px-1.5 py-0.5 capitalize text-muted-foreground">
            {project.priority}
          </span>
        )}
        {project.lead && (
          <span className="rounded bg-muted/80 px-1.5 py-0.5 text-muted-foreground">
            @{project.lead}
          </span>
        )}
        {milestones.length > 0 && (
          <span className="rounded bg-muted/80 px-1.5 py-0.5 text-muted-foreground">
            {completedMilestones}/{milestones.length} milestones
          </span>
        )}
      </div>

      {/* Goal */}
      {typeof project.goal === 'string' && project.goal.length > 0 && (
        <p className="mb-2 leading-relaxed text-foreground/70">{truncate(project.goal)}</p>
      )}

      {/* PRD summary */}
      {project.prd && (
        <div className="mb-2 rounded bg-cyan-500/5 px-2 py-1.5">
          <span className="text-[10px] font-medium uppercase tracking-wider text-cyan-600">
            PRD
          </span>
          {typeof project.prd.situation === 'string' && project.prd.situation.length > 0 && (
            <p className="mt-0.5 leading-relaxed text-foreground/70">
              {truncate(project.prd.situation, 120)}
            </p>
          )}
          {typeof project.prd.approach === 'string' && project.prd.approach.length > 0 && (
            <p className="mt-1 leading-relaxed text-foreground/60">
              <span className="font-medium text-muted-foreground">Approach: </span>
              {truncate(project.prd.approach, 120)}
            </p>
          )}
        </div>
      )}

      {/* Milestone breakdown */}
      {milestones.length > 0 && (
        <div>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Milestones
          </span>
          <div className="mt-1 max-h-40 overflow-y-auto">
            {milestones.map((milestone, i) => (
              <MilestoneRow
                key={milestone.slug ?? String(milestone.number ?? i)}
                milestone={milestone}
                index={i}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
