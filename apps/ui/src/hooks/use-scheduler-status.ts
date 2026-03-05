import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api-fetch';

const POLL_INTERVAL = 30000;

export interface SchedulerTask {
  id: string;
  name: string;
  enabled: boolean;
  cronExpression: string;
  nextRun: string | null;
  lastRun: string | null;
  executionCount: number;
  lastError: string | null;
  averageDurationMs: number | null;
}

export interface SchedulerStatusResult {
  tasks: SchedulerTask[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useSchedulerStatus(): SchedulerStatusResult {
  const [tasks, setTasks] = useState<SchedulerTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const fetchStatus = async () => {
    try {
      const res = await apiFetch('/api/automations/scheduler/status', 'GET');
      if (!res.ok) throw new Error(`Failed to fetch scheduler status: ${res.status}`);
      const data = await res.json();
      if (mountedRef.current) {
        setTasks((data.tasks ?? []) as SchedulerTask[]);
        setError(null);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to load scheduler status');
      }
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    setLoading(true);
    fetchStatus().finally(() => {
      if (mountedRef.current) setLoading(false);
    });

    const interval = setInterval(fetchStatus, POLL_INTERVAL);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, []);

  return { tasks, loading, error, refresh: fetchStatus };
}
