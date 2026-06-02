/**
 * Archived-feature query hooks (#4035)
 *
 * React Query hooks over the archive read API
 * (POST /api/projects/archives/{list,detail}). Archived features are immutable
 * once written, so a relaxed stale time is fine.
 */

import { useQuery } from '@tanstack/react-query';
import { getHttpApiClient } from '@/lib/http-api-client';
import { queryKeys } from '@/lib/query-keys';
import { STALE_TIMES } from '@/lib/query-client';
import type { ArchivedFeatureSummary, ArchivedFeatureDetail } from '@/lib/clients/system-client';

/**
 * List archived features for a project. Disabled when no projectPath or `enabled` is false
 * (so the request only fires while the Archived view is open).
 */
export function useArchivedFeatures(projectPath: string | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.archives.list(projectPath ?? ''),
    enabled: enabled && !!projectPath,
    staleTime: STALE_TIMES.SESSIONS,
    queryFn: async (): Promise<ArchivedFeatureSummary[]> => {
      const api = getHttpApiClient();
      const result = await api.archives.list(projectPath!);
      if (!result.success) {
        throw new Error(result.error || 'Failed to list archived features');
      }
      return result.archives ?? [];
    },
  });
}

/**
 * Fetch the full archived-feature detail (feature.json + agent output). Disabled until a
 * featureId is selected.
 */
export function useArchivedFeatureDetail(
  projectPath: string | undefined,
  featureId: string | undefined
) {
  return useQuery({
    queryKey: queryKeys.archives.detail(projectPath ?? '', featureId ?? ''),
    enabled: !!projectPath && !!featureId,
    staleTime: STALE_TIMES.SESSIONS,
    queryFn: async (): Promise<ArchivedFeatureDetail> => {
      const api = getHttpApiClient();
      const result = await api.archives.detail(projectPath!, featureId!);
      if (!result.success || !result.archive) {
        throw new Error(result.error || 'Failed to load archived feature detail');
      }
      return result.archive;
    },
  });
}
