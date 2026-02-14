import { motion } from 'motion/react';
import type { LucideIcon } from 'lucide-react';
import { AnimatedCounter, Sparkline } from './animated-counter';
import { GlowCard } from './glow-card';
import { cn } from '@/lib/utils';

interface HeroStatProps {
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  icon: LucideIcon;
  /** Trend percentage (positive = up, negative = down) */
  trend?: number;
  /** Sparkline data points */
  sparkline?: number[];
  /** Accent color */
  color?: string;
  /** Glow orb position */
  orb?: 'top-right' | 'bottom-left' | 'none';
}

export function HeroStat({
  label,
  value,
  prefix = '',
  suffix = '',
  decimals = 0,
  icon: Icon,
  trend,
  sparkline,
  color = 'hsl(var(--primary))',
  orb = 'top-right',
}: HeroStatProps) {
  return (
    <GlowCard orb={orb} orbColor={color} className="p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
            {label}
          </p>
        </div>
        <div
          className="rounded-lg p-2"
          style={{
            backgroundColor: color.startsWith('hsl')
              ? `color-mix(in srgb, ${color} 8%, transparent)`
              : `${color}15`,
          }}
        >
          <Icon className="h-4 w-4" style={{ color }} />
        </div>
      </div>

      <div className="flex items-end gap-2 mb-2">
        <AnimatedCounter
          value={value}
          prefix={prefix}
          suffix={suffix}
          decimals={decimals}
          className="text-3xl font-bold tracking-tight"
        />
        {trend !== undefined && (
          <motion.span
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5 }}
            className={cn(
              'text-xs font-medium pb-1',
              trend >= 0 ? 'text-emerald-400' : 'text-red-400'
            )}
          >
            {trend >= 0 ? '+' : ''}
            {trend.toFixed(1)}%
          </motion.span>
        )}
      </div>

      {sparkline && sparkline.length > 1 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="mt-1"
        >
          <Sparkline data={sparkline} color={color} height={28} />
        </motion.div>
      )}
    </GlowCard>
  );
}
