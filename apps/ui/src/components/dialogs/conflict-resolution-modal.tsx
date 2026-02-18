import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@protolabs/ui/atoms';
import { Button } from '@protolabs/ui/atoms';
import { Badge } from '@protolabs/ui/atoms';
import { apiGet, apiPost } from '@/lib/api-fetch';
import { AlertTriangle, ArrowLeft, ArrowRight, Check } from 'lucide-react';

interface SyncConflict {
  featureId: string;
  lastSyncTimestamp: number;
  lastSyncStatus: string;
  linearIssueId?: string;
  syncSource?: 'automaker' | 'linear';
  lastLinearState?: string;
  conflictDetected: boolean;
}

interface ConflictResolutionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Strategy = 'accept-linear' | 'accept-automaker' | 'manual';

export function ConflictResolutionModal({ open, onOpenChange }: ConflictResolutionModalProps) {
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState<string | null>(null);

  const fetchConflicts = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiGet<{ success: boolean; conflicts: SyncConflict[] }>(
        '/api/linear/conflicts'
      );
      if (result.success) {
        setConflicts(result.conflicts);
      }
    } catch {
      // Silently handle - conflicts may not be available if sync is disabled
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchConflicts();
    }
  }, [open, fetchConflicts]);

  const handleResolve = async (featureId: string, strategy: Strategy) => {
    setResolving(featureId);
    try {
      await apiPost('/api/linear/resolve-conflict', { featureId, strategy });
      setConflicts((prev) => prev.filter((c) => c.featureId !== featureId));
    } catch {
      // Error handling - conflict may have already been resolved
    } finally {
      setResolving(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Sync Conflicts
          </DialogTitle>
          <DialogDescription>
            These features received updates from both Linear and Automaker within a short window.
            Choose which state to keep.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-80 space-y-3 overflow-y-auto">
          {loading && <p className="text-muted-foreground py-4 text-center text-sm">Loading...</p>}

          {!loading && conflicts.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-6">
              <Check className="text-success h-8 w-8" />
              <p className="text-muted-foreground text-sm">No sync conflicts detected</p>
            </div>
          )}

          {conflicts.map((conflict) => (
            <div key={conflict.featureId} className="bg-muted/50 space-y-2 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <code className="text-xs">{conflict.featureId.slice(0, 20)}...</code>
                <Badge variant="warning" size="sm">
                  Conflict
                </Badge>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Last sync:</span>
                <span>{conflict.syncSource === 'linear' ? 'Linear' : 'Automaker'}</span>
                {conflict.lastLinearState && (
                  <>
                    <span className="text-muted-foreground">|</span>
                    <span>Linear state: {conflict.lastLinearState}</span>
                  </>
                )}
              </div>

              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 flex-1 text-xs"
                  disabled={resolving === conflict.featureId}
                  onClick={() => handleResolve(conflict.featureId, 'accept-linear')}
                >
                  <ArrowLeft className="mr-1 h-3 w-3" />
                  Keep Linear
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 flex-1 text-xs"
                  disabled={resolving === conflict.featureId}
                  onClick={() => handleResolve(conflict.featureId, 'accept-automaker')}
                >
                  <ArrowRight className="mr-1 h-3 w-3" />
                  Keep Automaker
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  disabled={resolving === conflict.featureId}
                  onClick={() => handleResolve(conflict.featureId, 'manual')}
                >
                  Dismiss
                </Button>
              </div>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
