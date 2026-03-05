/**
 * PRD Service - SPARC PRD creation and management
 *
 * Helps Product Manager agents create, store, and manage SPARC-style
 * Product Requirements Documents.
 */

import type { EventEmitter } from '../lib/events.js';
import type { SPARCPrd } from '@protolabsai/types';
import { createLogger, atomicWriteJson, readJsonWithRecovery } from '@protolabsai/utils';
import { ensureAutomakerDir } from '@protolabsai/platform';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';

const logger = createLogger('PRDService');

/**
 * PRD metadata for tracking workflow
 */
export interface PRDMetadata {
  id: string;
  projectPath: string;
  status: 'draft' | 'review' | 'approved' | 'rejected';
  createdAt: string;
  updatedAt: string;
  createdBy: string; // Agent ID
  approvedBy?: string; // User ID/name
  approvedAt?: string;
  discordThreadId?: string; // Where PRD discussion happened
}

/**
 * Full PRD with metadata
 */
export interface PRDDocument {
  metadata: PRDMetadata;
  prd: SPARCPrd;
}

/**
 * PRDService - Manages SPARC PRD lifecycle
 *
 * Provides utilities for PM agents to:
 * - Create and format SPARC PRDs
 * - Save PRDs to disk
 * - Track PRD approval workflow
 * - Generate markdown for Discord
 */
export class PRDService {
  private static instance: PRDService;

  constructor(private events: EventEmitter) {}

  /**
   * Get singleton instance
   */
  static getInstance(events: EventEmitter): PRDService {
    if (!PRDService.instance) {
      PRDService.instance = new PRDService(events);
    }
    return PRDService.instance;
  }

  /**
   * Create a new PRD document
   */
  async createPRD(params: {
    projectPath: string;
    prd: SPARCPrd;
    agentId: string;
    discordThreadId?: string;
  }): Promise<PRDDocument> {
    const { projectPath, prd, agentId, discordThreadId } = params;

    // Generate PRD ID from situation summary
    const prdId = this.generatePRDId(prd.situation?.split('\n')[0] || 'untitled');

    const metadata: PRDMetadata = {
      id: prdId,
      projectPath,
      status: 'draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: agentId,
      discordThreadId,
    };

    const document: PRDDocument = {
      metadata,
      prd,
    };

    // Save to disk
    await this.savePRD(document);

    // Emit event
    this.events.emit('prd:created', {
      prdId,
      projectPath,
      agentId,
    });

    logger.info(`Created PRD: ${prdId} for project ${projectPath}`);

    return document;
  }

  /**
   * Update PRD status
   */
  async updatePRDStatus(
    prdId: string,
    projectPath: string,
    status: PRDMetadata['status'],
    approvedBy?: string
  ): Promise<PRDDocument> {
    const document = await this.loadPRD(prdId, projectPath);

    if (!document) {
      throw new Error(`PRD ${prdId} not found in ${projectPath}`);
    }

    document.metadata.status = status;
    document.metadata.updatedAt = new Date().toISOString();

    if (status === 'approved' && approvedBy) {
      document.metadata.approvedBy = approvedBy;
      document.metadata.approvedAt = new Date().toISOString();
    }

    await this.savePRD(document);

    // Emit event
    this.events.emit('prd:status:updated', {
      prdId,
      projectPath,
      status,
      approvedBy,
    });

    logger.info(`Updated PRD ${prdId} status to: ${status}`);

    return document;
  }

  /**
   * Format PRD as Discord markdown
   */
  formatForDiscord(document: PRDDocument): string {
    const { prd } = document;

    let markdown = `# Product Requirements Document\n\n`;

    if (prd.situation) {
      markdown += `## 📊 Situation\n${prd.situation}\n\n`;
    }

    if (prd.problem) {
      markdown += `## 🎯 Problem\n${prd.problem}\n\n`;
    }

    if (prd.approach) {
      markdown += `## 💡 Approach\n${prd.approach}\n\n`;
    }

    if (prd.results) {
      markdown += `## ✅ Results\n${prd.results}\n\n`;
    }

    if (prd.constraints) {
      markdown += `## ⚠️ Constraints\n${prd.constraints}\n\n`;
    }

    markdown += `---\n*Status: ${document.metadata.status}*\n`;
    markdown += `*Created: ${new Date(document.metadata.createdAt).toLocaleString()}*\n`;

    return markdown;
  }

  /**
   * Save PRD to disk
   */
  private async savePRD(document: PRDDocument): Promise<void> {
    const { projectPath } = document.metadata;
    const prdDir = await this.ensurePRDDirectory(projectPath);
    const prdPath = path.join(prdDir, `${document.metadata.id}.json`);

    await atomicWriteJson(prdPath, document);

    // Also save as markdown for easy reading
    const markdownPath = path.join(prdDir, `${document.metadata.id}.md`);
    const markdown = this.formatForDiscord(document);
    await writeFile(markdownPath, markdown, 'utf-8');

    logger.debug(`Saved PRD to ${prdPath}`);
  }

  /**
   * Load PRD from disk
   */
  private async loadPRD(prdId: string, projectPath: string): Promise<PRDDocument | null> {
    const prdDir = await this.ensurePRDDirectory(projectPath);
    const prdPath = path.join(prdDir, `${prdId}.json`);

    if (!existsSync(prdPath)) {
      return null;
    }

    const result = await readJsonWithRecovery<PRDDocument>(prdPath, null, {
      maxBackups: 3,
      autoRestore: true,
    });

    return result.data;
  }

  /**
   * Ensure PRD directory exists
   */
  private async ensurePRDDirectory(projectPath: string): Promise<string> {
    const automakerDir = await ensureAutomakerDir(projectPath);
    const prdDir = path.join(automakerDir, 'prds');

    if (!existsSync(prdDir)) {
      await mkdir(prdDir, { recursive: true });
    }

    return prdDir;
  }

  /**
   * Generate PRD ID from title
   */
  private generatePRDId(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50);
  }

  /**
   * List all PRDs for a project
   */
  async listPRDs(projectPath: string): Promise<PRDDocument[]> {
    const prdDir = await this.ensurePRDDirectory(projectPath);

    try {
      const { readdir } = await import('node:fs/promises');
      const files = await readdir(prdDir);

      const prdFiles = files.filter((f) => f.endsWith('.json'));

      const prds: PRDDocument[] = [];

      for (const file of prdFiles) {
        const prdId = file.replace('.json', '');
        const prd = await this.loadPRD(prdId, projectPath);
        if (prd) {
          prds.push(prd);
        }
      }

      // Sort by created date (newest first)
      prds.sort((a, b) => {
        return new Date(b.metadata.createdAt).getTime() - new Date(a.metadata.createdAt).getTime();
      });

      return prds;
    } catch (error) {
      logger.error(`Failed to list PRDs for ${projectPath}:`, error);
      return [];
    }
  }
}
