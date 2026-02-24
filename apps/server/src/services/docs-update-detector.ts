/**
 * Docs Update Detector
 *
 * Subscribes to milestone:completed and project:completed events.
 * Checks if doc-relevant files changed. If >3 changed, creates
 * a "docs update" feature in backlog and emits docs:update-needed.
 */

import { createLogger } from '@protolabs-ai/utils';
import { execSync } from 'child_process';
import type { EventEmitter } from '../lib/events.js';
import type { FeatureLoader } from './feature-loader.js';

const logger = createLogger('DocsUpdateDetector');

/** File patterns that indicate documentation should be updated */
const DOC_RELEVANT_PATTERNS = [
  /^apps\/server\/src\/routes\//,
  /^apps\/server\/src\/services\//,
  /^libs\/types\/src\//,
  /^libs\/[^/]+\/src\/index\.ts$/,
  /\.md$/,
  /openapi|swagger/i,
  /schema\.ts$/,
];

const DOC_THRESHOLD = 3;

export class DocsUpdateDetector {
  private unsubscribe: (() => void) | null = null;

  constructor(
    private events: EventEmitter,
    private featureLoader: FeatureLoader,
    private defaultProjectPath: string
  ) {}

  start(): void {
    this.unsubscribe = this.events.subscribe((type, payload) => {
      if (type === 'milestone:completed' || type === 'project:completed') {
        const p = payload as {
          projectPath?: string;
          projectTitle?: string;
          milestoneTitle?: string;
        };
        void this.checkForDocsUpdate(
          p.projectPath || this.defaultProjectPath,
          p.projectTitle || p.milestoneTitle || 'Unknown'
        );
      }
    });
    logger.info('Docs update detector started');
  }

  stop(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  private async checkForDocsUpdate(projectPath: string, context: string): Promise<void> {
    try {
      // Get recently changed files (last 10 commits on main)
      const changedFiles = this.getRecentlyChangedFiles(projectPath);
      const docRelevant = changedFiles.filter((file) =>
        DOC_RELEVANT_PATTERNS.some((pattern) => pattern.test(file))
      );

      logger.debug(
        `Docs check after "${context}": ${changedFiles.length} changed, ${docRelevant.length} doc-relevant`
      );

      if (docRelevant.length < DOC_THRESHOLD) {
        return;
      }

      // Create a docs update feature
      const feature = await this.featureLoader.create(projectPath, {
        title: `Update docs after: ${context}`,
        description: [
          `${docRelevant.length} doc-relevant files changed recently.`,
          '',
          'Changed files requiring docs review:',
          ...docRelevant.slice(0, 15).map((f) => `- ${f}`),
          docRelevant.length > 15 ? `\n...and ${docRelevant.length - 15} more` : '',
        ].join('\n'),
        status: 'backlog',
        category: 'Documentation',
        complexity: 'small',
      });

      this.events.emit('docs:update-needed', {
        projectPath,
        featureId: feature.id,
        context,
        docRelevantFiles: docRelevant.length,
        files: docRelevant.slice(0, 20),
      });

      logger.info(
        `Created docs update feature ${feature.id}: ${docRelevant.length} files after "${context}"`
      );
    } catch (error) {
      logger.error(`Failed to check for docs update after "${context}":`, error);
    }
  }

  private getRecentlyChangedFiles(projectPath: string): string[] {
    try {
      const output = execSync('git diff --name-only HEAD~10..HEAD 2>/dev/null || true', {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: 10_000,
      });
      return output
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
    } catch {
      return [];
    }
  }
}
