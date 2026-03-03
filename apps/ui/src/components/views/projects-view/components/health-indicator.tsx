import { cn } from '@/lib/utils';
import type { ProjectHealth } from '@protolabs-ai/types';

const HEALTH_CONFIG: Record<ProjectHealth, { color: string; label: string }> = {
  'on-track': { color: 'bg-[var(--status-success)]', label: 'On Track' },
  'at-risk': { color: 'bg-[var(--status-warning)]', label: 'At Risk' },
  'off-track': { color: 'bg-[var(--status-error)]', label: 'Off Track' },
};

export function HealthIndicator({
  health,
  size = 'sm',
}: {
  health: ProjectHealth;
  size?: 'sm' | 'md';
}) {
  const config = HEALTH_CONFIG[health];
  const dotSize = size === 'sm' ? 'w-2 h-2' : 'w-2.5 h-2.5';
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm';

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('rounded-full shrink-0', dotSize, config.color)} />
      <span className={cn('text-foreground/80', textSize)}>{config.label}</span>
    </span>
  );
}
