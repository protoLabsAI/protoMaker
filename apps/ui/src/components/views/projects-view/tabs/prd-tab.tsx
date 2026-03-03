import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import Markdown from 'react-markdown';
import type { Project } from '@protolabs-ai/types';

const SPARC_SECTIONS = [
  { key: 'situation', label: 'Situation', color: 'text-[var(--status-info)]' },
  { key: 'problem', label: 'Problem', color: 'text-[var(--status-error)]' },
  { key: 'approach', label: 'Approach', color: 'text-[var(--status-success)]' },
  { key: 'results', label: 'Results', color: 'text-[var(--status-warning)]' },
  { key: 'constraints', label: 'Constraints', color: 'text-[color:var(--primary)]' },
] as const;

function CollapsibleSection({
  label,
  color,
  content,
  defaultOpen = false,
}: {
  label: string;
  color: string;
  content: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border/20 rounded-lg overflow-hidden">
      <button
        type="button"
        className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setOpen(!open)}
      >
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        )}
        <h4 className={`text-xs font-semibold uppercase tracking-wider ${color}`}>{label}</h4>
      </button>
      {open && (
        <div className="px-3 pb-3 prose prose-sm prose-invert max-w-none prose-p:text-foreground/90 prose-headings:text-foreground prose-li:text-foreground/90 prose-strong:text-foreground">
          <Markdown>{content}</Markdown>
        </div>
      )}
    </div>
  );
}

export function PrdTab({ project }: { project: Project }) {
  if (!project.prd) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-muted-foreground">
          No PRD generated yet. Use the project lifecycle to create one.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2 py-4">
      {SPARC_SECTIONS.map(({ key, label, color }) => {
        const content = project.prd?.[key as keyof typeof project.prd];
        if (!content || typeof content !== 'string') return null;
        return (
          <CollapsibleSection
            key={key}
            label={label}
            color={color}
            content={content}
            defaultOpen={key === 'situation'}
          />
        );
      })}
    </div>
  );
}
