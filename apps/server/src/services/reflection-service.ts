/**
 * Reflection Service
 *
 * Generates a retrospective reflection when a project completes.
 * Unlike CeremonyService (which gates on ceremony settings), this always runs
 * to ensure every project gets a reflection output.
 *
 * Listens for: project:completed (from CompletionDetectorService)
 * Writes to: .automaker/projects/{slug}/reflection.md
 * Emits: project:reflection:complete
 */

import path from 'node:path';
import { createLogger } from '@automaker/utils';
import { ensureAutomakerDir, secureFs } from '@automaker/platform';
import type { EventEmitter } from '../lib/events.js';
import type { FeatureLoader } from './feature-loader.js';
import type { Feature } from '@automaker/types';
import { simpleQuery } from '../providers/simple-query-service.js';

const logger = createLogger('Reflection');

interface ProjectCompletedPayload {
  projectPath: string;
  projectTitle: string;
  projectSlug: string;
  totalMilestones: number;
  totalFeatures: number;
}

export class ReflectionService {
  private processedProjects = new Set<string>();

  constructor(
    private events: EventEmitter,
    private featureLoader: FeatureLoader
  ) {
    this.registerListener();
    logger.info('Reflection service initialized');
  }

  private registerListener(): void {
    this.events.subscribe((type, payload) => {
      if (type === 'project:completed') {
        void this.handleProjectCompleted(payload as ProjectCompletedPayload);
      }
    });
  }

  private async handleProjectCompleted(payload: ProjectCompletedPayload): Promise<void> {
    const { projectPath, projectTitle, projectSlug, totalMilestones, totalFeatures } = payload;

    // Deduplicate
    const key = `${projectPath}:${projectSlug}`;
    if (this.processedProjects.has(key)) return;
    this.processedProjects.add(key);

    logger.info(`Generating reflection for completed project: ${projectTitle}`);

    try {
      const features = await this.featureLoader.getAll(projectPath);
      const projectFeatures = features.filter((f) => f.projectSlug === projectSlug || f.epicId);

      const summary = this.buildSummary(
        projectTitle,
        projectFeatures,
        totalMilestones,
        totalFeatures
      );

      // Generate retrospective via LLM
      const result = await simpleQuery({
        prompt: `You are a project retrospective analyst. Given these completion stats, write a concise reflection covering:

1. **Summary**: What was built and why
2. **What Went Well**: Successes, efficient patterns, smooth executions
3. **What Went Wrong**: Failures, retries, blockers encountered
4. **Metrics**: Feature count, cost, time, retry rate
5. **Lessons Learned**: Key takeaways for future projects
6. **Improvement Ideas**: Concrete items that would make the next project better

Be specific, reference actual features and numbers. Keep it under 500 words.

Project Data:
${summary}`,
        model: 'sonnet',
        cwd: projectPath,
        maxTurns: 1,
        allowedTools: [],
      });

      const reflection = result.text;

      // Store reflection
      const projectDir = path.join(projectPath, '.automaker', 'projects', projectSlug);
      await ensureAutomakerDir(projectDir);
      const reflectionPath = path.join(projectDir, 'reflection.md');
      const content = `# Reflection: ${projectTitle}\n\n_Generated: ${new Date().toISOString()}_\n\n${reflection}\n`;
      await secureFs.writeFile(reflectionPath, content, 'utf-8');

      logger.info(`Reflection stored at ${reflectionPath}`);

      // Emit event
      this.events.emit('project:reflection:complete', {
        projectPath,
        projectTitle,
        projectSlug,
        reflectionPath,
      });
    } catch (error) {
      logger.error(`Failed to generate reflection for ${projectTitle}:`, error);
    }
  }

  private buildSummary(
    title: string,
    features: Feature[],
    totalMilestones: number,
    totalFeatures: number
  ): string {
    const done = features.filter((f) => f.status === 'done');
    const withPR = features.filter((f) => f.prUrl);
    const failed = features.filter((f) => (f.failureCount || 0) > 0);
    const totalCost = features.reduce((sum, f) => sum + (f.costUsd || 0), 0);
    const totalRetries = features.reduce((sum, f) => sum + (f.failureCount || 0), 0);

    const lines = [
      `Project: ${title}`,
      `Total Milestones: ${totalMilestones}`,
      `Total Features: ${totalFeatures}`,
      `Features Done: ${done.length}`,
      `PRs Created: ${withPR.length}`,
      `Features with Failures: ${failed.length}`,
      `Total Retries: ${totalRetries}`,
      `Estimated Cost: $${totalCost.toFixed(2)}`,
      '',
      'Feature Details:',
    ];

    for (const f of features) {
      const status = f.status === 'done' ? 'DONE' : (f.status ?? 'unknown').toUpperCase();
      const cost = f.costUsd ? ` ($${f.costUsd.toFixed(2)})` : '';
      const retries = f.failureCount ? ` [${f.failureCount} retries]` : '';
      const pr = f.prUrl ? ` PR: ${f.prUrl}` : '';
      lines.push(`  - [${status}] ${f.title}${cost}${retries}${pr}`);
    }

    return lines.join('\n');
  }
}
