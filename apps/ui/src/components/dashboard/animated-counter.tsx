import { useEffect, useId, useRef, useState } from 'react';
import { motion, useSpring, useTransform } from 'motion/react';

interface AnimatedCounterProps {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  duration?: number;
  className?: string;
}

export function AnimatedCounter({
  value,
  prefix = '',
  suffix = '',
  decimals = 0,
  duration = 1.2,
  className = '',
}: AnimatedCounterProps) {
  const spring = useSpring(0, {
    stiffness: 50,
    damping: 20,
    duration,
  });

  const display = useTransform(spring, (current) => {
    if (decimals > 0) {
      return current.toFixed(decimals);
    }
    return Math.round(current).toLocaleString();
  });

  useEffect(() => {
    spring.set(value);
  }, [spring, value]);

  return (
    <span className={className}>
      {prefix}
      <motion.span>{display}</motion.span>
      {suffix}
    </span>
  );
}

interface LiveIndicatorProps {
  label?: string;
  color?: 'green' | 'blue' | 'amber' | 'red';
}

export function LiveIndicator({ label = 'Live', color = 'green' }: LiveIndicatorProps) {
  const colorMap = {
    green: { dot: 'bg-emerald-500', ring: 'bg-emerald-500', text: 'text-emerald-400' },
    blue: { dot: 'bg-blue-500', ring: 'bg-blue-500', text: 'text-blue-400' },
    amber: { dot: 'bg-amber-500', ring: 'bg-amber-500', text: 'text-amber-400' },
    red: { dot: 'bg-red-500', ring: 'bg-red-500', text: 'text-red-400' },
  };

  const c = colorMap[color];

  return (
    <div className="relative flex items-center gap-1.5">
      <span className="relative flex h-2 w-2">
        <span
          className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${c.ring}`}
        />
        <span className={`relative inline-flex h-2 w-2 rounded-full ${c.dot}`} />
      </span>
      <span className={`text-xs font-medium ${c.text}`}>{label}</span>
    </div>
  );
}

interface SparklineProps {
  data: number[];
  color?: string;
  height?: number;
  className?: string;
}

export function Sparkline({
  data,
  color = 'hsl(var(--primary))',
  height = 32,
  className = '',
}: SparklineProps) {
  const gradientId = useId();
  const svgRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(120);

  useEffect(() => {
    if (svgRef.current) {
      setWidth(svgRef.current.clientWidth);
    }
  }, []);

  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  });

  const pathD = `M${points.join(' L')}`;
  const areaD = `${pathD} L${width},${height} L0,${height} Z`;

  return (
    <svg ref={svgRef} width="100%" height={height} className={className}>
      <defs>
        <linearGradient id={`spark-fill-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#spark-fill-${gradientId})`} />
      <path d={pathD} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
    </svg>
  );
}
