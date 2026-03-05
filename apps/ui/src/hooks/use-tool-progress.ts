/**
 * useToolProgress — Subscribes to `chat:tool-progress` WebSocket events
 * and maintains a map of toolCallId -> current label.
 *
 * Returns `getProgressLabel(toolCallId)` for use by ChatMessage and
 * ToolInvocationPart to display live status during tool execution.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { getHttpApiClient } from '@/lib/http-api-client';
import type { EventType } from '@/lib/clients/base-http-client';

interface ToolProgressPayload {
  toolCallId: string;
  label: string;
  toolName?: string;
  timestamp: string;
}

export function useToolProgress() {
  const [labels, setLabels] = useState<Map<string, string>>(new Map());
  const labelsRef = useRef(labels);
  labelsRef.current = labels;

  useEffect(() => {
    const api = getHttpApiClient();
    const unsubscribe = api.subscribeToEvents((type: EventType, payload: unknown) => {
      if (type !== 'chat:tool-progress') return;
      const { toolCallId, label } = payload as ToolProgressPayload;
      if (!toolCallId || !label) return;

      setLabels((prev) => {
        const next = new Map(prev);
        next.set(toolCallId, label);
        return next;
      });
    });

    return unsubscribe;
  }, []);

  const getProgressLabel = useCallback(
    (toolCallId: string): string | undefined => {
      return labels.get(toolCallId);
    },
    [labels]
  );

  // Return the most recent active label (for the status bar)
  const activeLabel = labels.size > 0 ? [...labels.values()].pop() : undefined;

  return { getProgressLabel, activeLabel };
}
