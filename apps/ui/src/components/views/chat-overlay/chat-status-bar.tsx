/**
 * ChatStatusBar — Persistent status ticker for the Ava chat overlay.
 *
 * Sits between the header and the message list. Shows:
 *  1. Ava's current tool execution progress (moved from inline AILoader)
 *  2. Project event tickers from auto-mode and agent streams
 *
 * Events fade out after a short TTL so the bar auto-collapses when idle.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Zap, GitBranch, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getHttpApiClient } from '@/lib/http-api-client';
import type { EventType } from '@/lib/clients/base-http-client';

interface TickerItem {
  id: string;
  icon: 'loader' | 'zap' | 'git' | 'error' | 'check';
  message: string;
  timestamp: number;
}

const TICKER_TTL_MS = 15_000;
const MAX_TICKER_ITEMS = 3;

const ICON_MAP = {
  loader: Loader2,
  zap: Zap,
  git: GitBranch,
  error: AlertTriangle,
  check: CheckCircle2,
} as const;

interface ChatStatusBarProps {
  /** Current tool progress label from useToolProgress (Ava's active tool) */
  toolProgressLabel?: string;
  /** Whether Ava is currently streaming a response */
  isStreaming: boolean;
  /** Current agentic step count */
  stepCount: number;
}

/** Map auto-mode event types to ticker items */
function parseAutoModeEvent(payload: Record<string, unknown>): TickerItem | null {
  const type = payload.type as string | undefined;
  const featureTitle = (payload.title as string) || (payload.featureId as string) || '';
  const message = payload.message as string | undefined;

  switch (type) {
    case 'auto_mode_feature_start':
      return {
        id: `am-${Date.now()}`,
        icon: 'zap',
        message: `Starting: ${featureTitle}`,
        timestamp: Date.now(),
      };
    case 'auto_mode_feature_complete':
      return {
        id: `am-${Date.now()}`,
        icon: 'check',
        message: `Completed: ${featureTitle}`,
        timestamp: Date.now(),
      };
    case 'auto_mode_error':
      return {
        id: `am-${Date.now()}`,
        icon: 'error',
        message: `Error: ${message || featureTitle}`,
        timestamp: Date.now(),
      };
    case 'auto_mode_git_workflow':
      return {
        id: `am-${Date.now()}`,
        icon: 'git',
        message: `Git: ${message || 'workflow step'}`,
        timestamp: Date.now(),
      };
    case 'auto_mode_progress':
      return {
        id: `am-${Date.now()}`,
        icon: 'loader',
        message: message || `Working on ${featureTitle}`,
        timestamp: Date.now(),
      };
    case 'planning_started':
      return {
        id: `am-${Date.now()}`,
        icon: 'loader',
        message: `Planning: ${featureTitle}`,
        timestamp: Date.now(),
      };
    case 'pipeline_step_started':
      return {
        id: `am-${Date.now()}`,
        icon: 'loader',
        message: `${(payload.step as string) || 'Pipeline'}: ${featureTitle}`,
        timestamp: Date.now(),
      };
    case 'pipeline_step_complete':
      return {
        id: `am-${Date.now()}`,
        icon: 'check',
        message: `${(payload.step as string) || 'Step'} done: ${featureTitle}`,
        timestamp: Date.now(),
      };
    case 'auto_mode_idle':
      return {
        id: `am-${Date.now()}`,
        icon: 'check',
        message: 'Auto-mode idle — no pending features',
        timestamp: Date.now(),
      };
    default:
      if (message) {
        return {
          id: `am-${Date.now()}`,
          icon: 'loader',
          message,
          timestamp: Date.now(),
        };
      }
      return null;
  }
}

export function ChatStatusBar({ toolProgressLabel, isStreaming, stepCount }: ChatStatusBarProps) {
  const [tickers, setTickers] = useState<TickerItem[]>([]);
  const tickerRef = useRef(tickers);
  tickerRef.current = tickers;

  // Subscribe to project events
  useEffect(() => {
    const api = getHttpApiClient();
    const unsubscribe = api.subscribeToEvents((type: EventType, payload: unknown) => {
      if (type === 'auto-mode:event') {
        const item = parseAutoModeEvent(payload as Record<string, unknown>);
        if (item) {
          setTickers((prev) => [item, ...prev].slice(0, MAX_TICKER_ITEMS));
        }
      }
      if (type === 'agent:stream') {
        const p = payload as Record<string, unknown>;
        const msg = (p.message as string) || (p.type as string);
        if (msg) {
          setTickers((prev) =>
            [
              {
                id: `ag-${Date.now()}`,
                icon: 'loader' as const,
                message: msg,
                timestamp: Date.now(),
              },
              ...prev,
            ].slice(0, MAX_TICKER_ITEMS)
          );
        }
      }
    });
    return unsubscribe;
  }, []);

  // Prune expired ticker items
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setTickers((prev) => {
        const filtered = prev.filter((t) => now - t.timestamp < TICKER_TTL_MS);
        return filtered.length === prev.length ? prev : filtered;
      });
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Determine what to show in the primary status slot
  const hasToolProgress = isStreaming && (toolProgressLabel || stepCount >= 1);
  const hasTickers = tickers.length > 0;

  // Nothing to show — collapse entirely
  if (!hasToolProgress && !hasTickers) return null;

  return (
    <div
      data-slot="chat-status-bar"
      className="shrink-0 border-b border-border/50 bg-muted/20 px-3 py-1 text-[11px] text-muted-foreground"
    >
      {/* Primary: Ava tool progress */}
      {hasToolProgress && (
        <div className="flex items-center gap-2">
          <Loader2 className="size-3 animate-spin text-primary" />
          <span className="truncate">{toolProgressLabel || `Step ${stepCount}`}</span>
        </div>
      )}

      {/* Secondary: Project event tickers */}
      {tickers.map((item) => {
        const Icon = ICON_MAP[item.icon];
        return (
          <div
            key={item.id}
            className={cn(
              'flex items-center gap-2 py-0.5',
              item.icon === 'error' && 'text-destructive',
              item.icon === 'check' && 'text-green-500'
            )}
          >
            <Icon className={cn('size-3 shrink-0', item.icon === 'loader' && 'animate-spin')} />
            <span className="truncate">{item.message}</span>
          </div>
        );
      })}
    </div>
  );
}
