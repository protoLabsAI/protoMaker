/**
 * Step Detail Dialog
 *
 * Displays details of a pipeline step node including:
 * - Input/output data as formatted JSON
 * - Duration and processing notes
 * - Langfuse span link (when available)
 */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ExternalLink, Clock } from 'lucide-react';
import type { PipelineStepNodeData } from '../types';

export interface StepDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  step: PipelineStepNodeData | null;
}

/**
 * Format milliseconds to human-readable duration
 */
function formatDuration(startTime?: number, endTime?: number): string {
  if (!startTime) return 'N/A';
  const end = endTime || Date.now();
  const durationMs = end - startTime;
  const seconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/**
 * Format JSON with proper indentation
 */
function formatJSON(data: unknown): string {
  if (data === undefined || data === null) return 'N/A';
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}

/**
 * Extract Langfuse span ID from step data
 */
function getSpanId(step: PipelineStepNodeData): string | undefined {
  // Check common locations for spanId
  if ('spanId' in step && typeof step.spanId === 'string') {
    return step.spanId;
  }
  return undefined;
}

/**
 * Get Langfuse URL for a span
 */
function getLangfuseUrl(spanId: string): string {
  const baseUrl = process.env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com';
  return `${baseUrl}/trace/${spanId}`;
}

export function StepDetailDialog({ open, onOpenChange, step }: StepDetailDialogProps) {
  if (!step) return null;

  const spanId = getSpanId(step);
  const duration = formatDuration(step.startTime, step.endTime);
  const inputData = 'input' in step ? step.input : undefined;
  const outputData = 'output' in step ? step.output : undefined;
  const notes = 'notes' in step && Array.isArray(step.notes) ? step.notes : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-base">{step.label}</DialogTitle>
              <DialogDescription className="text-xs">Pipeline Step: {step.step}</DialogDescription>
            </div>
            {spanId && (
              <Button
                variant="ghost"
                size="sm"
                className="gap-2"
                onClick={() => window.open(getLangfuseUrl(spanId), '_blank')}
              >
                <ExternalLink className="w-3.5 h-3.5" />
                View in Langfuse
              </Button>
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4">
          {/* Status and Duration */}
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Status:</span>
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  step.status === 'completed'
                    ? 'bg-green-500/20 text-green-400'
                    : step.status === 'active'
                      ? 'bg-blue-500/20 text-blue-400'
                      : step.status === 'error'
                        ? 'bg-red-500/20 text-red-400'
                        : 'bg-gray-500/20 text-gray-400'
                }`}
              >
                {step.status}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">Duration:</span>
              <span>{duration}</span>
            </div>
          </div>

          {/* Assignee */}
          {step.assignee && (
            <div className="text-sm">
              <span className="text-muted-foreground">Assignee:</span>
              <span className="ml-2">{step.assignee}</span>
            </div>
          )}

          {/* Processing Notes */}
          {notes.length > 0 && (
            <div>
              <h3 className="text-sm font-medium mb-2">Processing Notes</h3>
              <div className="space-y-1">
                {notes.map((note, idx) => (
                  <div
                    key={idx}
                    className="text-sm text-muted-foreground bg-muted/50 rounded px-3 py-2"
                  >
                    {String(note)}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Input Data */}
          <div>
            <h3 className="text-sm font-medium mb-2">Input</h3>
            <pre className="text-xs bg-muted/50 rounded p-3 overflow-x-auto">
              <code>{formatJSON(inputData)}</code>
            </pre>
          </div>

          {/* Output Data */}
          <div>
            <h3 className="text-sm font-medium mb-2">Output</h3>
            <pre className="text-xs bg-muted/50 rounded p-3 overflow-x-auto">
              <code>{formatJSON(outputData)}</code>
            </pre>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
