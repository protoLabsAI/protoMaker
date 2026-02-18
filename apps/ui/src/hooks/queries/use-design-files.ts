/**
 * Design Files Query Hooks
 *
 * React Query hooks for listing and reading .pen design files.
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';

const DESIGN_LIST_STALE_TIME = 30 * 1000; // 30 seconds
const DESIGN_FILE_STALE_TIME = 60 * 1000; // 1 minute

export interface DesignFileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: DesignFileEntry[];
}

interface DesignListResponse {
  success: boolean;
  files: DesignFileEntry[];
}

interface DesignReadResponse {
  success: boolean;
  content: string;
}

async function fetchDesignList(projectPath: string): Promise<DesignFileEntry[]> {
  const response = await fetch('/api/designs/list', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectPath }),
  });

  if (!response.ok) {
    throw new Error(`Failed to list designs: ${response.statusText}`);
  }

  const data: DesignListResponse = await response.json();
  if (!data.success) {
    throw new Error('Failed to list designs');
  }

  return data.files;
}

async function fetchDesignFile(projectPath: string, filePath: string): Promise<string> {
  const response = await fetch('/api/designs/read', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectPath, filePath }),
  });

  if (!response.ok) {
    throw new Error(`Failed to read design: ${response.statusText}`);
  }

  const data: DesignReadResponse = await response.json();
  if (!data.success) {
    throw new Error('Failed to read design file');
  }

  return data.content;
}

/**
 * Fetch the design file tree for a project.
 */
export function useDesignFileList(projectPath: string | undefined) {
  return useQuery({
    queryKey: queryKeys.designs.list(projectPath ?? ''),
    queryFn: () => fetchDesignList(projectPath!),
    enabled: !!projectPath,
    staleTime: DESIGN_LIST_STALE_TIME,
    retry: 1,
  });
}

/**
 * Fetch and return the raw JSON content of a .pen file.
 */
export function useDesignFile(projectPath: string | undefined, filePath: string | null) {
  return useQuery({
    queryKey: queryKeys.designs.file(projectPath ?? '', filePath ?? ''),
    queryFn: () => fetchDesignFile(projectPath!, filePath!),
    enabled: !!projectPath && !!filePath,
    staleTime: DESIGN_FILE_STALE_TIME,
    retry: 1,
  });
}
