import { motion, AnimatePresence } from 'motion/react';
import { GlowCard } from './glow-card';
import { cn } from '@/lib/utils';

interface ActivityItem {
  id: string;
  icon: string;
  source: 'discord' | 'linear' | 'github' | 'agent';
  message: string;
  timestamp: string;
}

const sourceStyles: Record<string, { color: string; label: string }> = {
  discord: { color: '#5865F2', label: 'Discord' },
  linear: { color: '#5E6AD2', label: 'Linear' },
  github: { color: '#238636', label: 'GitHub' },
  agent: { color: 'var(--chart-1)', label: 'Agent' },
};

interface ActivityTickerProps {
  items: ActivityItem[];
  title?: string;
  maxItems?: number;
}

export function ActivityTicker({
  items,
  title = 'Activity Feed',
  maxItems = 8,
}: ActivityTickerProps) {
  const safeMaxItems = Math.max(0, maxItems);
  const displayItems = items.slice(0, safeMaxItems);

  return (
    <GlowCard orb="none" className="p-5">
      <h3 className="text-sm font-semibold mb-3">{title}</h3>

      <div className="space-y-1">
        <AnimatePresence initial={false}>
          {displayItems.map((item, i) => {
            const source = sourceStyles[item.source] || sourceStyles.agent;

            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: -20, height: 0 }}
                animate={{ opacity: 1, x: 0, height: 'auto' }}
                exit={{ opacity: 0, x: 20, height: 0 }}
                transition={{ delay: i * 0.05, duration: 0.3 }}
                className="flex items-start gap-2.5 py-1.5 text-xs"
              >
                {/* Source indicator */}
                <div
                  className="mt-0.5 h-1.5 w-1.5 rounded-full shrink-0"
                  style={{
                    backgroundColor: source.color,
                    boxShadow: `0 0 6px ${source.color}80`,
                  }}
                />

                <div className="flex-1 min-w-0">
                  <span className="text-muted-foreground">{item.message}</span>
                </div>

                <span className="text-muted-foreground/50 shrink-0 tabular-nums">
                  {item.timestamp}
                </span>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </GlowCard>
  );
}

interface IntegrationStatusProps {
  name: string;
  icon: string;
  connected: boolean;
  stats: Array<{ label: string; value: string | number }>;
  color: string;
}

export function IntegrationCard({ name, icon, connected, stats, color }: IntegrationStatusProps) {
  return (
    <GlowCard orb="top-right" orbColor={color} className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <span className="text-xl">{icon}</span>
          <h3 className="text-sm font-semibold">{name}</h3>
        </div>
        <span
          className={cn(
            'text-[10px] font-medium px-2 py-0.5 rounded-full',
            connected
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
              : 'bg-red-500/10 text-red-400 border border-red-500/20'
          )}
        >
          {connected ? 'Connected' : 'Offline'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {stats.map((stat) => (
          <div key={stat.label}>
            <p className="text-lg font-bold tracking-tight">{stat.value}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
              {stat.label}
            </p>
          </div>
        ))}
      </div>
    </GlowCard>
  );
}
