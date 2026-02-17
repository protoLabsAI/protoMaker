/**
 * Crew Status Query Hook
 *
 * React Query hook for fetching crew member status from GET /api/crew/status.
 */

import { useQuery } from '@tanstack/react-query';
import { getHttpApiClient } from '@/lib/http-api-client';
import { queryKeys } from '@/lib/query-keys';

const CREW_STATUS_STALE_TIME = 15 * 1000; // 15 seconds

export interface CrewMemberStatus {
  id: string;
  enabled: boolean;
  schedule: string;
  lastCheckTime: string | null;
  lastCheckResult: {
    severity: string;
    findings: Array<{
      severity: string;
      message: string;
    }>;
  } | null;
  isRunning: boolean;
  lastEscalationTime: string | null;
}

export interface CrewStatusResponse {
  members: CrewMemberStatus[];
}

/**
 * Fetch all crew member statuses
 */
export function useCrewStatus() {
  return useQuery({
    queryKey: queryKeys.crew.status(),
    queryFn: async (): Promise<CrewStatusResponse> => {
      const api = getHttpApiClient();
      return api.crew.status();
    },
    staleTime: CREW_STATUS_STALE_TIME,
    refetchInterval: CREW_STATUS_STALE_TIME,
    refetchOnWindowFocus: false,
    retry: 2,
  });
}
