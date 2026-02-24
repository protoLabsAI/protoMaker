/**
 * CopilotKit Thread Service
 *
 * Manages thread metadata for CopilotKit conversations.
 * Stores metadata in {DATA_DIR}/copilotkit-threads/{threadId}.json.
 * LangGraph state persistence is handled by MemorySaver (in-memory).
 */

import { readdir, readFile, writeFile, unlink, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createLogger } from '@protolabs-ai/utils';

const logger = createLogger('CopilotKitThreads');

export interface ThreadMetadata {
  id: string;
  title: string;
  agentName?: string;
  projectPath?: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export class CopilotKitThreadService {
  private threadsDir: string;

  constructor(dataDir: string) {
    this.threadsDir = join(dataDir, 'copilotkit-threads');
  }

  private async ensureDir(): Promise<void> {
    await mkdir(this.threadsDir, { recursive: true });
  }

  async listThreads(projectPath?: string): Promise<ThreadMetadata[]> {
    await this.ensureDir();

    try {
      const files = await readdir(this.threadsDir);
      const threads: ThreadMetadata[] = [];

      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        try {
          const content = await readFile(join(this.threadsDir, file), 'utf-8');
          const thread = JSON.parse(content) as ThreadMetadata;
          if (!projectPath || thread.projectPath === projectPath) {
            threads.push(thread);
          }
        } catch {
          // Skip corrupt files
        }
      }

      // Sort by updatedAt descending (most recent first)
      threads.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      return threads;
    } catch {
      return [];
    }
  }

  async getThread(threadId: string): Promise<ThreadMetadata | null> {
    try {
      const content = await readFile(join(this.threadsDir, `${threadId}.json`), 'utf-8');
      return JSON.parse(content) as ThreadMetadata;
    } catch {
      return null;
    }
  }

  async saveThread(thread: ThreadMetadata): Promise<void> {
    await this.ensureDir();
    await writeFile(join(this.threadsDir, `${thread.id}.json`), JSON.stringify(thread, null, 2));
    logger.debug(`Saved thread ${thread.id}: "${thread.title}"`);
  }

  async updateThread(
    threadId: string,
    updates: Partial<ThreadMetadata>
  ): Promise<ThreadMetadata | null> {
    const thread = await this.getThread(threadId);
    if (!thread) return null;

    const updated = { ...thread, ...updates, updatedAt: new Date().toISOString() };
    await this.saveThread(updated);
    return updated;
  }

  async deleteThread(threadId: string): Promise<boolean> {
    try {
      await unlink(join(this.threadsDir, `${threadId}.json`));
      logger.info(`Deleted thread ${threadId}`);
      return true;
    } catch {
      return false;
    }
  }
}
