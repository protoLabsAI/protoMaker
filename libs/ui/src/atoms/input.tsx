import * as React from 'react';

import { cn } from '../lib/utils.js';

interface InputProps extends React.ComponentProps<'input'> {
  startAddon?: React.ReactNode;
  endAddon?: React.ReactNode;
}

function Input({ className, type, startAddon, endAddon, ...props }: InputProps) {
  const hasAddons = startAddon || endAddon;

  const inputElement = (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'file:text-foreground placeholder:text-muted-foreground/60 selection:bg-primary selection:text-primary-foreground bg-input border-border h-9 w-full min-w-0 rounded-md border px-3 py-1 text-base shadow-xs outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        // Inner shadow for depth
        'shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)]',
        // Animated focus ring
        'transition-[color,box-shadow,border-color] duration-200 ease-out',
        'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
        'aria-invalid:ring-destructive/20 aria-invalid:border-destructive',
        // Adjust padding for addons
        startAddon && 'pl-0',
        endAddon && 'pr-0',
        hasAddons && 'border-0 shadow-none focus-visible:ring-0',
        className
      )}
      {...props}
    />
  );

  if (!hasAddons) {
    return inputElement;
  }

  return (
    <div
      className={cn(
        'flex items-center h-9 w-full rounded-md border border-border bg-input shadow-xs',
        'shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)]',
        'transition-[box-shadow,border-color] duration-200 ease-out',
        'focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]',
        'has-[input:disabled]:opacity-50 has-[input:disabled]:cursor-not-allowed',
        'has-[input[aria-invalid]]:ring-destructive/20 has-[input[aria-invalid]]:border-destructive'
      )}
    >
      {startAddon && (
        <span className="flex items-center justify-center px-3 text-muted-foreground text-sm">
          {startAddon}
        </span>
      )}
      {inputElement}
      {endAddon && (
        <span className="flex items-center justify-center px-3 text-muted-foreground text-sm">
          {endAddon}
        </span>
      )}
    </div>
  );
}

export { Input };
