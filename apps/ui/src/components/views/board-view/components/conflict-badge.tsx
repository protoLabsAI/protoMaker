import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@protolabs/ui/atoms';
import { ConflictResolutionModal } from '@/components/dialogs/conflict-resolution-modal';
import { apiGet } from '@/lib/api-fetch';

/**
 * Conflict Badge - Shows sync conflict count in the board header.
 * Self-contained: fetches conflict count, renders badge, and manages modal.
 * Only visible when conflicts exist.
 */
export function ConflictBadge() {
  const [conflictCount, setConflictCount] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);

  const fetchCount = useCallback(async () => {
    try {
      const result = await apiGet<{ success: boolean; count: number }>('/api/linear/conflicts');
      if (result.success) {
        setConflictCount(result.count);
      }
    } catch {
      // Linear sync may not be enabled — ignore
    }
  }, []);

  useEffect(() => {
    fetchCount();
    const interval = setInterval(fetchCount, 30000);
    return () => clearInterval(interval);
  }, [fetchCount]);

  // Re-fetch when modal closes (conflicts may have been resolved)
  const handleModalChange = (open: boolean) => {
    setModalOpen(open);
    if (!open) {
      fetchCount();
    }
  };

  if (conflictCount === 0) return null;

  return (
    <>
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="relative flex items-center gap-1 px-2 h-8 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-medium hover:bg-amber-500/20 transition-colors"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>{conflictCount}</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            <p>
              {conflictCount} sync conflict{conflictCount !== 1 ? 's' : ''} detected
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <ConflictResolutionModal open={modalOpen} onOpenChange={handleModalChange} />
    </>
  );
}
