import type { ReactNode } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@protolabs-ai/ui/atoms';
import { Spinner } from '@protolabs-ai/ui/atoms';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

export interface PanelHeaderAction {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  destructive?: boolean;
  testId?: string;
  desktopOnly?: boolean;
}

interface PanelHeaderProps {
  icon: LucideIcon;
  title: string;
  badge?: ReactNode;
  actions?: PanelHeaderAction[];
  extra?: ReactNode;
}

export function PanelHeader({ icon: Icon, title, badge, actions, extra }: PanelHeaderProps) {
  return (
    <div className="flex items-center justify-between border-b border-border px-4 py-2">
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-primary" />
        <h1 className="text-sm font-medium">{title}</h1>
        {badge}
      </div>
      {(actions?.length || extra) && (
        <TooltipProvider delayDuration={300}>
          <div className="flex items-center gap-0.5">
            {actions?.map((action) => (
              <Tooltip key={action.label}>
                <TooltipTrigger asChild>
                  <button
                    onClick={action.onClick}
                    disabled={action.disabled}
                    className={cn(
                      'rounded-md p-1.5 text-muted-foreground transition-colors',
                      'hover:bg-accent hover:text-foreground',
                      'disabled:opacity-50 disabled:pointer-events-none',
                      action.destructive && 'hover:text-destructive',
                      action.desktopOnly && 'hidden lg:inline-flex'
                    )}
                    aria-label={action.label}
                    data-testid={action.testId}
                  >
                    {action.loading ? <Spinner size="sm" /> : <action.icon className="size-4" />}
                  </button>
                </TooltipTrigger>
                <TooltipContent>{action.label}</TooltipContent>
              </Tooltip>
            ))}
            {extra}
          </div>
        </TooltipProvider>
      )}
    </div>
  );
}
