import { useEffect, useState } from 'react';
import { Inbox } from 'lucide-react';
import { Spinner } from '@protolabsai/ui/atoms';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api-fetch';
import type { RecentSignal, SignalChannel, SignalIntent } from '@protolabsai/types';

const CHANNEL_STYLES: Record<SignalChannel, { label: string; className: string }> = {
  discord: {
    label: 'Discord',
    className: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  },
  github: {
    label: 'GitHub',
    className: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  },
  mcp: { label: 'MCP', className: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300' },
  ui: { label: 'UI', className: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300' },
};

const INTENT_STYLES: Record<SignalIntent, { label: string; className: string }> = {
  work_order: {
    label: 'Work Order',
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  },
  idea: {
    label: 'Idea',
    className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  },
  feedback: {
    label: 'Feedback',
    className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  },
  conversational: {
    label: 'Chat',
    className: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
  },
  interrupt: {
    label: 'Interrupt',
    className: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  },
  bug_report: {
    label: 'Bug Report',
    className: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  },
};

const STATUS_STYLES: Record<RecentSignal['status'], { dot: string; label: string }> = {
  pending: { dot: 'bg-zinc-400', label: 'Pending' },
  creating: { dot: 'bg-amber-400 animate-pulse', label: 'Creating' },
  created: { dot: 'bg-emerald-500', label: 'Created' },
  dismissed: { dot: 'bg-zinc-300 dark:bg-zinc-600', label: 'Dismissed' },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface SignalRowProps {
  signal: RecentSignal;
  onNavigate?: (featureId: string) => void;
}

function SignalRow({ signal, onNavigate }: SignalRowProps) {
  const channelStyle = CHANNEL_STYLES[signal.channel] ?? CHANNEL_STYLES.mcp;
  const intentStyle = INTENT_STYLES[signal.intent] ?? INTENT_STYLES.conversational;
  const statusStyle = STATUS_STYLES[signal.status];

  const handleClick = () => {
    if (signal.featureId && onNavigate) {
      onNavigate(signal.featureId);
    }
  };

  return (
    <div
      className={cn(
        'flex flex-col gap-2 px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 last:border-0',
        signal.featureId &&
          'cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors'
      )}
      onClick={handleClick}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className={cn(
              'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium',
              channelStyle.className
            )}
          >
            {channelStyle.label}
          </span>
          <span
            className={cn(
              'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium',
              intentStyle.className
            )}
          >
            {intentStyle.label}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <div className={cn('w-1.5 h-1.5 rounded-full', statusStyle.dot)} />
          <span className="text-[10px] text-zinc-400 dark:text-zinc-500">{statusStyle.label}</span>
          <span className="text-[10px] text-zinc-400 dark:text-zinc-500">&middot;</span>
          <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
            {timeAgo(signal.createdAt)}
          </span>
        </div>
      </div>
      <p className="text-xs text-zinc-600 dark:text-zinc-400 truncate">{signal.preview}</p>
    </div>
  );
}

export function SignalsPanel() {
  const [signals, setSignals] = useState<RecentSignal[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSignals = async () => {
    try {
      const res = await apiFetch('/api/integrations/signals', 'GET');
      if (!res.ok) return;
      const data = await res.json();
      setSignals(data.signals ?? []);
    } catch {
      // Silently ignore — signals panel is non-critical
    }
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchSignals();
      setLoading(false);
    })();

    const interval = setInterval(fetchSignals, 10_000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner />
      </div>
    );
  }

  if (signals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <Inbox className="w-8 h-8 text-zinc-300 dark:text-zinc-600" />
        <p className="text-sm text-zinc-500 max-w-xs">
          No signals received yet. Configure signal sources in the Integrations tab.
        </p>
      </div>
    );
  }

  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
      <div className="divide-y divide-zinc-100 dark:divide-zinc-800 max-h-[600px] overflow-y-auto">
        {signals.map((signal) => (
          <SignalRow key={signal.id} signal={signal} />
        ))}
      </div>
    </div>
  );
}
