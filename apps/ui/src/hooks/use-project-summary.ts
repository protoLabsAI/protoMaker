/**
 * useProjectSummary hook
 *
 * Fetches project summary data from /api/projects/:slug/summary
 */

import { useQuery } from '@tanstack/react-query';
import { useAppStore } from '@/store/app-store';
import {
  getServerUrlSync,
  getApiKey,
  getSessionToken,
  waitForApiKeyInit,
  NO_STORE_CACHE_MODE,
} from '@/lib/http-api-client';
import type { ArtifactIndexEntry } from '@protolabsai/types';

export interface ProjectSummaryData {
  slug: string;
  title: string;
  status: string;
  featuresTotal: number;
  featuresDone: number;
  artifactsCount: number;
  artifacts?: ArtifactIndexEntry[];
  lastActivityAt?: string;
  [key: string]: unknown;
}

async function fetchProjectSummary(
  projectPath: string,
  projectSlug: string
): Promise<ProjectSummaryData | null> {
  await waitForApiKeyInit();
  const serverUrl = getServerUrlSync();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const apiKey = getApiKey();
  if (apiKey) headers['X-API-Key'] = apiKey;
  const sessionToken = getSessionToken();
  if (sessionToken) headers['X-Session-Token'] = sessionToken;

  const response = await fetch(
    `${serverUrl}/api/projects/${encodeURIComponent(projectSlug)}/summary?projectPath=${encodeURIComponent(projectPath)}`,
    { headers, credentials: 'include', cache: NO_STORE_CACHE_MODE }
  );

  if (!response.ok) return null;
  const data = await response.json();
  return data.summary ?? data ?? null;
}

export function useProjectSummary(projectSlug: string | null) {
  const projectPath = useAppStore((s) => s.currentProject?.path) ?? '';

  return useQuery({
    queryKey: ['project-summary', projectPath, projectSlug],
    queryFn: () => fetchProjectSummary(projectPath, projectSlug!),
    enabled: !!projectPath && !!projectSlug,
    staleTime: 30000,
  });
}
