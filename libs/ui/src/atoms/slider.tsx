import * as React from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { cn } from '../lib/utils.js';

// Type-safe wrappers for Radix UI primitives (React 19 compatibility)
const SliderRootPrimitive = SliderPrimitive.Root as React.ForwardRefExoticComponent<
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> & {
    children?: React.ReactNode;
    className?: string;
  } & React.RefAttributes<HTMLSpanElement>
>;

const SliderTrackPrimitive = SliderPrimitive.Track as React.ForwardRefExoticComponent<
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Track> & {
    children?: React.ReactNode;
    className?: string;
  } & React.RefAttributes<HTMLSpanElement>
>;

const SliderRangePrimitive = SliderPrimitive.Range as React.ForwardRefExoticComponent<
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Range> & {
    className?: string;
  } & React.RefAttributes<HTMLSpanElement>
>;

const SliderThumbPrimitive = SliderPrimitive.Thumb as React.ForwardRefExoticComponent<
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Thumb> & {
    className?: string;
  } & React.RefAttributes<HTMLSpanElement>
>;

interface SliderProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'defaultValue' | 'dir'> {
  value?: number[];
  defaultValue?: number[];
  onValueChange?: (value: number[]) => void;
  onValueCommit?: (value: number[]) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  orientation?: 'horizontal' | 'vertical';
  dir?: 'ltr' | 'rtl';
  inverted?: boolean;
  minStepsBetweenThumbs?: number;
}

const Slider = React.forwardRef<HTMLSpanElement, SliderProps>(({ className, ...props }, ref) => (
  <SliderRootPrimitive
    ref={ref}
    className={cn('relative flex w-full touch-none select-none items-center', className)}
    {...props}
  >
    <SliderTrackPrimitive className="slider-track relative h-1.5 w-full grow overflow-hidden rounded-full bg-muted cursor-pointer">
      <SliderRangePrimitive className="slider-range absolute h-full bg-primary" />
    </SliderTrackPrimitive>
    <SliderThumbPrimitive className="slider-thumb block h-4 w-4 rounded-full border border-border bg-card shadow transition-colors cursor-grab active:cursor-grabbing focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed hover:bg-accent" />
  </SliderRootPrimitive>
));
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };
