/**
 * IdeaListPanel — Scrollable session list grouped by status
 *
 * Displays intake sessions organized by processing status.
 * Clicking an item pans the canvas to that idea's lane.
 */

import { motion } from 'motion/react';
import { Clock, CheckCircle, AlertCircle, Loader2, List } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

// Status categories for grouping
type SessionStatusCategory = 'processing' | 'awaiting' | 'completed' | 'failed';

interface SessionItem {
  id: string;
  title: string;
  status: SessionStatusCategory;
  timestamp: string;
}

interface IdeaListPanelProps {
  sessions: SessionItem[];
  onSelectSession: (sessionId: string) => void;
}

const statusConfig = {
  processing: {
    label: 'Processing',
    icon: Loader2,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/20',
  },
  awaiting: {
    label: 'Awaiting',
    icon: Clock,
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/20',
  },
  completed: {
    label: 'Completed',
    icon: CheckCircle,
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10',
    borderColor: 'border-emerald-500/20',
  },
  failed: {
    label: 'Failed',
    icon: AlertCircle,
    color: 'text-red-400',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/20',
  },
};

function SessionGroup({
  status,
  sessions,
  onSelectSession,
}: {
  status: SessionStatusCategory;
  sessions: SessionItem[];
  onSelectSession: (id: string) => void;
}) {
  if (sessions.length === 0) return null;

  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 px-2">
        <Icon className={cn('w-3 h-3', config.color, status === 'processing' && 'animate-spin')} />
        <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          {config.label}
        </h4>
        <span className="text-[9px] text-muted-foreground/70 ml-auto">{sessions.length}</span>
      </div>
      <div className="space-y-1">
        {sessions.map((session) => (
          <button
            key={session.id}
            onClick={() => onSelectSession(session.id)}
            className={cn(
              'w-full text-left px-2 py-1.5 rounded-lg border transition-colors',
              'hover:bg-muted/50 active:scale-[0.98]',
              config.bgColor,
              config.borderColor
            )}
          >
            <div className="flex items-start justify-between gap-2 min-w-0">
              <p className="text-xs font-medium truncate flex-1">{session.title}</p>
              <span className={cn('text-[10px] shrink-0', config.color)}>
                {formatDistanceToNow(new Date(session.timestamp), { addSuffix: true })}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

export function IdeaListPanel({ sessions, onSelectSession }: IdeaListPanelProps) {
  // Group sessions by status
  const grouped = sessions.reduce(
    (acc, session) => {
      acc[session.status].push(session);
      return acc;
    },
    {
      processing: [] as SessionItem[],
      awaiting: [] as SessionItem[],
      completed: [] as SessionItem[],
      failed: [] as SessionItem[],
    }
  );

  const isEmpty = sessions.length === 0;

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
      className="w-64 h-[400px] rounded-xl border border-border/50 bg-card/90 backdrop-blur-md shadow-lg flex flex-col overflow-hidden"
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50">
        <List className="w-3.5 h-3.5 text-muted-foreground" />
        <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
          Ideas Pipeline
        </h3>
      </div>

      {isEmpty ? (
        <div className="flex-1 flex items-center justify-center px-4">
          <p className="text-xs text-muted-foreground text-center">
            No ideas in the pipeline yet.
            <br />
            Start by creating a new intake.
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
          <SessionGroup
            status="processing"
            sessions={grouped.processing}
            onSelectSession={onSelectSession}
          />
          <SessionGroup
            status="awaiting"
            sessions={grouped.awaiting}
            onSelectSession={onSelectSession}
          />
          <SessionGroup
            status="completed"
            sessions={grouped.completed}
            onSelectSession={onSelectSession}
          />
          <SessionGroup
            status="failed"
            sessions={grouped.failed}
            onSelectSession={onSelectSession}
          />
        </div>
      )}
    </motion.div>
  );
}
