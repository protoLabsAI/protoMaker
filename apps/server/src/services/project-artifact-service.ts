/**
 * ProjectArtifactService — persist and retrieve project artifacts.
 *
 * Artifacts are stored at:
 *   {projectPath}/.automaker/projects/{slug}/artifacts/{type}/{id}.json
 *
 * Each file stores a ProjectArtifact (id, type, timestamp, content).
 *
 * An index file is maintained at:
 *   {projectPath}/.automaker/projects/{slug}/artifacts/index.json
 */

import path from 'path';
import fs from 'fs';
import { createLogger } from '@protolabsai/utils';
import { getProjectDir } from '@protolabsai/platform';
import type {
  ArtifactType,
  ArtifactIndexEntry,
  ArtifactIndex,
  ProjectArtifact,
} from '@protolabsai/types';

const logger = createLogger('ProjectArtifactService');

const ARTIFACTS_DIR = 'artifacts';
const INDEX_FILE = 'index.json';

function getArtifactsDir(projectPath: string, slug: string): string {
  return path.join(getProjectDir(projectPath, slug), ARTIFACTS_DIR);
}

function getIndexPath(projectPath: string, slug: string): string {
  return path.join(getArtifactsDir(projectPath, slug), INDEX_FILE);
}

export class ProjectArtifactService {
  /**
   * Save an artifact to disk and update the index.
   *
   * @returns The artifact ID (used for retrieval via getArtifact)
   */
  async saveArtifact(
    projectPath: string,
    slug: string,
    type: ArtifactType,
    content: unknown
  ): Promise<string> {
    const timestamp = new Date().toISOString();
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const filename = `${id}.json`;

    const artifactsDir = getArtifactsDir(projectPath, slug);
    const typeDir = path.join(artifactsDir, type);
    const artifactFile = path.join(typeDir, filename);

    // Ensure type directory exists (also creates artifacts dir)
    await fs.promises.mkdir(typeDir, { recursive: true });

    // Write artifact record
    const artifact: ProjectArtifact = { id, type, timestamp, content };
    await fs.promises.writeFile(artifactFile, JSON.stringify(artifact, null, 2), 'utf-8');

    // Update index
    const indexPath = getIndexPath(projectPath, slug);
    const index = await this._readIndex(indexPath);
    const entry: ArtifactIndexEntry = { id, type, timestamp, filename };
    index.entries.push(entry);
    await fs.promises.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf-8');

    logger.debug(`Saved artifact ${id} (type=${type}) for project ${slug}`);
    return id;
  }

  /**
   * List artifact index entries for a project, optionally filtered by type.
   */
  async listArtifacts(
    projectPath: string,
    slug: string,
    type?: ArtifactType
  ): Promise<ArtifactIndexEntry[]> {
    const indexPath = getIndexPath(projectPath, slug);
    const index = await this._readIndex(indexPath);
    if (type) {
      return index.entries.filter((e: ArtifactIndexEntry) => e.type === type);
    }
    return index.entries;
  }

  /**
   * Retrieve the full content of an artifact by ID.
   *
   * @throws if the artifact is not found in the index or file is missing
   */
  async getArtifact(projectPath: string, slug: string, artifactId: string): Promise<unknown> {
    const indexPath = getIndexPath(projectPath, slug);
    const index = await this._readIndex(indexPath);
    const entry = index.entries.find((e: ArtifactIndexEntry) => e.id === artifactId);
    if (!entry) {
      throw new Error(`Artifact not found: ${artifactId} (project=${slug})`);
    }
    const artifactFile = path.join(getArtifactsDir(projectPath, slug), entry.type, entry.filename);
    const raw = await fs.promises.readFile(artifactFile, 'utf-8');
    const artifact = JSON.parse(raw) as ProjectArtifact;
    return artifact.content;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async _readIndex(indexPath: string): Promise<ArtifactIndex> {
    try {
      const raw = await fs.promises.readFile(indexPath, 'utf-8');
      return JSON.parse(raw) as ArtifactIndex;
    } catch {
      return { version: 1, entries: [] };
    }
  }
}

export const projectArtifactService = new ProjectArtifactService();
