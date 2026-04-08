/**
 * ProjectRegistryService — Fleet-wide project registry sourced from Workstacean.
 *
 * Fetches from Workstacean's GET /api/projects?includeState=true on startup and
 * every 60 seconds. Falls back to the local workspace/projects.yaml snapshot when
 * Workstacean is unreachable. After each successful remote fetch, writes a JSON
 * cache to .automaker/cache/projects-registry.json so the fallback is always fresh.
 */

import { readFileSync, existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { createLogger } from '@protolabsai/utils';

const logger = createLogger('ProjectRegistryService');

export interface RegistryProjectOperationalState {
  board: { backlog: number; inProgress: number; blocked: number };
  autoMode: { running: boolean };
  activeAgents: number;
}

export interface ProjectDiscordChannel {
  channelId?: string;
  webhook?: string;
}

export interface ProjectDiscordConfig {
  dev?: ProjectDiscordChannel;
  release?: ProjectDiscordChannel;
}

export interface ProjectRegistryEntry {
  slug: string;
  title?: string;
  team?: string;
  github?: string;
  repoUrl?: string;
  defaultBranch?: string;
  status?: string;
  projectPath?: string;
  studioUrl?: string;
  agents?: string[];
  discord?: ProjectDiscordConfig;
  operationalState?: RegistryProjectOperationalState | { state: 'unreachable' };
  [key: string]: unknown;
}

interface WorkstaceanProjectsResponse {
  success: boolean;
  data: ProjectRegistryEntry[];
}

const POLL_INTERVAL_MS = 60_000;
const DEFAULT_WORKSTACEAN_URL = 'http://workstacean:8082';

export class ProjectRegistryService {
  private projects: ProjectRegistryEntry[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly workstaceanUrl: string;
  private readonly localSnapshotPath: string;
  private readonly cachePath: string;

  constructor({ projectRoot }: { projectRoot: string }) {
    this.workstaceanUrl = process.env.WORKSTACEAN_URL ?? DEFAULT_WORKSTACEAN_URL;
    this.localSnapshotPath = join(projectRoot, 'workspace', 'projects.yaml');
    this.cachePath = join(projectRoot, '.automaker', 'cache', 'projects-registry.json');
  }

  async start(): Promise<void> {
    await this.refresh();
    this.timer = setInterval(() => {
      this.refresh().catch((err) => {
        logger.error('Registry refresh failed:', err instanceof Error ? err.message : String(err));
      });
    }, POLL_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  getProjects(): ProjectRegistryEntry[] {
    return this.projects;
  }

  getProject(slug: string): ProjectRegistryEntry | null {
    return this.projects.find((p) => p.slug === slug) ?? null;
  }

  private async refresh(): Promise<void> {
    try {
      const entries = await this.fetchFromWorkstacean();
      this.projects = entries;
      await this.writeCache(entries);
      logger.info(`Registry refreshed: ${entries.length} projects`);
    } catch (err) {
      logger.warn(
        'Workstacean unreachable, falling back to local snapshot:',
        err instanceof Error ? err.message : String(err)
      );
      this.projects = this.loadFromLocalSnapshot();
    }
  }

  private async fetchFromWorkstacean(): Promise<ProjectRegistryEntry[]> {
    const res = await fetch(`${this.workstaceanUrl}/api/projects?includeState=true`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      throw new Error(`Workstacean returned HTTP ${res.status}`);
    }
    const body = (await res.json()) as WorkstaceanProjectsResponse;
    if (!body.success) {
      throw new Error('Workstacean returned success: false');
    }
    return body.data;
  }

  private loadFromLocalSnapshot(): ProjectRegistryEntry[] {
    // Prefer the JSON cache (most recently fetched data)
    if (existsSync(this.cachePath)) {
      try {
        const raw = readFileSync(this.cachePath, 'utf8');
        return JSON.parse(raw) as ProjectRegistryEntry[];
      } catch {
        // Fall through to YAML snapshot
      }
    }
    // Fall back to workspace/projects.yaml
    if (existsSync(this.localSnapshotPath)) {
      try {
        const raw = readFileSync(this.localSnapshotPath, 'utf8');
        const parsed = parseYaml(raw) as Record<string, unknown>;
        return (parsed['projects'] ?? []) as ProjectRegistryEntry[];
      } catch {
        // Nothing to load
      }
    }
    return [];
  }

  private async writeCache(entries: ProjectRegistryEntry[]): Promise<void> {
    const dir = dirname(this.cachePath);
    await mkdir(dir, { recursive: true });
    await writeFile(this.cachePath, JSON.stringify(entries, null, 2), 'utf8');
  }
}
