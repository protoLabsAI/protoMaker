import { Badge, Card } from '@protolabs-ai/ui/atoms';
import { Spinner } from '@protolabs-ai/ui/atoms';
import { Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProjectFeatures } from '../hooks/use-project-features';
import { getFeatureStatusVariant } from '../lib/status-variants';
import type { Feature } from '@protolabs-ai/types';

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

  return (
    <div className="space-y-4 py-4">
      {/* Epics */}
      {epics.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Epics ({epics.length})
          </h3>
          <div className="space-y-2">
            {epics.map((epic) => (
              <FeatureCard key={epic.id} feature={epic} isEpic />
            ))}
          </div>
        </div>
      )}

      {/* Features */}
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Features ({features.length})
        </h3>
        <div className="space-y-1.5">
          {features.map((feature) => (
            <FeatureCard key={feature.id} feature={feature} />
          ))}
        </div>
      </div>
    </div>
  );
}

function FeatureCard({ feature, isEpic = false }: { feature: Feature; isEpic?: boolean }) {
  return (
    <Card
      className={cn('py-2 px-3 flex-row items-center gap-2', isEpic && 'bg-muted/10 border-l-2')}
      style={isEpic && feature.epicColor ? { borderLeftColor: feature.epicColor } : undefined}
    >
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
    </Card>
  );
}
