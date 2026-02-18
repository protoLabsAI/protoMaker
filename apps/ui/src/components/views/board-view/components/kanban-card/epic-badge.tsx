/**
 * EpicBadge - Shows which epic a feature belongs to
 */

import { Badge } from '@protolabs/ui/atoms';
import { Feature, useAppStore } from '@/store/app-store';
import { useShallow } from 'zustand/react/shallow';
import { Layers } from 'lucide-react';

interface EpicBadgeProps {
  feature: Feature;
  className?: string;
}

export function EpicBadge({ feature, className }: EpicBadgeProps) {
  // Get the parent epic from the store
  const epicFeature = useAppStore(
    useShallow((state) => {
      if (!feature.epicId) return null;
      return state.features.find((f) => f.id === feature.epicId) || null;
    })
  );

  // Don't render if feature doesn't belong to an epic
  if (!feature.epicId || !epicFeature) {
    return null;
  }

  // Extract epic name (remove [Epic] prefix if present)
  const epicTitle = epicFeature.title?.replace(/^\[Epic\]\s*/i, '') || 'Epic';

  // Use epic's color or default to a neutral color
  const badgeColor = feature.epicColor || epicFeature.epicColor || '#6366f1';

  return (
    <Badge
      variant="outline"
      className={className}
      style={{
        borderColor: badgeColor,
        backgroundColor: `${badgeColor}15`,
        color: badgeColor,
      }}
    >
      <Layers className="h-3 w-3 mr-1" />
      <span className="truncate max-w-[100px]">{epicTitle}</span>
    </Badge>
  );
}
