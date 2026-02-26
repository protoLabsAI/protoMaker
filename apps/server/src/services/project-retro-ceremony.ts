/**
 * ProjectRetroCeremony — project retrospective, reflection loop, and post-project docs
 *
 * Extends RetroCeremony and handles:
 * - Project completion retrospectives (LLM-generated with impact report)
 * - Reflection loop: synthesize agent memory into project-level learnings
 * - Post-project docs: spawn a doc-update agent to update affected documentation
 * - Improvement item extraction: create Beads tasks / Automaker features from retro
 */

import { appendLearning, type LearningEntry, type MemoryFsModule } from '@protolabs-ai/utils';
import type { Feature } from '@protolabs-ai/types';
import { simpleQuery } from '../providers/simple-query-service.js';
import { LinearProjectUpdateService } from './linear-project-update-service.js';
import { RetroCeremony } from './retro-ceremony.js';
import { logger, type ProjectCompletedPayload, type ImprovementItem } from './ceremony-base.js';
import { secureFs } from '@protolabs-ai/platform';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs/promises';

export class ProjectRetroCeremony extends RetroCeremony {
  /**
   * Handle project:completed event — generate full retrospective with impact report
   */
  protected override async handleProjectCompleted(payload: ProjectCompletedPayload): Promise<void> {
    const { projectPath, projectTitle, projectSlug, totalMilestones, totalFeatures } = payload;

    // Dedup guard: prevent duplicate retros from manual ceremony triggers
    const dedupeKey = `${projectPath}:${projectSlug}`;
    if (this.processedProjects.has(dedupeKey)) {
      logger.debug(`Project retro already processed for ${projectSlug}, skipping`);
      return;
    }

    const ceremonySettings = await this.getCeremonySettings(projectPath);
    if (!ceremonySettings?.enabled || !ceremonySettings?.enableProjectRetros) {
      logger.debug('Ceremonies disabled, skipping project retrospective');
      return;
    }

    // Mark as processed only after config check succeeds
    this.processedProjects.add(dedupeKey);
    this.activeReflection = projectTitle;

    try {
      const allFeatures = await this.featureLoader!.getAll(projectPath);
      const projectFeatures = allFeatures.filter((f) => f.projectSlug === projectSlug);

      const shipped = projectFeatures.filter((f) => f.status === 'done' && f.prUrl);
      const failed = projectFeatures.filter((f) => (f.failureCount || 0) > 0);
      const totalCost = projectFeatures.reduce((sum, f) => sum + (f.costUsd || 0), 0);

      const milestoneBreakdown = new Map<string, { featureCount: number; costUsd: number }>();
      for (const feature of projectFeatures) {
        if (feature.milestoneSlug) {
          const existing = milestoneBreakdown.get(feature.milestoneSlug) || {
            featureCount: 0,
            costUsd: 0,
          };
          milestoneBreakdown.set(feature.milestoneSlug, {
            featureCount: existing.featureCount + 1,
            costUsd: existing.costUsd + (feature.costUsd || 0),
          });
        }
      }

      const dataSummary = this.buildProjectDataSummary(
        projectTitle,
        totalMilestones,
        totalFeatures,
        shipped,
        failed,
        totalCost,
        milestoneBreakdown
      );

      const model = ceremonySettings.retroModel?.model || 'sonnet';

      const retroPrompt = `Given these project completion stats, write a concise retrospective covering:
- **What Went Well**: Highlight successes, efficient patterns, high-value features
- **What Went Wrong**: Identify failures, blockers, or inefficiencies
- **Lessons Learned**: Key takeaways from the project
- **Action Items**: Concrete improvements for future projects

Be specific, reference actual features and numbers from the data. Keep it engaging and actionable.

Project Data:
${dataSummary}`;

      logger.info(`Generating project retrospective for ${projectTitle} using model: ${model}`);
      const result = await simpleQuery({
        prompt: retroPrompt,
        model,
        cwd: projectPath,
        maxTurns: 1,
        allowedTools: [],
      });
      const retrospective = result.text;

      let impactReport = '';
      if (this.metricsService) {
        try {
          impactReport = await this.metricsService.generateImpactReport(projectPath);
        } catch (error) {
          logger.error('Failed to generate impact report:', error);
        }
      }

      try {
        await this.generateReflectionLoop(projectPath, projectTitle, model);
      } catch (error) {
        logger.error('Failed to generate reflection loop summary:', error);
      }

      let formattedRetro = `🎉 **${projectTitle}** — Project Complete!\n\n${retrospective}`;
      if (impactReport) {
        formattedRetro += `\n\n---\n\n${impactReport}`;
      }

      const messages = this.splitMessage(formattedRetro, 2000);
      const correlationId = crypto.randomUUID();

      let anySuccess = false;
      for (const message of messages) {
        const success = await this.emitDiscordEvent(
          projectPath,
          ceremonySettings.discordChannelId,
          message,
          `Project Complete: ${projectTitle}`,
          correlationId
        );
        if (success) anySuccess = true;
      }

      this.recordCeremony('project_retro', projectPath, anySuccess, {
        id: correlationId,
        projectSlug,
        channelId: ceremonySettings.discordChannelId,
        title: `Project Complete: ${projectTitle}`,
      });

      if (anySuccess) {
        this.ceremonyCounts.projectRetro++;
        this.lastCeremonyAt = new Date().toISOString();
        logger.info(`Posted project retrospective with impact report for ${projectTitle}`);
      } else {
        this.ceremonyCounts.discordPostFailures++;
      }

      this.activeReflection = null;
      this.reflectionCount++;
      this.lastReflection = {
        projectTitle,
        projectSlug,
        completedAt: new Date().toISOString(),
      };

      this.emitter!.emit('project:reflection:complete', {
        projectPath,
        projectTitle,
        projectSlug,
      });

      await this.createImprovementItems(projectPath, projectTitle, retrospective, dataSummary);
    } catch (error) {
      this.activeReflection = null;
      logger.error('Failed to generate project retrospective:', error);
    }
  }

  /**
   * Handle post-project docs ceremony — spawn doc-update agent
   */
  protected override async handlePostProjectDocs(payload: ProjectCompletedPayload): Promise<void> {
    const { projectPath, projectTitle, projectSlug } = payload;

    const ceremonySettings = await this.getCeremonySettings(projectPath);
    if (!ceremonySettings?.enabled || !ceremonySettings?.enablePostProjectDocs) {
      logger.debug('Post-project docs ceremony disabled, skipping');
      return;
    }

    try {
      logger.info(`Starting post-project docs ceremony for ${projectTitle}`);

      const allFeatures = await this.featureLoader!.getAll(projectPath);
      const projectFeatures = allFeatures.filter((f) => f.projectSlug === projectSlug);
      const mergedFeatures = projectFeatures.filter((f) => f.status === 'done' && f.prUrl);

      if (mergedFeatures.length === 0) {
        logger.info('No merged PRs found for project, skipping docs update');
        return;
      }

      const prSummaries = mergedFeatures
        .map((f) => {
          const parts = [`- **${f.title}**`];
          if (f.prUrl) parts.push(`[PR](${f.prUrl})`);
          if (f.description) parts.push(`\n  ${f.description}`);
          return parts.join(' ');
        })
        .join('\n');

      const project = await this.projectService!.getProject(projectPath, projectSlug);
      const projectPRD = project?.prd || null;

      let prdSummary = 'No PRD available';
      if (projectPRD) {
        const parts: string[] = [];
        if (projectPRD.situation) parts.push(`**Situation:** ${projectPRD.situation}`);
        if (projectPRD.problem) parts.push(`**Problem:** ${projectPRD.problem}`);
        if (projectPRD.approach) parts.push(`**Approach:** ${projectPRD.approach}`);
        if (projectPRD.results) parts.push(`**Results:** ${projectPRD.results}`);
        prdSummary = parts.join('\n\n');
      }

      const model = ceremonySettings.retroModel?.model || 'haiku';

      const docUpdatePrompt = `You are reviewing a completed project and need to update documentation.

## Project: ${projectTitle}

### Project PRD
${prdSummary}

### Merged PRs (${mergedFeatures.length})
${prSummaries}

## Your Task

1. **Identify affected docs**: Search the \`docs/\` directory for files that reference:
   - Components, services, or files modified in these PRs
   - Features mentioned in the PR titles
   - Architecture or patterns that changed

2. **Update documentation**: For each affected doc file:
   - Update outdated information
   - Add sections for new features
   - Update examples and code snippets
   - Ensure consistency

3. **Create a PR**: After updating docs, create a single PR with:
   - Branch name: \`docs/${projectSlug}-post-project\`
   - Title: "docs: post-project updates for ${projectTitle}"
   - Description: "Updates documentation for ${mergedFeatures.length} merged features from ${projectTitle} project"

Use the available tools to search, read, edit files, and create the PR.`;

      logger.info(
        `Spawning doc-update agent for ${projectTitle} using model: ${model} (${mergedFeatures.length} PRs)`
      );

      const result = await simpleQuery({
        prompt: docUpdatePrompt,
        model,
        cwd: projectPath,
        maxTurns: 30,
        allowedTools: undefined,
      });

      if (result.text) {
        logger.info(`Doc update agent completed: ${result.text.substring(0, 200)}...`);
      }

      this.recordCeremony('post_project_docs', projectPath, true, {
        projectSlug,
        title: `Post-Project Docs: ${projectTitle}`,
        summary: `Agent processed ${mergedFeatures.length} PRs for documentation updates`,
      });

      if (this.emitter) {
        this.emitter.emit('ceremony:post-project-docs:complete', {
          projectPath,
          projectSlug,
          projectTitle,
          featureCount: mergedFeatures.length,
          success: true,
        });
      }

      this.ceremonyCounts.postProjectDocs++;
      this.lastCeremonyAt = new Date().toISOString();

      logger.info(
        `Post-project docs ceremony completed for ${projectTitle} (${mergedFeatures.length} PRs)`
      );
    } catch (error) {
      logger.error('Failed to process post-project docs ceremony:', error);

      this.recordCeremony('post_project_docs', projectPath, false, {
        projectSlug: payload.projectSlug,
        title: `Post-Project Docs: ${projectTitle}`,
        summary: `Failed: ${error instanceof Error ? error.message : String(error)}`,
      });

      if (this.emitter) {
        this.emitter.emit('ceremony:post-project-docs:failed', {
          projectPath,
          projectSlug: payload.projectSlug,
          projectTitle,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Build project data summary for LLM retrospective prompt
   */
  private buildProjectDataSummary(
    projectTitle: string,
    totalMilestones: number,
    totalFeatures: number,
    shipped: Feature[],
    failed: Feature[],
    totalCost: number,
    milestoneBreakdown: Map<string, { featureCount: number; costUsd: number }>
  ): string {
    const lines: string[] = [];

    lines.push(`## ${projectTitle} — Project Overview`);
    lines.push(`- Total Milestones: ${totalMilestones}`);
    lines.push(`- Total Features: ${totalFeatures}`);
    lines.push(`- Total Cost: $${totalCost.toFixed(2)}`);
    lines.push('');

    lines.push(`### Features Shipped (${shipped.length})`);
    if (shipped.length > 0) {
      for (const feature of shipped) {
        const title = feature.title || 'Untitled';
        const prLink = feature.prUrl || 'No PR';
        const cost = feature.costUsd ? `$${feature.costUsd.toFixed(2)}` : '$0.00';
        lines.push(`- **${title}** — PR: ${prLink}, Cost: ${cost}`);
      }
    } else {
      lines.push('- None');
    }
    lines.push('');

    lines.push(`### Failures/Blockers (${failed.length})`);
    if (failed.length > 0) {
      for (const feature of failed) {
        const title = feature.title || 'Untitled';
        const failCount = feature.failureCount || 0;
        const error = feature.error ? `Error: ${feature.error.slice(0, 150)}` : '';
        lines.push(`- **${title}** — Fail Count: ${failCount}${error ? `, ${error}` : ''}`);
      }
    } else {
      lines.push('- None');
    }
    lines.push('');

    lines.push(`### Milestone Cost Breakdown`);
    if (milestoneBreakdown.size > 0) {
      for (const [slug, data] of milestoneBreakdown) {
        lines.push(`- **${slug}**: ${data.featureCount} features, $${data.costUsd.toFixed(2)}`);
      }
    } else {
      lines.push('- No milestone data');
    }

    return lines.join('\n');
  }

  /**
   * Generate reflection loop — synthesize agent memory into project-level learning summary
   */
  private async generateReflectionLoop(
    projectPath: string,
    projectTitle: string,
    model: string
  ): Promise<void> {
    logger.info(`Generating reflection loop for project: ${projectTitle}`);

    const memoryDir = path.join(projectPath, '.automaker', 'memory');
    let memoryFiles: string[] = [];

    try {
      const entries = await secureFs.readdir(memoryDir, { withFileTypes: true });
      memoryFiles = entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
        .map((entry) => entry.name);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        logger.info('No memory directory found, skipping reflection loop');
        return;
      }
      throw error;
    }

    if (memoryFiles.length === 0) {
      logger.info('No memory files found, skipping reflection loop');
      return;
    }

    const memoryEntries = await this.collectMemoryEntries(memoryDir, memoryFiles);
    const learningSummary = await this.synthesizeLearningSummary(
      projectPath,
      projectTitle,
      memoryEntries,
      model
    );

    await this.storeLearningSummary(projectPath, projectTitle, learningSummary);
    await this.persistToAgentMemory(projectPath, projectTitle, learningSummary);
    await this.postCompletionToLinear(projectPath, projectTitle);

    logger.info(`Reflection loop complete for ${projectTitle}`);
  }

  /**
   * Collect and parse memory entries from all memory files
   */
  private async collectMemoryEntries(
    memoryDir: string,
    memoryFiles: string[]
  ): Promise<Array<{ filename: string; content: string }>> {
    const entries: Array<{ filename: string; content: string }> = [];

    for (const filename of memoryFiles) {
      try {
        const filePath = path.join(memoryDir, filename);
        const rawContent = await secureFs.readFile(filePath, 'utf-8');
        const content = typeof rawContent === 'string' ? rawContent : rawContent.toString('utf-8');
        entries.push({ filename, content });
      } catch (error) {
        logger.warn(`Failed to read memory file ${filename}:`, error);
      }
    }

    return entries;
  }

  /**
   * Synthesize memory entries into a project-level learning summary using LLM
   */
  private async synthesizeLearningSummary(
    projectPath: string,
    projectTitle: string,
    memoryEntries: Array<{ filename: string; content: string }>,
    model: string
  ): Promise<string> {
    const memoryContent = memoryEntries
      .map((entry) => `## Memory File: ${entry.filename}\n\n${entry.content}`)
      .join('\n\n---\n\n');

    const prompt = `You are synthesizing project-level learning from agent memory files created during project implementation.

**Project:** ${projectTitle}

**Task:** Analyze the memory files below and create a concise 1-page learning summary covering:

1. **Key Patterns Discovered**: Reusable architectural patterns, implementation approaches, or technical solutions that worked well
2. **Critical Gotchas**: Important pitfalls, edge cases, or mistakes to avoid in future similar work
3. **Organizational Knowledge**: Cross-cutting insights that apply beyond this specific project
4. **Recommended Practices**: Concrete recommendations for future projects based on what was learned

Focus on insights that will help future projects. Extract patterns, not implementation details. Keep it actionable and concise (1 page max).

**Memory Files:**

${memoryContent}`;

    logger.info(`Synthesizing learning summary for ${projectTitle} using model: ${model}`);

    const result = await simpleQuery({
      prompt,
      model,
      cwd: projectPath,
      maxTurns: 1,
      allowedTools: [],
    });

    return result.text;
  }

  /**
   * Store learning summary in project directory
   */
  private async storeLearningSummary(
    projectPath: string,
    projectTitle: string,
    summary: string
  ): Promise<void> {
    const summaryPath = path.join(projectPath, 'PROJECT_LEARNINGS.md');

    const formattedSummary = `# Project Learning Summary: ${projectTitle}

**Generated:** ${new Date().toISOString()}

---

${summary}

---

*This summary was automatically generated from agent memory files during project completion.*
*It synthesizes key patterns, gotchas, and organizational knowledge for future reference.*
`;

    await secureFs.writeFile(summaryPath, formattedSummary);
    logger.info(`Stored learning summary at: ${summaryPath}`);
  }

  /**
   * Persist structured learnings to .automaker/memory/ for future agents
   */
  private async persistToAgentMemory(
    projectPath: string,
    projectTitle: string,
    summary: string
  ): Promise<void> {
    const fsModule: MemoryFsModule = {
      access: (p) => fs.access(p),
      readdir: (p) => fs.readdir(p),
      readFile: (p, enc) => fs.readFile(p, enc),
      writeFile: (p, c) => fs.writeFile(p, c),
      mkdir: (p, opts) => fs.mkdir(p, opts),
      appendFile: (p, c) => fs.appendFile(p, c),
    };

    const sections: Array<{ heading: string; content: string }> = [];
    const lines = summary.split('\n');
    let currentHeading = '';
    let currentContent: string[] = [];

    for (const line of lines) {
      const headingMatch = line.match(/^#{1,3}\s+(.+)/);
      if (headingMatch) {
        if (currentHeading && currentContent.length > 0) {
          sections.push({ heading: currentHeading, content: currentContent.join('\n').trim() });
        }
        currentHeading = headingMatch[1].replace(/\*+/g, '').trim();
        currentContent = [];
      } else {
        currentContent.push(line);
      }
    }
    if (currentHeading && currentContent.length > 0) {
      sections.push({ heading: currentHeading, content: currentContent.join('\n').trim() });
    }

    const headingToType: Record<string, LearningEntry['type']> = {
      patterns: 'pattern',
      'key patterns': 'pattern',
      'key patterns discovered': 'pattern',
      gotchas: 'gotcha',
      'critical gotchas': 'gotcha',
      practices: 'pattern',
      'recommended practices': 'pattern',
      knowledge: 'learning',
      'organizational knowledge': 'learning',
      'lessons learned': 'learning',
    };

    const headingToCategory: Record<string, string> = {
      patterns: 'project-patterns',
      'key patterns': 'project-patterns',
      'key patterns discovered': 'project-patterns',
      gotchas: 'gotchas',
      'critical gotchas': 'gotchas',
      practices: 'best-practices',
      'recommended practices': 'best-practices',
      knowledge: 'organizational-knowledge',
      'organizational knowledge': 'organizational-knowledge',
      'lessons learned': 'lessons-learned',
    };

    let persisted = 0;
    for (const section of sections) {
      if (!section.content) continue;

      const lowerHeading = section.heading.toLowerCase();
      const entryType = headingToType[lowerHeading] || 'learning';
      const category = headingToCategory[lowerHeading] || 'project-learnings';

      const learning: LearningEntry = {
        category,
        type: entryType,
        content: section.content,
        context: `From project completion: ${projectTitle}`,
      };

      try {
        await appendLearning(projectPath, learning, fsModule);
        persisted++;
      } catch (error) {
        logger.warn(`Failed to persist learning for "${section.heading}":`, error);
      }
    }

    logger.info(`Persisted ${persisted} learning entries to agent memory for "${projectTitle}"`);
  }

  /**
   * Post a "Project Complete" update to Linear
   */
  private async postCompletionToLinear(projectPath: string, projectTitle: string): Promise<void> {
    if (!this.settingsService) return;

    try {
      const linearService = new LinearProjectUpdateService(this.settingsService, projectPath);
      if (!(await linearService.isEnabled())) return;

      await linearService.createProjectUpdate({
        projectId: await this.getLinearProjectId(projectPath),
        body: `## Project Complete: ${projectTitle}\n\nAll milestones delivered. Learning summary generated and persisted to agent memory.`,
        health: 'complete',
      });

      logger.info(`Posted completion update to Linear for "${projectTitle}"`);
    } catch (error) {
      logger.error('Failed to post completion to Linear (non-blocking):', error);
    }
  }

  /**
   * Look up the Linear project ID from local project config
   */
  private async getLinearProjectId(projectPath: string): Promise<string> {
    const projectsDir = path.join(projectPath, '.automaker', 'projects');
    try {
      const slugs = await secureFs.readdir(projectsDir);
      for (const slug of slugs) {
        const projectJsonPath = path.join(projectsDir, String(slug), 'project.json');
        try {
          const raw = await secureFs.readFile(projectJsonPath, 'utf-8');
          const data = JSON.parse(typeof raw === 'string' ? raw : raw.toString('utf-8'));
          if (data.linearProjectId) return data.linearProjectId;
        } catch {
          // Skip malformed project files
        }
      }
    } catch {
      // No projects dir
    }
    return '';
  }

  /**
   * Extract improvement items from retrospective and create Beads/Automaker items
   */
  private async createImprovementItems(
    projectPath: string,
    projectTitle: string,
    retrospective: string,
    dataSummary: string
  ): Promise<void> {
    try {
      logger.info(`Extracting improvement items from retrospective for ${projectTitle}`);

      const extractionPrompt = `Based on this project retrospective, extract 1-3 concrete, actionable improvement items.

For each improvement item, provide:
1. **Title**: Brief, clear title (max 60 chars)
2. **Description**: Detailed description of the improvement (2-4 sentences)
3. **Type**: Either "operational" (process/workflow improvements) or "code" (technical/codebase improvements)
4. **Priority**: 1-3 (1=high, 2=medium, 3=low)
5. **Category**: Optional category tag (e.g., "testing", "ci/cd", "documentation", "architecture")

Focus on improvements that are:
- Specific and actionable (not vague suggestions)
- Based on actual issues encountered in the project
- High-impact and worth implementing

Return the improvements as a JSON array of objects with fields: title, description, type, priority, category.

Retrospective:
${retrospective}

Project Data:
${dataSummary}

Return ONLY the JSON array, no other text.`;

      const result = await simpleQuery({
        prompt: extractionPrompt,
        model: 'haiku',
        cwd: projectPath,
        maxTurns: 1,
        allowedTools: [],
      });

      let improvements: ImprovementItem[] = [];
      try {
        const jsonMatch = result.text.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          improvements = JSON.parse(jsonMatch[0]) as ImprovementItem[];
        } else {
          improvements = JSON.parse(result.text) as ImprovementItem[];
        }
      } catch (parseError) {
        logger.error('Failed to parse improvement items JSON:', parseError);
        logger.debug('Raw LLM response:', result.text);
        return;
      }

      if (!Array.isArray(improvements) || improvements.length === 0) {
        logger.info('No improvement items extracted from retrospective');
        return;
      }

      improvements = improvements.slice(0, 3);
      logger.info(`Extracted ${improvements.length} improvement items`);

      const createdBeadsItems: string[] = [];
      const createdFeatureIds: string[] = [];

      for (const improvement of improvements) {
        if (improvement.type === 'operational') {
          const beadsResult = await this.beadsService!.createTask(projectPath, {
            title: improvement.title,
            description: improvement.description,
            priority: improvement.priority,
            issueType: 'task',
            labels: improvement.category
              ? ['retro-improvement', improvement.category]
              : ['retro-improvement'],
          });

          if (beadsResult.success && beadsResult.data) {
            createdBeadsItems.push(beadsResult.data.id);
            logger.info(
              `Created Beads task ${beadsResult.data.id} for operational improvement: ${improvement.title}`
            );
          } else {
            logger.error(
              `Failed to create Beads task for ${improvement.title}:`,
              beadsResult.error
            );
          }
        } else if (improvement.type === 'code') {
          const feature = await this.featureLoader!.create(projectPath, {
            title: improvement.title,
            description: improvement.description,
            category: improvement.category || 'improvement',
            status: 'backlog',
            priority: improvement.priority as 1 | 2 | 3,
            complexity: 'medium',
          });

          createdFeatureIds.push(feature.id);
          logger.info(
            `Created Automaker feature ${feature.id} for code improvement: ${improvement.title}`
          );
        }
      }

      if (this.emitter && (createdBeadsItems.length > 0 || createdFeatureIds.length > 0)) {
        this.emitter.emit('retro:improvements:created', {
          projectPath,
          projectTitle,
          beadsItems: createdBeadsItems,
          featureIds: createdFeatureIds,
          totalImprovements: improvements.length,
        });

        for (const improvement of improvements) {
          this.emitter.emit('retro:improvement:linear-sync', {
            projectPath,
            projectTitle,
            title: `[Retro] ${improvement.title}`,
            description: `${improvement.description}\n\nSource: Retrospective for ${projectTitle}\nType: ${improvement.type}\nCategory: ${improvement.category || 'general'}`,
            priority: improvement.priority,
            labels: ['retro-improvement', improvement.category].filter(Boolean),
          });
        }

        logger.info(
          `Emitted retro:improvements:created event: ${createdBeadsItems.length} Beads items, ${createdFeatureIds.length} features`
        );
      }
    } catch (error) {
      logger.error('Failed to create improvement items:', error);
    }
  }
}
