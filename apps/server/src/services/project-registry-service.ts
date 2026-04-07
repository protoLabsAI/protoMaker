/**
 * ProjectRegistryService
 *
 * Single source of truth for the org-wide project registry.
 * Reads from Workstacean GET /api/projects (authoritative), with fallback
 * to a locally cached workspace/projects.yaml snapshot when Workstacean is
 * unreachable.
 *
 * Used by:
 * - /api/registry/sync (reconcile settings.projects[] with registry)
 * - ava-cron-tasks stale PR check (replaces direct YAML parsing)
 * - Future: any service that needs fleet-wide project metadata
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { createLogger } from '@protolabsai/utils';

const logger = createLogger('ProjectRegistryService');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RegistryProjectDiscord {
  [channel: string]: string | undefined;
}

export interface RegistryProjectWebhooks {
  [name: string]: string | undefined;
}

export interface RegistryProjectCapacity {
  priorityWeight: number;
  minConcurrency: number;
  maxConcurrency: number;
}

/** Full project entry as defined in projects.yaml / Workstacean registry */
export interface RegistryProject {
  slug: string;
  title: string;
  team?: string;
  github?: string;
  defaultBranch?: string;
  status: 'active' | 'archived' | 'suspended';
  onboardedAt?: string;
  planeProjectId?: string;
  planeIdentifier?: string;
  projectPath: string;
  /** URL of the Studio (automaker) server managing this project, e.g. http://localhost:3008 */
  studioUrl?: string;
  agents?: string[];
  discord?: RegistryProjectDiscord;
  webhooks?: RegistryProjectWebhooks;
  infisical?: {
    projectId: string;
  };
  observability?: {
    langfuseProjectId: string;
  };
  googleWorkspace?: {
    driveFolderId: string;
    sharedDocId: string;
  };
  capacity?: RegistryProjectCapacity;
}

interface WorkstaceanProjectsResponse {
  success: boolean;
  data: RegistryProject[];
}

interface LocalProjectsYaml {
  projects?: RegistryProject[];
}

// ---------------------------------------------------------------------------
// ProjectRegistryService
// ---------------------------------------------------------------------------

export class ProjectRegistryService {
  private readonly workstaceanUrl: string;
  private readonly workstaceanApiKey: string;

  constructor() {
    this.workstaceanUrl = process.env['WORKSTACEAN_URL'] ?? 'http://workstacean:3000';
    this.workstaceanApiKey = process.env['WORKSTACEAN_API_KEY'] ?? '';
  }

  /**
   * Fetch the project registry, preferring Workstacean with local YAML fallback.
   *
   * @param projectPath - The current Studio projectPath, used to locate
   *                      workspace/projects.yaml for fallback.
   * @param useLocalFallback - When true (default), falls back to local YAML if
   *                           Workstacean is unreachable.
   */
  async getProjects(
    projectPath: string,
    useLocalFallback = true
  ): Promise<{ projects: RegistryProject[]; source: 'workstacean' | 'local-cache' }> {
    // Try Workstacean first
    try {
      const projects = await this.fetchFromWorkstacean();
      // Persist snapshot for future fallback
      if (useLocalFallback) {
        await this.saveLocalSnapshot(projectPath, projects).catch((err) => {
          logger.warn('Failed to persist registry snapshot:', err);
        });
      }
      return { projects, source: 'workstacean' };
    } catch (err) {
      logger.warn('Workstacean unreachable, falling back to local snapshot:', err);
    }

    if (!useLocalFallback) {
      throw new Error('Workstacean unreachable and local fallback disabled');
    }

    // Fall back to local cache
    const localProjects = await this.loadLocalSnapshot(projectPath);
    return { projects: localProjects, source: 'local-cache' };
  }

  /**
   * Fetch projects from Workstacean HTTP API.
   * Throws on network error or non-OK response.
   */
  private async fetchFromWorkstacean(): Promise<RegistryProject[]> {
    const url = `${this.workstaceanUrl}/api/projects`;
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };
    if (this.workstaceanApiKey) {
      headers['X-API-Key'] = this.workstaceanApiKey;
    }

    const res = await fetch(url, { headers, signal: AbortSignal.timeout(5_000) });
    if (!res.ok) {
      throw new Error(`Workstacean /api/projects returned ${res.status}: ${await res.text()}`);
    }

    const body = (await res.json()) as WorkstaceanProjectsResponse;
    if (!body.success || !Array.isArray(body.data)) {
      throw new Error(
        `Unexpected Workstacean response shape: ${JSON.stringify(body).slice(0, 200)}`
      );
    }

    logger.info(`Loaded ${body.data.length} projects from Workstacean`);
    return body.data;
  }

  /**
   * Read local workspace/projects.yaml as a fallback snapshot.
   */
  private async loadLocalSnapshot(projectPath: string): Promise<RegistryProject[]> {
    const yamlPath = join(projectPath, 'workspace', 'projects.yaml');
    if (!existsSync(yamlPath)) {
      logger.warn('No local workspace/projects.yaml found');
      return [];
    }

    const raw = await readFile(yamlPath, 'utf-8');
    const parsed = parseYaml(raw) as LocalProjectsYaml;
    const projects = parsed.projects ?? [];
    logger.info(`Loaded ${projects.length} projects from local workspace/projects.yaml`);
    return projects;
  }

  /**
   * Persist a snapshot of the registry to workspace/projects.yaml.
   * Called after each successful Workstacean fetch to keep the cache fresh.
   */
  private async saveLocalSnapshot(projectPath: string, projects: RegistryProject[]): Promise<void> {
    const yamlPath = join(projectPath, 'workspace', 'projects.yaml');
    const yamlDir = dirname(yamlPath);
    if (!existsSync(yamlDir)) {
      await mkdir(yamlDir, { recursive: true });
    }

    const header = [
      '# workspace/projects.yaml — protoLabs Studio Project Routing Index',
      '#',
      '# AUTO-GENERATED SNAPSHOT — Do not edit manually.',
      '# This file is refreshed from the Workstacean registry (GET /api/projects).',
      '# Edit the authoritative source: protoWorkstacean/workspace/projects.yaml',
      '#',
    ].join('\n');

    const content = `${header}\n${stringifyYaml({ projects })}`;
    await writeFile(yamlPath, content, 'utf-8');
    logger.debug(`Saved registry snapshot (${projects.length} projects) to ${yamlPath}`);
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

let _instance: ProjectRegistryService | null = null;

export function getProjectRegistryService(): ProjectRegistryService {
  if (!_instance) {
    _instance = new ProjectRegistryService();
  }
  return _instance;
}
