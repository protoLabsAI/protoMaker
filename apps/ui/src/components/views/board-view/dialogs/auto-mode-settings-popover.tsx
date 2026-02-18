import { useMemo } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@protolabs/ui/atoms';
import { Label } from '@protolabs/ui/atoms';
import { Switch } from '@protolabs/ui/atoms';
import { Slider } from '@protolabs/ui/atoms';
import { FastForward, Bot, Settings2, Lock, CheckCircle, Clock } from 'lucide-react';
import { useAppStore } from '@/store/app-store';
import { getBlockingDependencies } from '@automaker/dependency-resolver';

interface AutoModeSettingsPopoverProps {
  skipVerificationInAutoMode: boolean;
  onSkipVerificationChange: (value: boolean) => void;
  maxConcurrency: number;
  runningAgentsCount: number;
  onConcurrencyChange: (value: number) => void;
}

export function AutoModeSettingsPopover({
  skipVerificationInAutoMode,
  onSkipVerificationChange,
  maxConcurrency,
  runningAgentsCount,
  onConcurrencyChange,
}: AutoModeSettingsPopoverProps) {
  const features = useAppStore((state) => state.features);
  const enableDependencyBlocking = useAppStore((state) => state.enableDependencyBlocking);

  const stats = useMemo(() => {
    let backlog = 0;
    let blocked = 0;
    let running = 0;
    let done = 0;

    for (const f of features) {
      if (f.isEpic) continue;
      // Cast to string since server statuses include values beyond FeatureStatusWithPipeline
      const status: string = f.status ?? 'backlog';
      switch (status) {
        case 'completed':
        case 'verified':
        case 'done':
          done++;
          break;
        case 'in_progress':
        case 'running':
          running++;
          break;
        // waiting_approval is counted as done: the agent finished work and the feature
        // is awaiting human review, so it is effectively complete from the queue perspective
        case 'waiting_approval':
        case 'review':
          done++;
          break;
        case 'failed':
        case 'backlog':
        case 'pending':
        case 'ready':
          if (status === 'backlog' && enableDependencyBlocking) {
            const blocking = getBlockingDependencies(f, features);
            if (blocking.length > 0) {
              blocked++;
            } else {
              backlog++;
            }
          } else {
            backlog++;
          }
          break;
        default:
          // Catch-all for any future or unknown statuses
          backlog++;
          break;
      }
    }
    // Derive total from counters to ensure consistency
    const total = backlog + blocked + running + done;
    return { backlog, blocked, running, done, total };
  }, [features, enableDependencyBlocking]);

  const donePercent = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="p-1 rounded hover:bg-accent/50 transition-colors"
          title="Auto Mode Settings"
          data-testid="auto-mode-settings-button"
        >
          <Settings2 className="w-4 h-4 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="end" sideOffset={8}>
        <div className="space-y-4">
          <div>
            <h4 className="font-medium text-sm mb-1">Auto Mode Settings</h4>
            <p className="text-xs text-muted-foreground">
              Configure auto mode execution and agent concurrency.
            </p>
          </div>

          {/* Max Concurrent Agents */}
          <div className="space-y-2 p-2 rounded-md bg-secondary/50">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-brand-500 shrink-0" />
              <Label className="text-xs font-medium">Max Concurrent Agents</Label>
              <span className="ml-auto text-xs text-muted-foreground">
                {runningAgentsCount}/{maxConcurrency}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <Slider
                value={[maxConcurrency]}
                onValueChange={(value) => onConcurrencyChange(value[0])}
                min={1}
                max={10}
                step={1}
                className="flex-1"
                data-testid="concurrency-slider"
              />
              <span className="text-xs font-medium min-w-[2ch] text-right">{maxConcurrency}</span>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Higher values process more features in parallel but use more API resources.
            </p>
          </div>

          {/* Skip Verification Setting */}
          <div className="flex items-center justify-between gap-3 p-2 rounded-md bg-secondary/50">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <FastForward className="w-4 h-4 text-brand-500 shrink-0" />
              <Label
                htmlFor="skip-verification-toggle"
                className="text-xs font-medium cursor-pointer"
              >
                Skip verification requirement
              </Label>
            </div>
            <Switch
              id="skip-verification-toggle"
              checked={skipVerificationInAutoMode}
              onCheckedChange={onSkipVerificationChange}
              data-testid="skip-verification-toggle"
            />
          </div>

          <p className="text-[10px] text-muted-foreground leading-relaxed">
            When enabled, auto mode will grab features even if their dependencies are not verified,
            as long as they are not currently running.
          </p>

          {/* Feature Queue Overview */}
          <div className="space-y-2 pt-2 border-t border-border/30">
            <h5 className="text-xs font-medium text-muted-foreground">Feature Queue</h5>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center gap-1.5 text-xs">
                <Clock className="w-3 h-3 text-muted-foreground" />
                <span className="text-muted-foreground">Ready:</span>
                <span className="font-medium">{stats.backlog}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <Lock className="w-3 h-3 text-orange-500" />
                <span className="text-muted-foreground">Blocked:</span>
                <span className="font-medium">{stats.blocked}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <Bot className="w-3 h-3 text-brand-500" />
                <span className="text-muted-foreground">Running:</span>
                <span className="font-medium">{stats.running}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <CheckCircle className="w-3 h-3 text-emerald-500" />
                <span className="text-muted-foreground">Done:</span>
                <span className="font-medium">{stats.done}</span>
              </div>
            </div>
            {stats.total > 0 && (
              <div
                className="h-1.5 rounded-full bg-accent/30 overflow-hidden flex"
                role="progressbar"
                aria-valuenow={donePercent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Feature progress: ${donePercent}% complete`}
              >
                {stats.done > 0 && (
                  <div
                    className="h-full bg-emerald-500"
                    style={{ width: `${(stats.done / stats.total) * 100}%` }}
                  />
                )}
                {stats.running > 0 && (
                  <div
                    className="h-full bg-brand-500"
                    style={{ width: `${(stats.running / stats.total) * 100}%` }}
                  />
                )}
                {stats.backlog > 0 && (
                  <div
                    className="h-full bg-muted-foreground/30"
                    style={{ width: `${(stats.backlog / stats.total) * 100}%` }}
                  />
                )}
                {stats.blocked > 0 && (
                  <div
                    className="h-full bg-orange-500/40"
                    style={{ width: `${(stats.blocked / stats.total) * 100}%` }}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
