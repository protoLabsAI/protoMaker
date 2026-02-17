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
  running: boolean;
  lastCheck?: {
    timestamp: string;
    result: {
      severity: string;
      findings: Array<{
        severity: string;
        message: string;
      }>;
    };
    durationMs: number;
  };
  lastEscalation?: {
    timestamp: string;
    durationMs: number;
  };
  checkCount: number;
  escalationCount: number;
  displayName: string;
  templateName: string;
  defaultSchedule: string;
}

/** Server response: members keyed by id */
interface ServerCrewStatusResponse {
  success: boolean;
  enabled: boolean;
  members: Record<string, Omit<CrewMemberStatus, 'id'>>;
}

export interface CrewStatusResponse {
  enabled: boolean;
  members: CrewMemberStatus[];
}

/**
 * Fetch all crew member statuses.
 * Server returns members as Record<string, object> — we convert to array.
 */
export function useCrewStatus() {
  return useQuery({
    queryKey: queryKeys.crew.status(),
    queryFn: async (): Promise<CrewStatusResponse> => {
      const api = getHttpApiClient();
      const raw = (await api.crew.status()) as ServerCrewStatusResponse;
      const members = raw.members
        ? Object.entries(raw.members).map(([id, member]) => ({ id, ...member }))
        : [];
      return { enabled: raw.enabled, members };
    },
    staleTime: CREW_STATUS_STALE_TIME,
    refetchInterval: CREW_STATUS_STALE_TIME,
    refetchOnWindowFocus: false,
    retry: 2,
  });
}
