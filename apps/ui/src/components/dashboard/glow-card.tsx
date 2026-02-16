import * as React from 'react';
import { motion, type Variants } from 'motion/react';
import { cn } from '@/lib/utils';

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

interface GlowCardProps extends React.ComponentProps<typeof motion.div> {
  /** Color for the glow effect */
  glowColor?: string;
  /** Show animated gradient border */
  gradientBorder?: boolean;
  /** Subtle background orb effect */
  orb?: 'top-right' | 'bottom-left' | 'center' | 'none';
  /** Orb color override */
  orbColor?: string;
  children: React.ReactNode;
}

export function GlowCard({
  glowColor = 'hsl(var(--primary))',
  gradientBorder = false,
  orb = 'none',
  orbColor,
  children,
  className,
  ...props
}: GlowCardProps) {
  const orbPositions = {
    'top-right': '-top-20 -right-20',
    'bottom-left': '-bottom-20 -left-20',
    center: 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
    none: 'hidden',
  };

  return (
    <motion.div
      variants={cardVariants}
      whileHover={{
        y: -4,
        transition: { type: 'spring', stiffness: 300, damping: 20 },
      }}
      className={cn(
        'relative overflow-hidden rounded-xl border border-border backdrop-blur-md',
        'bg-card/80 text-card-foreground',
        'shadow-[0_1px_2px_rgba(0,0,0,0.05),0_4px_6px_rgba(0,0,0,0.05),0_10px_20px_rgba(0,0,0,0.04)]',
        'hover:shadow-xl hover:border-border transition-shadow duration-300',
        gradientBorder &&
          'before:absolute before:inset-0 before:rounded-xl before:p-[1px] before:bg-gradient-to-br before:from-border before:via-transparent before:to-border/30 before:pointer-events-none before:-z-10',
        className
      )}
      {...props}
    >
      {/* Background orb */}
      {orb !== 'none' && (
        <div
          className={cn('absolute w-40 h-40 rounded-full blur-3xl opacity-20', orbPositions[orb])}
          style={{ backgroundColor: orbColor || glowColor }}
        />
      )}

      {/* Content */}
      <div className="relative z-10">{children}</div>
    </motion.div>
  );
}

interface StaggerContainerProps {
  children: React.ReactNode;
  className?: string;
  staggerDelay?: number;
}

export function StaggerContainer({
  children,
  className,
  staggerDelay = 0.08,
}: StaggerContainerProps) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="visible"
      variants={{
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: { staggerChildren: staggerDelay },
        },
      }}
    >
      {children}
    </motion.div>
  );
}
