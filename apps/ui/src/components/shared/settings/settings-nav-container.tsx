import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@protolabs-ai/ui/atoms';

interface SettingsNavContainerProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  testId?: string;
}

export function SettingsNavContainer({
  isOpen,
  onClose,
  children,
  testId = 'settings-nav-backdrop',
}: SettingsNavContainerProps) {
  return (
    <>
      {/* Mobile backdrop overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={onClose}
          data-testid={testId}
        />
      )}

      {/* Navigation sidebar */}
      <nav
        className={cn(
          'fixed inset-y-0 right-0 w-72 z-30',
          'transition-transform duration-200 ease-out',
          isOpen ? 'translate-x-0' : 'translate-x-full',
          'lg:relative lg:w-64 lg:z-auto lg:translate-x-0',
          'shrink-0 overflow-y-auto',
          'border-l border-border/50 lg:border-l-0 lg:border-r',
          'bg-gradient-to-b from-card/95 via-card/90 to-card/85 backdrop-blur-xl',
          'lg:from-card/80 lg:via-card/60 lg:to-card/40'
        )}
      >
        {/* Mobile close button */}
        <div className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-border/50">
          <span className="text-sm font-semibold text-foreground">Navigation</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
            aria-label="Close navigation menu"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="sticky top-0 p-4 space-y-1">{children}</div>
      </nav>
    </>
  );
}
