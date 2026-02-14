import { useId } from 'react';
import { motion } from 'motion/react';
import { GlowCard } from './glow-card';
import { cn } from '@/lib/utils';

interface GaugeProps {
  value: number;
  max: number;
  label: string;
  unit?: string;
  thresholds?: { warn: number; critical: number };
  size?: number;
}

export function Gauge({
  value,
  max,
  label,
  unit = '%',
  thresholds = { warn: 70, critical: 90 },
  size = 100,
}: GaugeProps) {
  const filterId = useId();
  const percent = Math.min((value / max) * 100, 100);
  const radius = (size - 12) / 2;
  const circumference = Math.PI * radius; // half circle
  const offset = circumference - (percent / 100) * circumference;

  const color =
    percent >= thresholds.critical ? '#ef4444' : percent >= thresholds.warn ? '#f59e0b' : '#10b981';

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size / 2 + 10} viewBox={`0 0 ${size} ${size / 2 + 10}`}>
        <defs>
          <filter id={filterId}>
            <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor={color} floodOpacity="0.6" />
          </filter>
        </defs>
        {/* Background arc */}
        <path
          d={`M ${6} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - 6} ${size / 2}`}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={6}
          strokeLinecap="round"
        />
        {/* Value arc */}
        <motion.path
          d={`M ${6} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - 6} ${size / 2}`}
          fill="none"
          stroke={color}
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.5, ease: 'easeOut' }}
          filter={`url(#${filterId})`}
        />
      </svg>
      <div className="text-center -mt-2">
        <span className="text-lg font-bold" style={{ color }}>
          {unit === '%' ? Math.round(percent) : value}
          {unit}
        </span>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">{label}</p>
      </div>
    </div>
  );
}

interface FlowStatusProps {
  flows: Array<{
    name: string;
    status: 'active' | 'idle' | 'error';
    lastRun?: string;
    avgLatencyMs?: number;
  }>;
}

export function FlowStatus({ flows }: FlowStatusProps) {
  const statusColors = {
    active: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-500' },
    idle: { bg: 'bg-muted/50', text: 'text-muted-foreground', dot: 'bg-muted-foreground' },
    error: { bg: 'bg-red-500/10', text: 'text-red-400', dot: 'bg-red-500' },
  };

  return (
    <GlowCard orb="none" className="p-5">
      <h3 className="text-sm font-semibold mb-3">Flow Status</h3>

      <div className="space-y-2">
        {flows.map((flow, i) => {
          const s = statusColors[flow.status];
          return (
            <motion.div
              key={flow.name}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className={cn('flex items-center justify-between px-3 py-2 rounded-lg', s.bg)}
            >
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  {flow.status === 'active' && (
                    <span
                      className={cn(
                        'absolute inline-flex h-full w-full animate-ping rounded-full opacity-75',
                        s.dot
                      )}
                    />
                  )}
                  <span className={cn('relative inline-flex h-2 w-2 rounded-full', s.dot)} />
                </span>
                <span className={cn('text-xs font-medium', s.text)}>{flow.name}</span>
              </div>
              {flow.avgLatencyMs !== undefined && (
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  {flow.avgLatencyMs}ms
                </span>
              )}
            </motion.div>
          );
        })}
      </div>
    </GlowCard>
  );
}

interface CapacityBarProps {
  label: string;
  current: number;
  max: number;
  color?: string;
}

export function CapacityBar({ label, current, max, color = '#8b5cf6' }: CapacityBarProps) {
  const percent = max > 0 ? Math.min((current / max) * 100, 100) : 0;

  return (
    <div>
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-xs font-medium tabular-nums">
          {current}/{max}
        </span>
      </div>
      <div className="h-2 rounded-full bg-muted/50 overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{
            backgroundColor: color,
            boxShadow: `0 0 8px ${color}60`,
          }}
          initial={{ width: 0 }}
          animate={{ width: `${percent}%` }}
          transition={{ duration: 1, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
}
