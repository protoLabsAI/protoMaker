import { useState } from 'react';
import * as LucideIcons from 'lucide-react';
import { Settings2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, Switch, Badge, Button } from '@protolabs/ui/atoms';
import type { IntegrationSummary, IntegrationHealthStatus } from '@automaker/types';

const HEALTH_STYLES: Record<IntegrationHealthStatus, { dot: string; label: string }> = {
  connected: { dot: 'bg-emerald-500', label: 'Connected' },
  disconnected: { dot: 'bg-zinc-400', label: 'Disconnected' },
  degraded: { dot: 'bg-amber-500', label: 'Degraded' },
  unconfigured: { dot: 'bg-zinc-400', label: 'Unconfigured' },
  disabled: { dot: 'bg-zinc-400', label: 'Disabled' },
};

function resolveIcon(iconName: string): LucideIcons.LucideIcon {
  const icon = (LucideIcons as Record<string, unknown>)[iconName];
  if (typeof icon === 'function') return icon as LucideIcons.LucideIcon;
  return LucideIcons.Plug;
}

interface IntegrationCardProps {
  integration: IntegrationSummary;
  onToggle: (id: string, enabled: boolean) => Promise<void> | void;
  onConfigure: (id: string) => void;
}

export function IntegrationCard({ integration, onToggle, onConfigure }: IntegrationCardProps) {
  const [toggling, setToggling] = useState(false);
  const Icon = resolveIcon(integration.iconName);
  const healthStatus = integration.health?.status ?? 'unconfigured';
  const healthStyle = HEALTH_STYLES[healthStatus];

  const handleToggle = async (checked: boolean) => {
    setToggling(true);
    try {
      await onToggle(integration.id, checked);
    } finally {
      setToggling(false);
    }
  };

  return (
    <Card className="relative overflow-hidden">
      {integration.brandColor && (
        <div
          className="absolute top-0 left-0 w-1 h-full"
          style={{ backgroundColor: integration.brandColor }}
        />
      )}
      <CardContent className="p-4 pl-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div
              className={cn(
                'flex items-center justify-center w-9 h-9 rounded-lg shrink-0',
                'bg-zinc-100 dark:bg-zinc-800'
              )}
            >
              <Icon className="w-5 h-5 text-zinc-600 dark:text-zinc-300" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-medium text-sm truncate">{integration.name}</h3>
                {integration.hasHealthCheck && (
                  <div className="flex items-center gap-1.5">
                    <div className={cn('w-2 h-2 rounded-full', healthStyle.dot)} />
                    <span className="text-xs text-zinc-500">{healthStyle.label}</span>
                  </div>
                )}
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 line-clamp-2">
                {integration.description}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Switch
              checked={integration.enabled}
              onCheckedChange={handleToggle}
              disabled={toggling}
              aria-label={`Toggle ${integration.name}`}
            />
          </div>
        </div>
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
          <div className="flex gap-1.5">
            <Badge variant="outline" className="text-[10px] font-normal">
              {integration.category}
            </Badge>
            <Badge variant="outline" className="text-[10px] font-normal">
              {integration.scope}
            </Badge>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={() => onConfigure(integration.id)}
          >
            <Settings2 className="w-3.5 h-3.5" />
            Configure
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
