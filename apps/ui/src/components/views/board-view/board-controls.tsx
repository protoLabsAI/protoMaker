import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@protolabs/ui/atoms';
import { ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BoardControlsProps {
  isMounted: boolean;
  onShowBoardBackground: () => void;
}

export function BoardControls({ isMounted, onShowBoardBackground }: BoardControlsProps) {
  if (!isMounted) return null;

  return (
    <TooltipProvider>
      <div className="flex items-center gap-5">
        {/* Board Background Button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onShowBoardBackground}
              className={cn(
                'inline-flex h-8 items-center justify-center rounded-md px-2 text-sm font-medium transition-all duration-200 cursor-pointer',
                'text-muted-foreground hover:text-foreground hover:bg-accent',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                'border border-border'
              )}
              data-testid="board-background-button"
            >
              <ImageIcon className="w-4 h-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Board Background Settings</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
