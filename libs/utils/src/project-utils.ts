/**
 * Project utility functions for AutoMaker
 *
 * Utilities for creating and managing project structures.
 */

import type { Project, Milestone, Phase, CreateProjectInput, SPARCPrd } from '@protolabs-ai/types';
import { slugify } from './string-utils.js';

/**
 * Create a new project from input
 */
export function createProject(input: CreateProjectInput): Project {
  const now = new Date().toISOString();

  const milestones: Milestone[] = (input.milestones || []).map((m, mIndex) => ({
    number: mIndex + 1,
    slug: slugify(m.title, 30),
    title: m.title,
    description: m.description,
    phases: (m.phases || []).map((p, pIndex) => ({
      number: pIndex + 1,
      name: slugify(p.title, 20),
      title: p.title,
      description: p.description,
      filesToModify: p.filesToModify,
      acceptanceCriteria: p.acceptanceCriteria,
      complexity: p.complexity || 'medium',
      dependencies: p.dependencies,
    })),
    dependencies: m.dependencies,
    status: 'pending' as const,
  }));

  return {
    slug: input.slug,
    title: input.title,
    goal: input.goal,
    description: input.description,
    lead: input.lead,
    members: input.members,
    startDate: input.startDate,
    targetDate: input.targetDate,
    health: input.health,
    priority: input.priority,
    color: input.color,
    ongoing: input.ongoing,
    status: input.prd ? 'approved' : 'drafting',
    milestones,
    prd: input.prd,
    researchSummary: input.researchSummary,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Generate a branch name for a phase
 */
export function phaseToBranchName(
  projectSlug: string,
  milestoneSlug: string,
  phaseTitle: string
): string {
  const phaseSlug = slugify(phaseTitle, 30);
  return `feat/${projectSlug}/${milestoneSlug}/${phaseSlug}`;
}

/**
 * Generate feature description from phase
 */
export function phaseToFeatureDescription(phase: Phase, milestone: Milestone): string {
  const parts: string[] = [];

  parts.push(`## ${phase.title}`);
  parts.push('');
  parts.push(phase.description);

  if (phase.filesToModify && phase.filesToModify.length > 0) {
    parts.push('');
    parts.push('### Files to Modify');
    parts.push('');
    phase.filesToModify.forEach((f) => parts.push(`- ${f}`));
  }

  if (phase.acceptanceCriteria && phase.acceptanceCriteria.length > 0) {
    parts.push('');
    parts.push('### Acceptance Criteria');
    parts.push('');
    phase.acceptanceCriteria.forEach((c) => parts.push(`- [ ] ${c}`));
  }

  if (phase.dependencies && phase.dependencies.length > 0) {
    parts.push('');
    parts.push(`**Dependencies:** ${phase.dependencies.join(', ')}`);
  }

  parts.push('');
  parts.push(`---`);
  parts.push(`*Part of milestone: ${milestone.title}*`);

  return parts.join('\n');
}

/**
 * Generate markdown for a project
 */
export function generateProjectMarkdown(project: Project): string {
  const parts: string[] = [];

  parts.push(`# ${project.title}`);
  parts.push('');
  parts.push(project.goal);
  parts.push('');
  parts.push(`**Status:** ${project.status}`);
  parts.push(`**Created:** ${project.createdAt}`);
  parts.push(`**Updated:** ${project.updatedAt}`);

  if (project.researchSummary) {
    parts.push('');
    parts.push('## Research Summary');
    parts.push('');
    parts.push(project.researchSummary);
  }

  if (project.prd) {
    parts.push('');
    parts.push('## PRD');
    parts.push('');
    parts.push(generatePrdMarkdown(project.prd));
  }

  parts.push('');
  parts.push('## Milestones');
  parts.push('');

  for (const milestone of project.milestones) {
    parts.push(`### ${milestone.number}. ${milestone.title}`);
    parts.push('');
    parts.push(milestone.description);
    parts.push('');
    parts.push(`**Status:** ${milestone.status}`);

    if (milestone.phases.length > 0) {
      parts.push('');
      parts.push('#### Phases');
      parts.push('');
      for (const phase of milestone.phases) {
        parts.push(`${phase.number}. **${phase.title}** (${phase.complexity || 'medium'})`);
      }
    }
    parts.push('');
  }

  return parts.join('\n');
}

/**
 * Generate markdown for a milestone
 */
export function generateMilestoneMarkdown(milestone: Milestone, project: Project): string {
  const parts: string[] = [];

  parts.push(`# ${milestone.title}`);
  parts.push('');
  parts.push(`*Part of: ${project.title}*`);
  parts.push('');
  parts.push(milestone.description);
  parts.push('');
  parts.push(`**Status:** ${milestone.status}`);

  if (milestone.dependencies && milestone.dependencies.length > 0) {
    parts.push(`**Dependencies:** ${milestone.dependencies.join(', ')}`);
  }

  parts.push('');
  parts.push('## Phases');
  parts.push('');

  for (const phase of milestone.phases) {
    parts.push(`### ${phase.number}. ${phase.title}`);
    parts.push('');
    parts.push(phase.description);
    parts.push('');
    parts.push(`**Complexity:** ${phase.complexity || 'medium'}`);

    if (phase.filesToModify && phase.filesToModify.length > 0) {
      parts.push('');
      parts.push('**Files:**');
      phase.filesToModify.forEach((f) => parts.push(`- ${f}`));
    }

    if (phase.acceptanceCriteria && phase.acceptanceCriteria.length > 0) {
      parts.push('');
      parts.push('**Acceptance Criteria:**');
      phase.acceptanceCriteria.forEach((c) => parts.push(`- [ ] ${c}`));
    }

    parts.push('');
  }

  return parts.join('\n');
}

/**
 * Generate markdown for a phase
 */
export function generatePhaseMarkdown(
  phase: Phase,
  milestone: Milestone,
  project: Project
): string {
  const parts: string[] = [];

  parts.push(`# Phase ${phase.number}: ${phase.title}`);
  parts.push('');
  parts.push(`*${project.title} > ${milestone.title}*`);
  parts.push('');
  parts.push(phase.description);
  parts.push('');
  parts.push(`**Complexity:** ${phase.complexity || 'medium'}`);

  if (phase.dependencies && phase.dependencies.length > 0) {
    parts.push(`**Dependencies:** ${phase.dependencies.join(', ')}`);
  }

  if (phase.filesToModify && phase.filesToModify.length > 0) {
    parts.push('');
    parts.push('## Files to Modify');
    parts.push('');
    phase.filesToModify.forEach((f) => parts.push(`- ${f}`));
  }

  if (phase.acceptanceCriteria && phase.acceptanceCriteria.length > 0) {
    parts.push('');
    parts.push('## Acceptance Criteria');
    parts.push('');
    phase.acceptanceCriteria.forEach((c) => parts.push(`- [ ] ${c}`));
  }

  return parts.join('\n');
}

/**
 * Generate markdown for a SPARC PRD
 */
function generatePrdMarkdown(prd: SPARCPrd): string {
  const parts: string[] = [];

  parts.push('### Situation');
  parts.push('');
  parts.push(prd.situation);
  parts.push('');

  parts.push('### Problem');
  parts.push('');
  parts.push(prd.problem);
  parts.push('');

  parts.push('### Approach');
  parts.push('');
  parts.push(prd.approach);
  parts.push('');

  parts.push('### Results');
  parts.push('');
  parts.push(prd.results);
  parts.push('');

  parts.push('### Constraints');
  parts.push('');
  parts.push(prd.constraints);

  return parts.join('\n');
}
