import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { useId } from 'react';
import { motion } from 'motion/react';
import { GlowCard } from './glow-card';

interface GlowAreaChartProps {
  title: string;
  data: Array<Record<string, unknown>>;
  dataKey: string;
  xKey?: string;
  color?: string;
  secondaryDataKey?: string;
  secondaryColor?: string;
  height?: number;
  formatValue?: (value: number) => string;
  subtitle?: string;
}

export function GlowAreaChart({
  title,
  data,
  dataKey,
  xKey = 'name',
  color = 'var(--chart-1)',
  secondaryDataKey,
  secondaryColor = 'var(--chart-4)',
  height = 240,
  formatValue,
  subtitle,
}: GlowAreaChartProps) {
  const id = useId();
  const gradientId = `glow-area-${id}-${dataKey}`;
  const secondaryGradientId = `glow-area-${id}-${secondaryDataKey}`;
  const glowFilterId = `glow-filter-${id}`;

  return (
    <GlowCard orb="bottom-left" orbColor={color} className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.2, duration: 0.5 }}
      >
        <ResponsiveContainer width="100%" height={height}>
          <AreaChart data={data} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.4} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
              {secondaryDataKey && (
                <linearGradient id={secondaryGradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={secondaryColor} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={secondaryColor} stopOpacity={0} />
                </linearGradient>
              )}
              <filter id={glowFilterId}>
                <feGaussianBlur stdDeviation="2" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="hsl(var(--border))"
              strokeOpacity={0.3}
              vertical={false}
            />
            <XAxis
              dataKey={xKey}
              stroke="hsl(var(--muted-foreground))"
              fontSize={10}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="hsl(var(--muted-foreground))"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              tickFormatter={formatValue}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                fontSize: '12px',
                backdropFilter: 'blur(8px)',
              }}
              formatter={(v: number, name: string) => [formatValue ? formatValue(v) : v, name]}
            />
            <Area
              type="monotone"
              dataKey={dataKey}
              stroke={color}
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              filter={`url(#${glowFilterId})`}
              animationDuration={1500}
              animationEasing="ease-out"
            />
            {secondaryDataKey && (
              <Area
                type="monotone"
                dataKey={secondaryDataKey}
                stroke={secondaryColor}
                strokeWidth={1.5}
                fill={`url(#${secondaryGradientId})`}
                animationDuration={1800}
                animationEasing="ease-out"
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </motion.div>
    </GlowCard>
  );
}
