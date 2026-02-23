import { useId } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { motion } from 'motion/react';
import { GlowCard } from './glow-card';

interface DonutEntry {
  name: string;
  value: number;
  color: string;
}

interface GlowDonutProps {
  title: string;
  data: DonutEntry[];
  centerLabel?: string;
  centerValue?: string;
  height?: number;
  formatValue?: (value: number) => string;
}

export function GlowDonut({
  title,
  data,
  centerLabel,
  centerValue,
  height = 200,
  formatValue = (v) => v.toLocaleString(),
}: GlowDonutProps) {
  const filterId = useId();
  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <GlowCard orb="center" orbColor={data[0]?.color} className="p-5">
      <h3 className="text-sm font-semibold mb-3">{title}</h3>

      <motion.div
        initial={{ opacity: 0, rotate: -90 }}
        animate={{ opacity: 1, rotate: 0 }}
        transition={{ delay: 0.2, duration: 0.8, type: 'spring' }}
        className="relative"
      >
        <ResponsiveContainer width="100%" height={height}>
          <PieChart>
            <defs>
              {data.map((entry, i) => (
                <filter key={i} id={`donut-glow-${filterId}-${i}`}>
                  <feDropShadow
                    dx="0"
                    dy="0"
                    stdDeviation="3"
                    floodColor={entry.color}
                    floodOpacity="0.5"
                  />
                </filter>
              ))}
            </defs>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius="60%"
              outerRadius="85%"
              strokeWidth={0}
              animationDuration={1200}
              animationBegin={200}
            >
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.color} filter={`url(#donut-glow-${filterId}-${i})`} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                fontSize: '12px',
              }}
              formatter={((v: number, name: string) => [formatValue(v), name]) as any}
            />
          </PieChart>
        </ResponsiveContainer>

        {/* Center text */}
        {(centerLabel || centerValue) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            {centerValue && (
              <span className="text-2xl font-bold tracking-tight">{centerValue}</span>
            )}
            {centerLabel && <span className="text-xs text-muted-foreground">{centerLabel}</span>}
          </div>
        )}
      </motion.div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-2 justify-center">
        {data.map((entry) => (
          <div key={entry.name} className="flex items-center gap-1.5 text-xs">
            <div
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: entry.color, boxShadow: `0 0 6px ${entry.color}60` }}
            />
            <span className="text-muted-foreground">{entry.name}</span>
            <span className="font-medium">
              {total > 0 ? `${((entry.value / total) * 100).toFixed(0)}%` : '0%'}
            </span>
          </div>
        ))}
      </div>
    </GlowCard>
  );
}
