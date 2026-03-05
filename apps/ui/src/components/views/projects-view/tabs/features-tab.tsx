import { useState } from 'react';
import { Badge, Card } from '@protolabsai/ui/atoms';
import { Spinner } from '@protolabsai/ui/atoms';
import { ChevronDown, ChevronRight, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProjectFeatures } from '../hooks/use-project-features';
import { getFeatureStatusVariant } from '../lib/status-variants';
import type { Feature } from '@protolabsai/types';

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

  const doneCount = children.filter((f) => f.status === 'done').length;
  const total = children.length;

  return (
    <Card
      className="overflow-hidden py-0 border-l-2"
      style={epic.epicColor ? { borderLeftColor: epic.epicColor } : undefined}
    >
      <button
        type="button"
        className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-muted/20 transition-colors text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="flex-1 text-sm font-medium text-foreground truncate">{epic.title}</span>
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
      </button>

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
  return (
    <div className={cn('flex items-center gap-2 px-3 py-2', indented && 'pl-8')}>
      <div className="flex-1 min-w-0">
        <span className="text-sm text-foreground truncate block">{feature.title}</span>
        {feature.assignee && (
          <span className="text-[10px] text-muted-foreground">{feature.assignee}</span>
        )}
      </div>
      {feature.complexity && (
        <span className="text-[10px] text-muted-foreground">{feature.complexity}</span>
      )}
      <Badge
        variant={getFeatureStatusVariant(feature.status ?? '')}
        size="sm"
        className="uppercase tracking-wider"
      >
        {feature.status}
      </Badge>
    </div>
  );
}
