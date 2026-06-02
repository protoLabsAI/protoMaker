/**
 * Archived Features modal (#4035)
 *
 * Read-only view over the archive API: lists a project's archived features
 * (POST /api/projects/archives/list) and opens a read-only detail panel for one
 * (POST /api/projects/archives/detail → feature.json + agent output + meta).
 *
 * Self-contained: fetches its own data via the archive query hooks while open.
 */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@protolabsai/ui/atoms';
import { Button, Card, CardHeader, CardTitle, CardDescription } from '@protolabsai/ui/atoms';
import { Archive, ArrowLeft, Loader2 } from 'lucide-react';
import { useState } from 'react';
import {
  useArchivedFeatures,
  useArchivedFeatureDetail,
} from '@/hooks/queries/use-archived-features';

interface ArchivedFeaturesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectPath: string | undefined;
}

function formatTimestamp(iso: string): string {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t).toLocaleString() : iso;
}

export function ArchivedFeaturesModal({
  open,
  onOpenChange,
  projectPath,
}: ArchivedFeaturesModalProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: archives = [], isLoading, isError, error } = useArchivedFeatures(projectPath, open);

  const detail = useArchivedFeatureDetail(projectPath, selectedId ?? undefined);

  // Reset selection whenever the modal closes so it reopens on the list.
  const handleOpenChange = (next: boolean) => {
    if (!next) setSelectedId(null);
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-6xl max-h-[90vh] flex flex-col"
        data-testid="archived-features-modal"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {selectedId && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={() => setSelectedId(null)}
                data-testid="archived-detail-back"
                title="Back to list"
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
            )}
            Archived Features
          </DialogTitle>
          <DialogDescription>
            {selectedId
              ? 'Read-only archived feature detail.'
              : isLoading
                ? 'Loading…'
                : `${archives.length} archived feature${archives.length === 1 ? '' : 's'}`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-4">
          {/* List view */}
          {!selectedId &&
            (isLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading archived features…
              </div>
            ) : isError ? (
              <div className="text-center text-destructive py-8" data-testid="archived-error">
                Failed to load archived features: {(error as Error)?.message ?? 'unknown error'}
              </div>
            ) : archives.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                <Archive className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No archived features</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {archives.map((a) => (
                  <Card
                    key={a.featureId}
                    className="flex flex-col cursor-pointer hover:border-brand-500 transition-colors"
                    onClick={() => setSelectedId(a.featureId)}
                    data-testid={`archived-card-${a.featureId}`}
                  >
                    <CardHeader className="p-3 pb-2 flex-1">
                      <CardTitle className="text-sm leading-tight line-clamp-3">
                        {a.title || a.featureId}
                      </CardTitle>
                      <CardDescription className="text-xs mt-1 flex items-center justify-between gap-2">
                        <span className="truncate">{a.isEpic ? 'Epic' : a.status}</span>
                        <span className="shrink-0 opacity-70">{formatTimestamp(a.archivedAt)}</span>
                      </CardDescription>
                    </CardHeader>
                  </Card>
                ))}
              </div>
            ))}

          {/* Detail view */}
          {selectedId &&
            (detail.isLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading detail…
              </div>
            ) : detail.isError || !detail.data ? (
              <div
                className="text-center text-destructive py-8"
                data-testid="archived-detail-error"
              >
                Failed to load detail: {(detail.error as Error)?.message ?? 'not found'}
              </div>
            ) : (
              <div className="space-y-4" data-testid="archived-detail">
                <div>
                  <h3 className="text-base font-semibold">
                    {detail.data.feature.title || detail.data.featureId}
                  </h3>
                  <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-4 gap-y-1">
                    <span>Status: {detail.data.feature.status}</span>
                    <span>Archived: {formatTimestamp(detail.data.meta.archivedAt)}</span>
                    {detail.data.feature.category && (
                      <span>Category: {detail.data.feature.category}</span>
                    )}
                  </div>
                </div>
                {detail.data.feature.description && (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-1">
                      Description
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{detail.data.feature.description}</p>
                  </div>
                )}
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-1">Agent output</div>
                  {detail.data.agentOutput ? (
                    <pre className="text-xs bg-muted rounded-md p-3 overflow-x-auto whitespace-pre-wrap max-h-[50vh]">
                      {detail.data.agentOutput}
                    </pre>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">
                      No agent output recorded.
                    </p>
                  )}
                </div>
              </div>
            ))}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => handleOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
