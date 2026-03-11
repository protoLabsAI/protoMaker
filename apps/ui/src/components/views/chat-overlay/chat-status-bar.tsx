/**
 * ChatStatusBar — Compact footer bar for the Ava chat overlay.
 *
 * Mirrors the main bottom panel pattern: icon+count stats on the left,
 * step progress message on the right. Sits inside the ChatInput actions
 * slot so it doesn't shift content above.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Loader2,
  Zap,
  GitBranch,
  AlertTriangle,
  CheckCircle2,
  Bot,
  ListTodo,
  Activity,
  GitPullRequest,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getHttpApiClient } from '@/lib/http-api-client';
import { useProjectHealth } from '@/hooks/use-project-health';
import { useAppStore } from '@/store/app-store';
import type { EventType } from '@/lib/clients/base-http-client';

interface TickerItem {
  icon: 'loader' | 'zap' | 'git' | 'error' | 'check';
  message: string;
  timestamp: number;
}

const TICKER_TTL_MS = 15_000;

const TICKER_ICON_MAP = {
  loader: Loader2,
  zap: Zap,
  git: GitBranch,
  error: AlertTriangle,
  check: CheckCircle2,
} as const;

interface ChatStatusBarProps {
  toolProgressLabel?: string;
  isStreaming: boolean;
  stepCount: number;
  tokenUsage?: { total: number; input: number; output: number; estimated: boolean };
}

function parseAutoModeEvent(payload: Record<string, unknown>): TickerItem | null {
  const type = payload.type as string | undefined;
  const featureTitle = (payload.title as string) || (payload.featureId as string) || '';
  const message = payload.message as string | undefined;

  switch (type) {
    case 'auto_mode_feature_start':
      return { icon: 'zap', message: `Starting: ${featureTitle}`, timestamp: Date.now() };
    case 'auto_mode_feature_complete':
      return { icon: 'check', message: `Completed: ${featureTitle}`, timestamp: Date.now() };
    case 'auto_mode_error':
      return { icon: 'error', message: `Error: ${message || featureTitle}`, timestamp: Date.now() };
    case 'auto_mode_git_workflow':
      return { icon: 'git', message: `Git: ${message || 'workflow step'}`, timestamp: Date.now() };
    case 'auto_mode_progress':
      return {
        icon: 'loader',
        message: message || `Working on ${featureTitle}`,
        timestamp: Date.now(),
      };
    case 'planning_started':
      return { icon: 'loader', message: `Planning: ${featureTitle}`, timestamp: Date.now() };
    case 'pipeline_step_started':
      return {
        icon: 'loader',
        message: `${(payload.step as string) || 'Pipeline'}: ${featureTitle}`,
        timestamp: Date.now(),
      };
    case 'pipeline_step_complete':
      return {
        icon: 'check',
        message: `${(payload.step as string) || 'Step'} done: ${featureTitle}`,
        timestamp: Date.now(),
      };
    case 'auto_mode_idle':
      return { icon: 'check', message: 'Auto-mode idle', timestamp: Date.now() };
    default:
      if (message) return { icon: 'loader', message, timestamp: Date.now() };
      return null;
  }
}

export function ChatStatusBar({
  toolProgressLabel,
  isStreaming,
  stepCount,
  tokenUsage,
}: ChatStatusBarProps) {
  const [ticker, setTicker] = useState<TickerItem | null>(null);
  const lastMessageRef = useRef<string>('');

  const projectPath = useAppStore((s) => s.currentProject?.path);
  const { boardCounts, runningAgentsCount } = useProjectHealth(projectPath);

  const addTicker = useCallback((item: TickerItem) => {
    if (item.message === lastMessageRef.current) return;
    lastMessageRef.current = item.message;
    setTicker(item);
  }, []);

  useEffect(() => {
    const api = getHttpApiClient();
    const unsubscribe = api.subscribeToEvents((type: EventType, payload: unknown) => {
      if (type === 'auto-mode:event') {
        const item = parseAutoModeEvent(payload as Record<string, unknown>);
        if (item) addTicker(item);
      }
      if (type === 'agent:stream') {
        const p = payload as Record<string, unknown>;
        const msg = (p.message as string) || (p.type as string);
        if (msg) addTicker({ icon: 'loader', message: msg, timestamp: Date.now() });
      }
    });
    return unsubscribe;
  }, [addTicker]);

  // Prune expired ticker
  useEffect(() => {
    const interval = setInterval(() => {
      setTicker((prev) => {
        if (!prev) return prev;
        return Date.now() - prev.timestamp < TICKER_TTL_MS ? prev : null;
      });
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Step progress takes priority over event ticker
  const hasToolProgress = isStreaming && (toolProgressLabel || stepCount >= 1);
  const statusMessage = hasToolProgress
    ? toolProgressLabel || `Step ${stepCount}`
    : ticker?.message;
  const statusIcon = hasToolProgress ? 'loader' : ticker?.icon;

  const { backlog, inProgress, review, done } = boardCounts;

  const tokenLabel =
    tokenUsage && tokenUsage.total > 0
      ? tokenUsage.total >= 1000
        ? `${(tokenUsage.total / 1000).toFixed(1)}k`
        : String(tokenUsage.total)
      : null;

  return (
    <div className="flex items-center gap-3 border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
      {/* Token usage */}
      {tokenLabel && (
        <span
          className={cn(
            'tabular-nums',
            tokenUsage!.total > 100_000
              ? 'text-destructive font-medium'
              : tokenUsage!.total > 50_000
                ? 'text-status-warning'
                : ''
          )}
          title={
            tokenUsage!.estimated
              ? `~${tokenUsage!.total.toLocaleString()} estimated context size`
              : `Context: ${tokenUsage!.input.toLocaleString()} in / ${tokenUsage!.output.toLocaleString()} out`
          }
        >
          {tokenUsage!.estimated && '~'}
          {tokenLabel} tokens
        </span>
      )}

      {/* Board stats — mirrors bottom panel */}
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-0.5" title={`${runningAgentsCount} agents`}>
          <Bot className="size-3" />
          {runningAgentsCount}
        </span>
        <span className="flex items-center gap-0.5" title={`${backlog} backlog`}>
          <ListTodo className="size-3" />
          {backlog}
        </span>
        <span
          className={cn('flex items-center gap-0.5', inProgress > 0 && 'text-green-500')}
          title={`${inProgress} in progress`}
        >
          <Activity className="size-3" />
          {inProgress}
        </span>
        <span
          className={cn('flex items-center gap-0.5', review > 0 && 'text-purple-500')}
          title={`${review} in review`}
        >
          <GitPullRequest className="size-3" />
          {review}
        </span>
        <span className="flex items-center gap-0.5" title={`${done} done`}>
          <CheckCircle2 className="size-3" />
          {done}
        </span>
      </div>

      {/* Step progress / event ticker — pushed to the right */}
      {statusMessage && (
        <div
          className={cn(
            'ml-auto flex items-center gap-1 min-w-0',
            statusIcon === 'error' && 'text-destructive',
            statusIcon === 'check' && 'text-green-500'
          )}
        >
          {statusIcon && <TickerIconEl icon={statusIcon} />}
          <span className="truncate">{statusMessage}</span>
        </div>
      )}
    </div>
  );
}

function TickerIconEl({ icon }: { icon: TickerItem['icon'] }) {
  const Icon = TICKER_ICON_MAP[icon];
  return <Icon className={cn('size-3 shrink-0', icon === 'loader' && 'animate-spin')} />;
}
