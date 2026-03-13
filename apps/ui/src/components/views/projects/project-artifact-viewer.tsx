/**
 * ProjectArtifactViewer
 *
 * Renders ceremony reports and changelogs from a project's artifact list.
 * - Grouped by artifact type (Standup, Ceremony Report, Changelog, Escalation, Research Report)
 * - Expandable cards with Markdown content rendering
 * - Download as Markdown per artifact
 * - Type filter dropdown at top, default sort: date descending
 */

import { useState } from 'react';
import {
  FileText,
  ScrollText,
  AlertTriangle,
  Clock,
  Trophy,
  Search,
  ChevronDown,
  ChevronRight,
  Download,
} from 'lucide-react';
import {
  Card,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@protolabsai/ui/atoms';
import { Markdown } from '@protolabsai/ui/molecules';
import type { ArtifactIndexEntry, ArtifactType } from '@protolabsai/types';

// ─── Extended entry type with optional content ───────────────────────────────

export interface ArtifactEntry extends ArtifactIndexEntry {
  /** Optional markdown content for expandable view */
  content?: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const ARTIFACT_CONFIG: Record<
  ArtifactType,
  { icon: React.ComponentType<{ className?: string }>; label: string; color: string }
> = {
  standup: {
    icon: Clock,
    label: 'Standup',
    color: 'text-green-500',
  },
  'ceremony-report': {
    icon: Trophy,
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
  'research-report': {
    icon: Search,
    label: 'Research Report',
    color: 'text-cyan-500',
  },
};

const DEFAULT_ARTIFACT_CONFIG = {
  icon: FileText,
  label: 'Artifact',
  color: 'text-muted-foreground',
};

const TYPE_OPTIONS: Array<{ value: ArtifactType | 'all'; label: string }> = [
  { value: 'all', label: 'All Types' },
  { value: 'standup', label: 'Standup' },
  { value: 'ceremony-report', label: 'Ceremony Report' },
  { value: 'changelog', label: 'Changelog' },
  { value: 'escalation', label: 'Escalation' },
  { value: 'research-report', label: 'Research Report' },
];

// ─── Helper: download as markdown ────────────────────────────────────────────

function downloadMarkdown(entry: ArtifactEntry): void {
  const config = ARTIFACT_CONFIG[entry.type] ?? DEFAULT_ARTIFACT_CONFIG;
  const date = new Date(entry.timestamp).toLocaleDateString();
  const mdContent =
    entry.content ?? `# ${config.label}\n\n**Date:** ${date}\n\n**File:** \`${entry.filename}\`\n`;
  const blob = new Blob([mdContent], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${entry.type}-${entry.id}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Sub-component: Type filter dropdown ─────────────────────────────────────

function TypeFilterDropdown({
  value,
  onChange,
}: {
  value: ArtifactType | 'all';
  onChange: (v: ArtifactType | 'all') => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground shrink-0">Filter by:</span>
      <Select value={value} onValueChange={(v) => onChange(v as ArtifactType | 'all')}>
        <SelectTrigger className="h-7 text-xs w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TYPE_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value} className="text-xs">
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ─── Sub-component: Artifact card ─────────────────────────────────────────────

function ArtifactCard({ entry }: { entry: ArtifactEntry }) {
  const [expanded, setExpanded] = useState(false);
  const config = ARTIFACT_CONFIG[entry.type] ?? DEFAULT_ARTIFACT_CONFIG;
  const Icon = config.icon;
  const Chevron = expanded ? ChevronDown : ChevronRight;
  const date = new Date(entry.timestamp).toLocaleDateString();

  const markdownContent = entry.content ?? `**Date:** ${date}\n\n**File:** \`${entry.filename}\``;

  return (
    <Card className="px-3 py-2.5">
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="flex-1 flex items-center gap-2 text-left min-w-0"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          <Icon className={`w-4 h-4 flex-shrink-0 ${config.color}`} />
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider truncate">
            {config.label}
          </span>
          <span className="text-[10px] text-muted-foreground ml-auto mr-1 shrink-0">{date}</span>
          <Chevron className="w-3 h-3 text-muted-foreground flex-shrink-0" />
        </button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Download as Markdown"
          onClick={() => downloadMarkdown(entry)}
        >
          <Download className="w-3 h-3" />
        </Button>
      </div>
      {expanded && (
        <div className="mt-2 pt-2 border-t border-border">
          <Markdown className="text-xs">{markdownContent}</Markdown>
        </div>
      )}
    </Card>
  );
}

// ─── Sub-component: Type group ────────────────────────────────────────────────

function ArtifactGroup({ type, entries }: { type: ArtifactType; entries: ArtifactEntry[] }) {
  const config = ARTIFACT_CONFIG[type] ?? DEFAULT_ARTIFACT_CONFIG;
  const Icon = config.icon;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 px-1 mb-1">
        <Icon className={`w-3.5 h-3.5 ${config.color}`} />
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          {config.label}
        </span>
        <span className="text-[10px] text-muted-foreground/60 ml-auto">{entries.length}</span>
      </div>
      {entries.map((entry) => (
        <ArtifactCard key={entry.id} entry={entry} />
      ))}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export interface ProjectArtifactViewerProps {
  /** Full artifact entry list (may include optional content field) */
  artifacts: ArtifactEntry[];
  /** If provided, only show entries matching these types */
  filterTypes?: ArtifactType[];
}

export function ProjectArtifactViewer({ artifacts, filterTypes }: ProjectArtifactViewerProps) {
  const [typeFilter, setTypeFilter] = useState<ArtifactType | 'all'>('all');

  const SUPPORTED: ArtifactType[] = filterTypes ?? [
    'standup',
    'ceremony-report',
    'changelog',
    'escalation',
    'research-report',
  ];

  // Apply supported-type gate and user filter, then sort date-descending
  const filtered = artifacts.filter(
    (a) =>
      SUPPORTED.includes(a.type as ArtifactType) && (typeFilter === 'all' || a.type === typeFilter)
  );

  const sorted = [...filtered].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  // Group by type (entries within each group remain date-descending)
  const grouped = new Map<ArtifactType, ArtifactEntry[]>();
  for (const entry of sorted) {
    const type = entry.type as ArtifactType;
    if (!grouped.has(type)) grouped.set(type, []);
    grouped.get(type)!.push(entry);
  }

  return (
    <div className="space-y-4" data-testid="artifact-viewer">
      <TypeFilterDropdown value={typeFilter} onChange={setTypeFilter} />

      {sorted.length === 0 ? (
        <div className="py-8 text-center" data-testid="artifact-viewer-empty">
          <FileText className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No artifacts available.</p>
        </div>
      ) : (
        Array.from(grouped.entries()).map(([type, entries]) => (
          <ArtifactGroup key={type} type={type} entries={entries} />
        ))
      )}
    </div>
  );
}
