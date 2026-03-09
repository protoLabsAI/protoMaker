import { useState } from 'react';
import { Badge, Card } from '@protolabsai/ui/atoms';
import { Spinner } from '@protolabsai/ui/atoms';
import {
  ChevronDown,
  ChevronRight,
  Layers,
  GitBranch,
  ExternalLink,
  Clock,
  Cpu,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProjectFeatures } from '../hooks/use-project-features';
import { getFeatureStatusVariant } from '../lib/status-variants';
import type { Feature } from '@protolabsai/types';

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function FeaturesTab({ projectSlug }: { projectSlug: string }) {
  const { data, isLoading } = useProjectFeatures(projectSlug);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="w-5 h-5" />
      </div>
    );
  }

  const features = (data?.data?.features ?? []) as Feature[];
  const epics = (data?.data?.epics ?? []) as Feature[];

  if (features.length === 0 && epics.length === 0) {
    return (
      <div className="text-center py-12">
        <Layers className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">
          No features linked to this project yet. Create features from milestones.
        </p>
      </div>
    );
  }

  const childrenByEpicId = features.reduce<Record<string, Feature[]>>((acc, f) => {
    if (f.epicId) {
      (acc[f.epicId] ??= []).push(f);
    }
    return acc;
  }, {});

  const standaloneFeatures = features.filter((f) => !f.epicId);

  return (
    <div className="space-y-4 py-4">
      {epics.length > 0 && (
        <div className="space-y-2">
          {epics.map((epic) => (
            <EpicAccordion key={epic.id} epic={epic} children={childrenByEpicId[epic.id] ?? []} />
          ))}
        </div>
      )}

      {standaloneFeatures.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Standalone ({standaloneFeatures.length})
          </h3>
          <div className="space-y-1.5">
            {standaloneFeatures.map((feature) => (
              <FeatureRow key={feature.id} feature={feature} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function EpicAccordion({ epic, children }: { epic: Feature; children: Feature[] }) {
  const [open, setOpen] = useState(true);
  const [detailOpen, setDetailOpen] = useState(false);

  const doneCount = children.filter((f) => f.status === 'done').length;
  const total = children.length;

  return (
    <Card
      className="overflow-hidden py-0 border-l-2"
      style={epic.epicColor ? { borderLeftColor: epic.epicColor } : undefined}
    >
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          className="flex items-center gap-2 flex-1 min-w-0 hover:bg-muted/20 transition-colors text-left -mx-1 px-1 rounded"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          {open ? (
            <ChevronDown className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="flex-1 text-sm font-medium text-foreground truncate">{epic.title}</span>
        </button>
        <button
          type="button"
          className="text-[10px] text-muted-foreground hover:text-foreground transition-colors shrink-0"
          onClick={() => setDetailOpen((v) => !v)}
        >
          {detailOpen ? 'hide' : 'details'}
        </button>
        {total > 0 && (
          <span className="text-[10px] text-muted-foreground shrink-0">
            {doneCount}/{total} done
          </span>
        )}
        <Badge
          variant={getFeatureStatusVariant(epic.status ?? '')}
          size="sm"
          className="uppercase tracking-wider shrink-0"
        >
          {epic.status}
        </Badge>
      </div>

      {/* Epic detail panel */}
      {detailOpen && (
        <div className="border-t border-border/20 px-3 py-2.5 space-y-2">
          {epic.description && (
            <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
              {stripMarkdownHeader(epic.description).slice(0, 300)}
              {epic.description.length > 300 ? '...' : ''}
            </p>
          )}
          <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
            {epic.branchName && (
              <span className="flex items-center gap-1">
                <GitBranch className="w-3 h-3" />
                <code className="font-mono">{epic.branchName}</code>
              </span>
            )}
            {epic.createdAt && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Created {timeAgo(epic.createdAt)}
              </span>
            )}
          </div>
        </div>
      )}

      {open && children.length > 0 && (
        <div className="border-t border-border/20 divide-y divide-border/10">
          {children.map((feature) => (
            <FeatureRow key={feature.id} feature={feature} indented />
          ))}
        </div>
      )}

      {open && children.length === 0 && (
        <div className="border-t border-border/20 px-8 py-2.5">
          <span className="text-xs text-muted-foreground">No features in this epic.</span>
        </div>
      )}
    </Card>
  );
}

function FeatureRow({ feature, indented = false }: { feature: Feature; indented?: boolean }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={cn(indented && 'pl-5')}>
      <button
        type="button"
        className={cn(
          'w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/10 transition-colors'
        )}
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? (
          <ChevronDown className="w-3 h-3 shrink-0 text-muted-foreground/50" />
        ) : (
          <ChevronRight className="w-3 h-3 shrink-0 text-muted-foreground/50" />
        )}
        <div className="flex-1 min-w-0">
          <span className="text-sm text-foreground truncate block">{feature.title}</span>
        </div>
        {feature.complexity && (
          <span className="text-[10px] text-muted-foreground shrink-0">{feature.complexity}</span>
        )}
        <Badge
          variant={getFeatureStatusVariant(feature.status ?? '')}
          size="sm"
          className="uppercase tracking-wider shrink-0"
        >
          {feature.status}
        </Badge>
      </button>

      {expanded && (
        <div className={cn('px-3 pb-3 space-y-2', indented && 'pl-8')}>
          {/* Description preview */}
          {feature.description && (
            <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
              {stripMarkdownHeader(feature.description).slice(0, 400)}
              {feature.description.length > 400 ? '...' : ''}
            </p>
          )}

          {/* Metadata row */}
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[10px] text-muted-foreground">
            {feature.branchName && (
              <span className="flex items-center gap-1">
                <GitBranch className="w-3 h-3" />
                <code className="font-mono">{feature.branchName}</code>
              </span>
            )}
            {feature.model && (
              <span className="flex items-center gap-1">
                <Cpu className="w-3 h-3" />
                {feature.model.replace('claude-', '').replace(/-\d{8}$/, '')}
              </span>
            )}
            {feature.createdAt && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {timeAgo(feature.createdAt)}
              </span>
            )}
            {feature.prUrl && feature.prNumber && (
              <a
                href={feature.prUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-primary hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="w-3 h-3" />
                PR #{feature.prNumber}
              </a>
            )}
          </div>

          {/* Assignee */}
          {feature.assignee && (
            <span className="text-[10px] text-muted-foreground">
              Assigned to {feature.assignee}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** Strip leading markdown header (# Title) from description since the title is already shown */
function stripMarkdownHeader(text: string): string {
  return text
    .replace(/^\*\*Milestone:\*\*[^\n]*\n+/, '')
    .replace(/^#[^\n]*\n+/, '')
    .trim();
}
