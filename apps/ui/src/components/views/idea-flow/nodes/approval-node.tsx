/**
 * Approval Node — HITL gate with inline actions
 *
 * Shows Shield icon with amber accent when awaiting approval.
 * Inline approve/reject buttons with countdown timer animation.
 * Approved: emerald. Rejected: red. Awaiting: amber.
 * 220x120px dimensions.
 */

import { memo, useState, useEffect } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { motion } from 'motion/react';
import { Shield, Check, X } from 'lucide-react';
import type { ApprovalNodeData } from '../types';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface CountdownTimerProps {
  /** Deadline timestamp (ms since epoch) */
  deadline: number;
  /** Timer color variant */
  variant: 'amber' | 'emerald' | 'red';
}

function CountdownTimer({ deadline, variant }: CountdownTimerProps) {
  const [timeLeft, setTimeLeft] = useState(Math.max(0, deadline - Date.now()));
  const [progress, setProgress] = useState(1);

  useEffect(() => {
    const totalDuration = deadline - Date.now();
    const interval = setInterval(() => {
      const remaining = Math.max(0, deadline - Date.now());
      setTimeLeft(remaining);
      setProgress(remaining / totalDuration);
    }, 100);
    return () => clearInterval(interval);
  }, [deadline]);

  const formatTime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const colorClass = {
    amber: 'text-amber-400',
    emerald: 'text-emerald-400',
    red: 'text-red-400',
  }[variant];

  const strokeColor = {
    amber: '#fbbf24',
    emerald: '#34d399',
    red: '#f87171',
  }[variant];

  return (
    <div className="relative inline-flex items-center gap-1.5">
      {/* Animated ring */}
      <svg className="w-4 h-4 -rotate-90">
        <circle
          cx="8"
          cy="8"
          r="6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="opacity-20"
          style={{ color: strokeColor }}
        />
        <motion.circle
          cx="8"
          cy="8"
          r="6"
          fill="none"
          stroke={strokeColor}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeDasharray="37.7"
          strokeDashoffset={37.7 * (1 - progress)}
          initial={false}
          animate={{ strokeDashoffset: 37.7 * (1 - progress) }}
          transition={{ duration: 0.1 }}
        />
      </svg>
      <span className={cn('text-[10px] font-mono tabular-nums', colorClass)}>
        {formatTime(timeLeft)}
      </span>
    </div>
  );
}

function ApprovalNodeComponent({
  data,
}: NodeProps & { data: ApprovalNodeData & { countdown?: number } }) {
  const { approved, approver, approvalTime, feedback, countdown } = data;

  // Determine state and styling
  const isAwaiting = approved === null;
  const isApproved = approved === true;
  const isRejected = approved === false;

  const stateColor = isApproved ? 'emerald' : isRejected ? 'red' : 'amber';
  const stateLabel = isApproved ? 'Approved' : isRejected ? 'Rejected' : 'Awaiting';

  // Mock handlers (these should be wired to actual mutations)
  const handleApprove = (e: React.MouseEvent) => {
    e.stopPropagation();
    console.log('Approve clicked', data);
    // TODO: Wire to actual approval mutation
  };

  const handleReject = (e: React.MouseEvent) => {
    e.stopPropagation();
    console.log('Reject clicked', data);
    // TODO: Wire to approval dialog for feedback
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      className="relative"
    >
      {/* Glow effect */}
      <motion.div
        className={cn(
          'absolute -inset-1 rounded-lg opacity-30',
          stateColor === 'amber' && 'bg-amber-500/20',
          stateColor === 'emerald' && 'bg-emerald-500/20',
          stateColor === 'red' && 'bg-red-500/20'
        )}
        animate={
          isAwaiting
            ? {
                scale: [1, 1.06, 1],
                opacity: [0.2, 0.4, 0.2],
              }
            : {}
        }
        transition={
          isAwaiting
            ? {
                duration: 2,
                repeat: Infinity,
                ease: 'easeInOut',
              }
            : {}
        }
        style={{ filter: 'blur(8px)' }}
      />

      <div
        className={cn(
          'relative w-[220px] h-[120px] rounded-lg border backdrop-blur-md bg-card/90 flex flex-col',
          stateColor === 'amber' && 'border-amber-500/30',
          stateColor === 'emerald' && 'border-emerald-500/30',
          stateColor === 'red' && 'border-red-500/30'
        )}
      >
        <div className="p-3 flex-1 flex flex-col">
          {/* Header */}
          <div className="flex items-center gap-2 mb-2">
            <Shield
              className={cn(
                'w-4 h-4',
                stateColor === 'amber' && 'text-amber-400',
                stateColor === 'emerald' && 'text-emerald-400',
                stateColor === 'red' && 'text-red-400'
              )}
            />
            <span
              className={cn(
                'text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded',
                stateColor === 'amber' && 'bg-amber-500/15 text-amber-400',
                stateColor === 'emerald' && 'bg-emerald-500/15 text-emerald-400',
                stateColor === 'red' && 'bg-red-500/15 text-red-400'
              )}
            >
              {stateLabel}
            </span>
          </div>

          {/* Label */}
          <p className="text-xs font-medium text-foreground mb-1">{data.label}</p>

          {/* Countdown timer (if awaiting and countdown provided) */}
          {isAwaiting && countdown && (
            <div className="mb-2">
              <CountdownTimer deadline={countdown} variant="amber" />
            </div>
          )}

          {/* Approver info (if approved/rejected) */}
          {!isAwaiting && (approver || approvalTime) && (
            <div className="text-[10px] text-muted-foreground space-y-0.5 mb-2">
              {approver && <div>By: {approver}</div>}
              {approvalTime && <div>{new Date(approvalTime).toLocaleString()}</div>}
            </div>
          )}

          {/* Feedback (if rejected) */}
          {isRejected && feedback && (
            <p className="text-[10px] text-muted-foreground italic line-clamp-2">{feedback}</p>
          )}
        </div>

        {/* Inline action buttons (awaiting state only) */}
        {isAwaiting && (
          <div className="p-2 border-t border-border/50 flex gap-2">
            <Button
              size="sm"
              variant="default"
              className="nopan flex-1 h-7 text-[10px] bg-emerald-600 hover:bg-emerald-700"
              onClick={handleApprove}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <Check className="w-3 h-3 mr-1" />
              Approve
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="nopan flex-1 h-7 text-[10px]"
              onClick={handleReject}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <X className="w-3 h-3 mr-1" />
              Reject
            </Button>
          </div>
        )}
      </div>

      <Handle
        type="target"
        position={Position.Top}
        className="!bg-border !w-1.5 !h-1.5 !border-0"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-border !w-1.5 !h-1.5 !border-0"
      />
    </motion.div>
  );
}

export const ApprovalNode = memo(ApprovalNodeComponent);
