/**
 * Event Flow Hook
 *
 * Fetches webhook delivery records from GET /api/ops/deliveries and provides
 * retry capability for failed deliveries.
 * Auto-refreshes every 60 seconds.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiGet, apiPost } from '@/lib/api-fetch';

export type DeliveryStatus = 'received' | 'completed' | 'failed';

export interface DeliveryRecord {
  deliveryId: string;
  source: string;
  eventType: string;
  status: DeliveryStatus;
  classification?: {
    category: 'ops' | 'gtm';
    intent: string;
  };
  routedTo?: string;
  featureId?: string;
  error?: string;
  durationMs?: number;
  createdAt: string;
  completedAt?: string;
}

interface DeliveriesResponse {
  success: boolean;
  deliveries: DeliveryRecord[];
  total: number;
}

interface DeliveryDetailResponse {
  success: boolean;
  delivery: DeliveryRecord;
}

interface RetryResponse {
  success: boolean;
  result?: unknown;
  error?: string;
}

interface UseEventFlowOptions {
  /** Maximum deliveries to fetch (default 50) */
  limit?: number;
  /** Filter by source */
  source?: string;
  /** Filter by status */
  status?: DeliveryStatus;
}

interface UseEventFlowResult {
  deliveries: DeliveryRecord[];
  isLoading: boolean;
  isMutating: boolean;
  error: string | null;
  refetch: () => void;
  retryDelivery: (id: string) => Promise<boolean>;
  getDeliveryDetail: (id: string) => Promise<DeliveryRecord | null>;
}

const REFRESH_INTERVAL_MS = 60_000;

export function useEventFlow(options: UseEventFlowOptions = {}): UseEventFlowResult {
  const { limit = 50, source, status } = options;
  const [deliveries, setDeliveries] = useState<DeliveryRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchIdRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchDeliveries = useCallback(async () => {
    const fetchId = ++fetchIdRef.current;
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      if (source) params.set('source', source);
      if (status) params.set('status', status);

      const result = await apiGet<DeliveriesResponse>(`/api/ops/deliveries?${params.toString()}`);
      if (fetchId !== fetchIdRef.current) return;

      if (result.success) {
        setDeliveries(result.deliveries);
      } else {
        setError('Failed to fetch deliveries');
        setDeliveries([]);
      }
    } catch (err) {
      if (fetchId !== fetchIdRef.current) return;
      setError(err instanceof Error ? err.message : 'Failed to fetch deliveries');
      setDeliveries([]);
    } finally {
      if (fetchId === fetchIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [limit, source, status]);

  useEffect(() => {
    fetchDeliveries();
    intervalRef.current = setInterval(fetchDeliveries, REFRESH_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchDeliveries]);

  const retryDelivery = useCallback(
    async (id: string): Promise<boolean> => {
      setIsMutating(true);
      try {
        const result = await apiPost<RetryResponse>(`/api/ops/deliveries/${id}/retry`);
        if (result.success) {
          await fetchDeliveries();
          return true;
        }
        throw new Error(result.error ?? 'Failed to retry delivery');
      } finally {
        setIsMutating(false);
      }
    },
    [fetchDeliveries]
  );

  const getDeliveryDetail = useCallback(async (id: string): Promise<DeliveryRecord | null> => {
    try {
      const result = await apiGet<DeliveryDetailResponse>(`/api/ops/deliveries/${id}`);
      if (result.success) {
        return result.delivery;
      }
      return null;
    } catch {
      return null;
    }
  }, []);

  return {
    deliveries,
    isLoading,
    isMutating,
    error,
    refetch: fetchDeliveries,
    retryDelivery,
    getDeliveryDetail,
  };
}
