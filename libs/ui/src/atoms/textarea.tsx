import * as React from 'react';

import { cn } from '../lib/utils.js';

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'placeholder:text-muted-foreground/60 selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-border min-h-[80px] w-full min-w-0 rounded-md border bg-transparent px-3 py-2 text-base outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm resize-none',
        // Inner shadow for depth
        'shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)]',
        // Animated focus ring
        'transition-[color,box-shadow,border-color] duration-200 ease-out',
        'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
        'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive',
        className
      )}
      {...props}
    />
  );
}

export { Textarea };
