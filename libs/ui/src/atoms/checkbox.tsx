import * as React from 'react';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check } from 'lucide-react';

import { cn } from '../lib/utils.js';

interface CheckboxProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'checked' | 'defaultChecked'
> {
  checked?: boolean | 'indeterminate';
  defaultChecked?: boolean | 'indeterminate';
  onCheckedChange?: (checked: boolean) => void;
  required?: boolean;
}

const CheckboxRoot = CheckboxPrimitive.Root as React.ForwardRefExoticComponent<
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root> & {
    children?: React.ReactNode;
    className?: string;
  } & React.RefAttributes<HTMLButtonElement>
>;

const CheckboxIndicator = CheckboxPrimitive.Indicator as React.ForwardRefExoticComponent<
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Indicator> & {
    children?: React.ReactNode;
    className?: string;
  } & React.RefAttributes<HTMLSpanElement>
>;

const Checkbox = React.forwardRef<HTMLButtonElement, CheckboxProps>(
  ({ className, onCheckedChange, children: _children, ...props }, ref) => (
    <CheckboxRoot
      ref={ref}
      className={cn(
        'peer h-4 w-4 shrink-0 rounded-sm border border-primary ring-offset-background cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground hover:border-primary/80',
        className
      )}
      onCheckedChange={(checked) => {
        // Handle indeterminate state by treating it as false for consumers expecting boolean
        if (onCheckedChange) {
          onCheckedChange(checked === true);
        }
      }}
      {...props}
    >
      <CheckboxIndicator className={cn('flex items-center justify-center text-current')}>
        <Check className="h-4 w-4" />
      </CheckboxIndicator>
    </CheckboxRoot>
  )
);
Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export { Checkbox };
