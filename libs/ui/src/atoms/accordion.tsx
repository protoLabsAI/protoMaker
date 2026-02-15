/* eslint-disable @typescript-eslint/no-empty-object-type */

import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../lib/utils.js';

type AccordionType = 'single' | 'multiple';

interface AccordionContextValue {
  type: AccordionType;
  value: string | string[];
  onValueChange: (value: string) => void;
  collapsible?: boolean;
}

const AccordionContext = React.createContext<AccordionContextValue | null>(null);

interface AccordionProps extends React.HTMLAttributes<HTMLDivElement> {
  type?: 'single' | 'multiple';
  value?: string | string[];
  defaultValue?: string | string[];
  onValueChange?: (value: string | string[]) => void;
  collapsible?: boolean;
}

const Accordion = React.forwardRef<HTMLDivElement, AccordionProps>(
  (
    {
      type = 'single',
      value,
      defaultValue,
      onValueChange,
      collapsible = false,
      className,
      children,
      ...props
    },
    ref
  ) => {
    const [internalValue, setInternalValue] = React.useState<string | string[]>(() => {
      if (value !== undefined) return value;
      if (defaultValue !== undefined) return defaultValue;
      return type === 'single' ? '' : [];
    });

    const currentValue = value !== undefined ? value : internalValue;

    const handleValueChange = React.useCallback(
      (itemValue: string) => {
        let newValue: string | string[];

        if (type === 'single') {
          if (currentValue === itemValue && collapsible) {
            newValue = '';
          } else if (currentValue === itemValue && !collapsible) {
            return;
          } else {
            newValue = itemValue;
          }
        } else {
          const currentArray = Array.isArray(currentValue)
            ? currentValue
            : [currentValue].filter(Boolean);
          if (currentArray.includes(itemValue)) {
            newValue = currentArray.filter((v) => v !== itemValue);
          } else {
            newValue = [...currentArray, itemValue];
          }
        }

        if (value === undefined) {
          setInternalValue(newValue);
        }
        onValueChange?.(newValue);
      },
      [type, currentValue, collapsible, value, onValueChange]
    );

    const contextValue = React.useMemo(
      () => ({
        type,
        value: currentValue,
        onValueChange: handleValueChange,
        collapsible,
      }),
      [type, currentValue, handleValueChange, collapsible]
    );

    return (
      <AccordionContext.Provider value={contextValue}>
        <div ref={ref} data-slot="accordion" className={cn('w-full', className)} {...props}>
          {children}
        </div>
      </AccordionContext.Provider>
    );
  }
);
Accordion.displayName = 'Accordion';

interface AccordionItemContextValue {
  value: string;
  isOpen: boolean;
}

const AccordionItemContext = React.createContext<AccordionItemContextValue | null>(null);

interface AccordionItemProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
}

const AccordionItem = React.forwardRef<HTMLDivElement, AccordionItemProps>(
  ({ className, value, children, ...props }, ref) => {
    const accordionContext = React.useContext(AccordionContext);

    if (!accordionContext) {
      throw new Error('AccordionItem must be used within an Accordion');
    }

    const isOpen = Array.isArray(accordionContext.value)
      ? accordionContext.value.includes(value)
      : accordionContext.value === value;

    const contextValue = React.useMemo(() => ({ value, isOpen }), [value, isOpen]);

    return (
      <AccordionItemContext.Provider value={contextValue}>
        <div
          ref={ref}
          data-slot="accordion-item"
          data-state={isOpen ? 'open' : 'closed'}
          className={cn('border-b border-border', className)}
          {...props}
        >
          {children}
        </div>
      </AccordionItemContext.Provider>
    );
  }
);
AccordionItem.displayName = 'AccordionItem';

interface AccordionTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {}

const AccordionTrigger = React.forwardRef<HTMLButtonElement, AccordionTriggerProps>(
  ({ className, children, ...props }, ref) => {
    const accordionContext = React.useContext(AccordionContext);
    const itemContext = React.useContext(AccordionItemContext);

    if (!accordionContext || !itemContext) {
      throw new Error('AccordionTrigger must be used within an AccordionItem');
    }

    const { onValueChange } = accordionContext;
    const { value, isOpen } = itemContext;

    return (
      <div data-slot="accordion-header" className="flex">
        <button
          ref={ref}
          type="button"
          data-slot="accordion-trigger"
          data-state={isOpen ? 'open' : 'closed'}
          aria-expanded={isOpen}
          onClick={() => onValueChange(value)}
          className={cn(
            'flex flex-1 items-center justify-between py-4 font-medium transition-all hover:underline [&[data-state=open]>svg]:rotate-180',
            className
          )}
          {...props}
        >
          {children}
          <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200" />
        </button>
      </div>
    );
  }
);
AccordionTrigger.displayName = 'AccordionTrigger';

interface AccordionContentProps extends React.HTMLAttributes<HTMLDivElement> {}

const AccordionContent = React.forwardRef<HTMLDivElement, AccordionContentProps>(
  ({ className, children, ...props }, ref) => {
    const itemContext = React.useContext(AccordionItemContext);
    const contentRef = React.useRef<HTMLDivElement>(null);
    const [height, setHeight] = React.useState<number | undefined>(undefined);

    if (!itemContext) {
      throw new Error('AccordionContent must be used within an AccordionItem');
    }

    const { isOpen } = itemContext;

    React.useEffect(() => {
      if (contentRef.current && typeof ResizeObserver !== 'undefined') {
        const resizeObserver = new ResizeObserver((entries: ResizeObserverEntry[]) => {
          for (const entry of entries) {
            setHeight(entry.contentRect.height);
          }
        });
        resizeObserver.observe(contentRef.current);
        return () => resizeObserver.disconnect();
      }
    }, []);

    return (
      <div
        data-slot="accordion-content"
        data-state={isOpen ? 'open' : 'closed'}
        className="overflow-hidden text-sm transition-all duration-200 ease-out"
        style={{
          height: isOpen ? (height !== undefined ? `${height}px` : 'auto') : 0,
          opacity: isOpen ? 1 : 0,
        }}
        {...props}
      >
        <div ref={contentRef}>
          <div ref={ref} className={cn('pb-4 pt-0', className)}>
            {children}
          </div>
        </div>
      </div>
    );
  }
);
AccordionContent.displayName = 'AccordionContent';

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
