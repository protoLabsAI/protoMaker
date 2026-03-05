/**
 * ProjectPMService — in-memory session store for the Project PM Agent.
 *
 * Maintains Map<string, PMSession> keyed by '{projectPath}:{projectSlug}'.
 * Sessions are auto-created on project:lifecycle:launched and archived
 * (written to pm-session-archived.json) on project:completed.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { ModelMessage } from 'ai';
import { createLogger } from '@protolabsai/utils';
import { getProjectDir } from '@protolabsai/platform';

const logger = createLogger('ProjectPMService');

export interface PMSession {
  projectPath: string;
  projectSlug: string;
  messages: ModelMessage[];
  createdAt: string;
  lastActiveAt: string;
}

export class ProjectPMService {
  private sessions = new Map<string, PMSession>();

  private sessionKey(projectPath: string, projectSlug: string): string {
    return `${projectPath}:${projectSlug}`;
  }

  getSession(projectPath: string, projectSlug: string): PMSession | undefined {
    return this.sessions.get(this.sessionKey(projectPath, projectSlug));
  }

  listSessions(): PMSession[] {
    return Array.from(this.sessions.values());
  }

  getOrCreateSession(projectPath: string, projectSlug: string): PMSession {
    const key = this.sessionKey(projectPath, projectSlug);
    const existing = this.sessions.get(key);
    if (existing) return existing;

    const session: PMSession = {
      projectPath,
      projectSlug,
      messages: [],
      createdAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
    };
    this.sessions.set(key, session);
    logger.info(`PM session created for ${projectSlug} at ${projectPath}`);
    return session;
  }

  appendSystemMessage(projectPath: string, projectSlug: string, content: string): void {
    const session = this.getOrCreateSession(projectPath, projectSlug);
    session.messages.push({ role: 'system', content });
    session.lastActiveAt = new Date().toISOString();
  }

  appendMessages(projectPath: string, projectSlug: string, messages: ModelMessage[]): void {
    const session = this.getOrCreateSession(projectPath, projectSlug);
    session.messages.push(...messages);
    session.lastActiveAt = new Date().toISOString();
  }

  async archiveSession(projectPath: string, projectSlug: string): Promise<void> {
    const key = this.sessionKey(projectPath, projectSlug);
    const session = this.sessions.get(key);
    if (!session) return;

    try {
      const projectDir = getProjectDir(projectPath, projectSlug);
      const archivePath = path.join(projectDir, 'pm-session-archived.json');
      await fs.writeFile(archivePath, JSON.stringify(session, null, 2), 'utf-8');
      logger.info(`PM session archived for ${projectSlug} at ${archivePath}`);
    } catch (err) {
      logger.warn(`Failed to archive PM session for ${projectSlug}:`, err);
    }

    this.sessions.delete(key);
  }
}
