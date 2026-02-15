import * as React from 'react';
import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area';

import { cn } from '../lib/utils.js';

// Type-safe wrappers for Radix UI primitives (React 19 compatibility)
const ScrollAreaRootPrimitive = ScrollAreaPrimitive.Root as React.ForwardRefExoticComponent<
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root> & {
    children?: React.ReactNode;
    className?: string;
  } & React.RefAttributes<HTMLDivElement>
>;

const ScrollAreaViewportPrimitive = ScrollAreaPrimitive.Viewport as React.ForwardRefExoticComponent<
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Viewport> & {
    children?: React.ReactNode;
    className?: string;
  } & React.RefAttributes<HTMLDivElement>
>;

const ScrollAreaScrollbarPrimitive =
  ScrollAreaPrimitive.Scrollbar as React.ForwardRefExoticComponent<
    React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Scrollbar> & {
      children?: React.ReactNode;
      className?: string;
    } & React.RefAttributes<HTMLDivElement>
  >;

const ScrollAreaThumbPrimitive = ScrollAreaPrimitive.Thumb as React.ForwardRefExoticComponent<
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Thumb> & {
    className?: string;
  } & React.RefAttributes<HTMLDivElement>
>;

const ScrollArea = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root>
>(({ className, children, ...props }, ref) => (
  <ScrollAreaRootPrimitive
    ref={ref}
    className={cn('relative overflow-hidden', className)}
    {...props}
  >
    <ScrollAreaViewportPrimitive className="h-full w-full rounded-[inherit]">
      {children}
    </ScrollAreaViewportPrimitive>
    <ScrollBar />
    <ScrollAreaPrimitive.Corner />
  </ScrollAreaRootPrimitive>
));
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName;

const ScrollBar = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Scrollbar>
>(({ className, orientation = 'vertical', ...props }, ref) => (
  <ScrollAreaScrollbarPrimitive
    ref={ref}
    orientation={orientation}
    className={cn(
      'flex touch-none select-none transition-colors',
      orientation === 'vertical' && 'h-full w-2.5 border-l border-l-transparent p-[1px]',
      orientation === 'horizontal' && 'h-2.5 flex-col border-t border-t-transparent p-[1px]',
      className
    )}
    {...props}
  >
    <ScrollAreaThumbPrimitive className="relative flex-1 rounded-full bg-border" />
  </ScrollAreaScrollbarPrimitive>
));
ScrollBar.displayName = ScrollAreaPrimitive.Scrollbar.displayName;

export { ScrollArea, ScrollBar };
