/**
 * ProjectListCard — Compact project list for list_projects tool results.
 *
 * Renders a scrollable list of compact project rows, each showing:
 * - Status badge with color coding
 * - Project title
 * - Milestone progress (e.g. 2/5 milestones done)
 * - Goal preview (truncated)
 */

import { Loader2, FolderKanban } from 'lucide-react';
import { cn } from '../../lib/utils.js';
import type { ToolResultRendererProps } from '../tool-result-registry.js';

interface CompactProject {
  slug: string;
  title?: string;
  status?: string;
  goal?: string;
  milestones?: Array<{ status?: string }>;
  [key: string]: unknown;
}

interface ListProjectsData {
  projects?: CompactProject[];
}

/** Normalize tool output — supports both raw data and ToolResult wrapper */
function extractData(output: unknown): ListProjectsData | null {
  if (!output || typeof output !== 'object') return null;
  const o = output as Record<string, unknown>;
  // Unwrap ToolResult envelope: { success: true, data: { projects: [...] } }
  if ('success' in o && 'data' in o && typeof o.data === 'object' && o.data !== null) {
    return o.data as ListProjectsData;
  }
  // Direct projects array
  if ('projects' in o && Array.isArray(o.projects)) return o as ListProjectsData;
  return null;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  ongoing: { label: 'Ongoing', color: 'text-blue-400', dot: 'bg-blue-400' },
  researching: { label: 'Researching', color: 'text-purple-500', dot: 'bg-purple-500' },
  drafting: { label: 'Drafting', color: 'text-amber-400', dot: 'bg-amber-400' },
  reviewing: { label: 'Reviewing', color: 'text-amber-500', dot: 'bg-amber-500' },
  approved: { label: 'Approved', color: 'text-cyan-500', dot: 'bg-cyan-500' },
  scaffolded: { label: 'Scaffolded', color: 'text-indigo-500', dot: 'bg-indigo-500' },
  active: { label: 'Active', color: 'text-blue-500', dot: 'bg-blue-500' },
  completed: { label: 'Completed', color: 'text-green-500', dot: 'bg-green-500' },
};

function getStatusConfig(status: string | undefined) {
  return (
    STATUS_CONFIG[status ?? ''] ?? {
      label: status ?? 'Unknown',
      color: 'text-muted-foreground',
      dot: 'bg-muted-foreground/30',
    }
  );
}

/** Compute milestone progress: [done, total] */
function getMilestoneProgress(
  milestones: Array<{ status?: string }> | undefined
): [number, number] {
  if (!Array.isArray(milestones) || milestones.length === 0) return [0, 0];
  const done = milestones.filter((m) => m.status === 'completed').length;
  return [done, milestones.length];
}

/** Truncate long text for preview */
function truncate(text: string, maxLen = 80): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trimEnd() + '…';
}

function ProjectRow({ project }: { project: CompactProject }) {
  const statusCfg = getStatusConfig(project.status);
  const [milestoneDone, milestoneTotal] = getMilestoneProgress(project.milestones);

  return (
    <div
      className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-muted/40"
      data-project-slug={project.slug}
    >
      {/* Status dot */}
      <span
        className={cn('size-1.5 shrink-0 rounded-full', statusCfg.dot)}
        title={statusCfg.label}
      />

      {/* Title + goal preview */}
      <div className="min-w-0 flex-1">
        <span className="truncate text-foreground/80">{project.title ?? project.slug}</span>
        {typeof project.goal === 'string' && project.goal.length > 0 && (
          <span className="ml-2 truncate text-[10px] text-muted-foreground/70">
            {truncate(project.goal)}
          </span>
        )}
      </div>

      {/* Milestone progress */}
      {milestoneTotal > 0 && (
        <span
          className="shrink-0 text-[10px] text-muted-foreground"
          title={`${milestoneDone} of ${milestoneTotal} milestones done`}
        >
          {milestoneDone}/{milestoneTotal}
        </span>
      )}

      {/* Status badge */}
      <span className={cn('shrink-0 text-[10px]', statusCfg.color)}>{statusCfg.label}</span>
    </div>
  );
}

export function ProjectListCard({ output, state }: ToolResultRendererProps) {
  const isLoading =
    state === 'input-streaming' || state === 'input-available' || state === 'approval-responded';

  if (isLoading) {
    return (
      <div
        data-slot="project-list-card"
        className="flex items-center gap-2 rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
      >
        <Loader2 className="size-3.5 animate-spin" />
        <span>Loading projects…</span>
      </div>
    );
  }

  const data = extractData(output);
  const projects = Array.isArray(data?.projects) ? data.projects : [];

  return (
    <div
      data-slot="project-list-card"
      className="rounded-md border border-border/50 bg-muted/30 text-xs"
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 border-b border-border/50 px-3 py-1.5">
        <FolderKanban className="size-3.5 text-muted-foreground" />
        <span className="font-medium text-foreground/80">Projects</span>
        <span className="ml-auto text-muted-foreground">
          {projects.length} result{projects.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Project rows */}
      {projects.length === 0 ? (
        <div className="px-3 py-2 text-muted-foreground">No projects found</div>
      ) : (
        <div className="max-h-48 overflow-y-auto p-1">
          {projects.map((project) => (
            <ProjectRow key={project.slug} project={project} />
          ))}
        </div>
      )}
    </div>
  );
}
