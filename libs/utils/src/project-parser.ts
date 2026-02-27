/**
 * Project Parser - Parse project, milestone, and phase markdown files
 *
 * Converts markdown files into structured TypeScript objects for the
 * project orchestration system.
 */

import type {
  Project,
  Milestone,
  Phase,
  SPARCPrd,
  PhaseComplexity,
  ProjectStatus,
  MilestoneStatus,
} from '@protolabs-ai/types';

/**
 * Parse a project.md file into a Project object
 *
 * Expected format:
 * ```markdown
 * # Project: Epic/Milestone Support
 *
 * ## Goal
 * Add hierarchical grouping to Automaker's feature management.
 *
 * ## Milestones
 * 1. Foundation - Core types and server support
 * 2. UI Components - Cards, badges, filtering
 * ```
 *
 * @param content - Markdown content of the project file
 * @param slug - Project slug (from directory name)
 * @returns Partial project object (milestones loaded separately)
 */
export function parseProjectFile(content: string, slug: string): Partial<Project> {
  const lines = content.split('\n');

  let title = '';
  let goal = '';
  let milestoneList: string[] = [];
  let currentSection = '';

  for (const line of lines) {
    const trimmed = line.trim();

    // Parse title from first heading
    if (trimmed.startsWith('# Project:') || trimmed.startsWith('# ')) {
      title = trimmed
        .replace(/^#\s*Project:\s*/i, '')
        .replace(/^#\s*/, '')
        .trim();
      continue;
    }

    // Track section changes
    if (trimmed.startsWith('## ')) {
      currentSection = trimmed.replace('## ', '').toLowerCase();
      continue;
    }

    // Parse content based on section
    if (currentSection === 'goal' && trimmed) {
      goal += (goal ? ' ' : '') + trimmed;
    } else if (currentSection === 'milestones' && /^\d+\./.test(trimmed)) {
      milestoneList.push(trimmed);
    }
  }

  return {
    slug,
    title: title || slug,
    goal,
    status: 'drafting' as ProjectStatus,
    milestones: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Generate project.md content from a Project object
 *
 * @param project - The project object
 * @returns Markdown content for project.md
 */
export function generateProjectFile(project: Project): string {
  let content = `# Project: ${project.title}\n\n`;
  content += `## Goal\n${project.goal}\n\n`;

  if (project.milestones.length > 0) {
    content += `## Milestones\n`;
    for (const milestone of project.milestones) {
      content += `${milestone.number}. ${milestone.title} - ${milestone.description}\n`;
    }
  }

  return content;
}

/**
 * Parse a milestone.md file into a Milestone object
 *
 * Expected format:
 * ```markdown
 * # Milestone: Foundation
 *
 * ## Description
 * Core infrastructure for epic support.
 *
 * ## Phases
 * 1. Types - Add isEpic, epicId fields
 * 2. Server - Auto-detection, API endpoints
 *
 * ## Dependencies
 * - None (first milestone)
 * ```
 *
 * @param content - Markdown content of the milestone file
 * @param slug - Milestone slug (from directory name)
 * @returns Partial milestone object (phases loaded separately)
 */
export function parseMilestoneFile(content: string, slug: string): Partial<Milestone> {
  const lines = content.split('\n');

  let title = '';
  let description = '';
  let phaseList: string[] = [];
  let dependencies: string[] = [];
  let currentSection = '';

  // Extract number from slug (e.g., "01-foundation" -> 1)
  const numberMatch = slug.match(/^(\d+)-/);
  const number = numberMatch ? parseInt(numberMatch[1], 10) : 1;

  for (const line of lines) {
    const trimmed = line.trim();

    // Parse title from first heading
    // Handles formats: "# Milestone: Title", "# M1: Title", "# Title"
    if (trimmed.startsWith('# Milestone:') || trimmed.startsWith('# ')) {
      title = trimmed
        .replace(/^#\s*Milestone:\s*/i, '') // Strip "# Milestone:"
        .replace(/^#\s*M\d+\s*:\s*/i, '') // Strip "# M1:" (generated format)
        .replace(/^#\s*/, '') // Strip plain "# "
        .trim();
      continue;
    }

    // Track section changes
    if (trimmed.startsWith('## ')) {
      currentSection = trimmed.replace('## ', '').toLowerCase();
      continue;
    }

    // Parse content based on section
    if (currentSection === 'description' && trimmed) {
      description += (description ? ' ' : '') + trimmed;
    } else if (currentSection === 'phases' && /^\d+\./.test(trimmed)) {
      phaseList.push(trimmed);
    } else if (currentSection === 'dependencies' && trimmed.startsWith('-')) {
      const dep = trimmed.replace(/^-\s*/, '').trim();
      if (dep.toLowerCase() !== 'none' && !dep.toLowerCase().includes('first milestone')) {
        dependencies.push(dep);
      }
    }
  }

  return {
    number,
    slug,
    title: title || slug,
    description,
    phases: [],
    dependencies: dependencies.length > 0 ? dependencies : undefined,
    status: 'pending' as MilestoneStatus,
  };
}

/**
 * Generate milestone.md content from a Milestone object
 *
 * Follows the detailed format from rpg-mcp:
 * - Status, Duration, Dependencies header
 * - Overview explaining why this matters
 * - Phases table with durations
 * - Success Criteria
 * - Outputs (what this enables for next milestones)
 * - Handoff section
 *
 * @param milestone - The milestone object
 * @returns Markdown content for milestone.md
 */
export function generateMilestoneFile(milestone: Milestone): string {
  let content = `# M${milestone.number}: ${milestone.title}\n\n`;

  // Status header
  const statusEmoji =
    milestone.status === 'completed' ? '✅' : milestone.status === 'in-progress' ? '🔄' : '🔴';
  content += `**Status**: ${statusEmoji} ${milestone.status === 'pending' ? 'Not started' : milestone.status}\n`;
  content += `**Duration**: ${milestone.phases.length * 1}-${milestone.phases.length * 2} weeks (estimated)\n`;
  content += `**Dependencies**: ${milestone.dependencies?.length ? milestone.dependencies.join(', ') : 'None'}\n\n`;
  content += `---\n\n`;

  // Overview
  content += `## Overview\n\n${milestone.description}\n\n`;
  content += `---\n\n`;

  // Phases table
  if (milestone.phases.length > 0) {
    content += `## Phases\n\n`;
    content += `| Phase | File | Duration | Dependencies | Owner |\n`;
    content += `|-------|------|----------|--------------|-------|\n`;
    for (const phase of milestone.phases) {
      const duration =
        phase.complexity === 'small'
          ? '0.5 weeks'
          : phase.complexity === 'large'
            ? '2 weeks'
            : '1 week';
      const deps = phase.dependencies?.length ? phase.dependencies.join(', ') : 'None';
      const paddedNum = String(phase.number).padStart(2, '0');
      content += `| ${phase.number} | [phase-${paddedNum}-${phase.name}.md](./phase-${paddedNum}-${phase.name}.md) | ${duration} | ${deps} | TBD |\n`;
    }
    content += '\n';
  }

  content += `---\n\n`;

  // Success Criteria
  content += `## Success Criteria\n\n`;
  content += `M${milestone.number} is **complete** when:\n\n`;
  content += `- [ ] All phases complete\n`;
  content += `- [ ] Tests passing\n`;
  content += `- [ ] Documentation updated\n`;
  content += `- [ ] Team reviewed and approved\n\n`;

  content += `---\n\n`;

  // Outputs
  content += `## Outputs\n\n`;
  content += `### For Next Milestone\n`;
  content += `- Foundation work ready for dependent features\n`;
  content += `- APIs stable and documented\n`;
  content += `- Types exported and usable\n\n`;

  content += `---\n\n`;

  // Handoff
  content += `## Handoff to M${milestone.number + 1}\n\n`;
  content += `Once M${milestone.number} is complete, the following can begin:\n\n`;
  content += `- Next milestone phases that depend on this work\n`;
  content += `- Parallel work streams that were blocked\n\n`;

  content += `---\n\n`;
  content += `**Next**: [Phase 1](./phase-01-${milestone.phases[0]?.name || 'start'}.md)\n`;

  return content;
}

/**
 * Parse a phase-XX-name.md file into a Phase object
 *
 * Expected format:
 * ```markdown
 * # Phase: Core Type Definitions
 *
 * ## Description
 * Add epic-related fields to the Feature type.
 *
 * ## Files to Modify
 * - libs/types/src/feature.ts
 *
 * ## Acceptance Criteria
 * - [ ] isEpic field added
 * - [ ] epicId field added
 *
 * ## Estimated Complexity
 * Small
 *
 * ## Dependencies
 * - None
 * ```
 *
 * @param content - Markdown content of the phase file
 * @param filename - Phase filename (e.g., "phase-01-types.md")
 * @returns Phase object
 */
export function parsePhaseFile(content: string, filename: string): Phase {
  const lines = content.split('\n');

  let title = '';
  let description = '';
  let filesToModify: string[] = [];
  let acceptanceCriteria: string[] = [];
  let complexity: PhaseComplexity = 'medium';
  let dependencies: string[] = [];
  let currentSection = '';

  // Extract number and name from filename (e.g., "phase-01-types.md" -> number: 1, name: "types")
  const match = filename.match(/^phase-(\d+)-(.+)\.md$/);
  const number = match ? parseInt(match[1], 10) : 1;
  const name = match ? match[2] : filename.replace('.md', '');

  for (const line of lines) {
    const trimmed = line.trim();

    // Parse title from first heading
    // Handles formats: "# Phase: Title", "# M1 Phase 1: Title", "# Phase 1: Title", "# Title"
    if (trimmed.startsWith('# Phase:') || trimmed.startsWith('# ')) {
      title = trimmed
        .replace(/^#\s*Phase:\s*/i, '') // Strip "# Phase:"
        .replace(/^#\s*(?:M\d+\s+)?Phase\s+\d+\s*:\s*/i, '') // Strip "# M1 Phase 1:" or "# Phase 1:"
        .replace(/^#\s*/, '') // Strip plain "# "
        .trim();
      continue;
    }

    // Track section changes
    if (trimmed.startsWith('## ')) {
      currentSection = trimmed.replace('## ', '').toLowerCase();
      continue;
    }

    // Parse content based on section
    if (currentSection === 'description' && trimmed) {
      description += (description ? '\n' : '') + trimmed;
    } else if (currentSection === 'files to modify' && trimmed.startsWith('-')) {
      filesToModify.push(trimmed.replace(/^-\s*/, '').trim());
    } else if (currentSection === 'acceptance criteria' && trimmed.startsWith('-')) {
      // Remove checkbox markers
      const criterion = trimmed
        .replace(/^-\s*/, '')
        .replace(/^\[[ x]\]\s*/i, '')
        .trim();
      acceptanceCriteria.push(criterion);
    } else if (currentSection === 'estimated complexity' && trimmed) {
      const lower = trimmed.toLowerCase();
      if (lower === 'small' || lower === 'medium' || lower === 'large') {
        complexity = lower as PhaseComplexity;
      }
    } else if (currentSection === 'dependencies' && trimmed.startsWith('-')) {
      const dep = trimmed.replace(/^-\s*/, '').trim();
      if (dep.toLowerCase() !== 'none') {
        dependencies.push(dep);
      }
    }
  }

  return {
    number,
    name,
    title: title || name,
    description,
    filesToModify: filesToModify.length > 0 ? filesToModify : undefined,
    acceptanceCriteria: acceptanceCriteria.length > 0 ? acceptanceCriteria : undefined,
    complexity,
    dependencies: dependencies.length > 0 ? dependencies : undefined,
  };
}

/**
 * Generate phase-XX-name.md content from a Phase object
 *
 * This follows the detailed format from the rpg-mcp project:
 * - Duration, Owner, Dependencies, Parallel Work header
 * - Overview section
 * - Sub-Phases (if any)
 * - Tasks with file paths
 * - Deliverables
 * - Verification Commands
 * - Handoff Checklist
 *
 * @param phase - The phase object
 * @param milestone - Parent milestone (for context)
 * @returns Markdown content for phase file
 */
export function generatePhaseFile(phase: Phase, milestone?: Milestone): string {
  const milestonePrefix = milestone ? `M${milestone.number} ` : '';
  let content = `# ${milestonePrefix}Phase ${phase.number}: ${phase.title}\n\n`;

  // Header metadata
  content += `**Duration**: ${phase.complexity === 'small' ? '0.5-1 week' : phase.complexity === 'large' ? '2+ weeks' : '1-1.5 weeks'}\n`;
  content += `**Owner**: TBD\n`;
  content += `**Dependencies**: ${phase.dependencies?.length ? phase.dependencies.join(', ') : 'None'}\n`;
  content += `**Parallel Work**: Can run alongside other phases (if applicable)\n\n`;
  content += `---\n\n`;

  // Overview
  content += `## Overview\n\n${phase.description}\n\n`;
  content += `---\n\n`;

  // Tasks section with files
  content += `## Tasks\n\n`;
  if (phase.filesToModify && phase.filesToModify.length > 0) {
    content += `### Files to Create/Modify\n`;
    for (const file of phase.filesToModify) {
      content += `- [ ] \`${file}\`\n`;
    }
    content += '\n';
  }

  // Acceptance criteria as verification
  if (phase.acceptanceCriteria && phase.acceptanceCriteria.length > 0) {
    content += `### Verification\n`;
    for (const criterion of phase.acceptanceCriteria) {
      content += `- [ ] ${criterion}\n`;
    }
    content += '\n';
  }

  content += `---\n\n`;

  // Deliverables
  content += `## Deliverables\n\n`;
  content += `- [ ] Code implemented and working\n`;
  content += `- [ ] Tests passing\n`;
  content += `- [ ] Documentation updated\n\n`;
  content += `---\n\n`;

  // Handoff checklist
  content += `## Handoff Checklist\n\n`;
  content += `Before marking Phase ${phase.number} complete:\n\n`;
  content += `- [ ] All tasks complete\n`;
  content += `- [ ] Tests passing\n`;
  content += `- [ ] Code reviewed\n`;
  content += `- [ ] PR merged to main\n`;
  content += `- [ ] Team notified\n\n`;

  // Next phase reference
  const nextPhase = phase.number + 1;
  content += `**Next**: Phase ${nextPhase}\n`;

  return content;
}

/**
 * Parse a SPARC PRD markdown file
 *
 * Expected format:
 * ```markdown
 * # PRD: Feature Name
 *
 * ## Situation
 * Current state, context...
 *
 * ## Problem
 * Issues to solve...
 *
 * ## Approach
 * Proposed solution...
 *
 * ## Results
 * Expected outcomes...
 *
 * ## Constraints
 * Limitations...
 * ```
 *
 * @param content - Markdown content of the PRD file
 * @returns SPARCPrd object
 */
export function parsePrdFile(content: string): SPARCPrd {
  const lines = content.split('\n');

  let situation = '';
  let problem = '';
  let approach = '';
  let results = '';
  let constraints = '';
  let currentSection = '';

  for (const line of lines) {
    const trimmed = line.trim();

    // Track section changes (case-insensitive)
    if (trimmed.startsWith('## ')) {
      currentSection = trimmed.replace('## ', '').toLowerCase();
      continue;
    }

    // Skip title line
    if (trimmed.startsWith('# ')) {
      continue;
    }

    // Parse content based on section
    if (currentSection === 'situation' || currentSection === 's - situation') {
      situation += (situation && trimmed ? '\n' : '') + line;
    } else if (currentSection === 'problem' || currentSection === 'p - problem') {
      problem += (problem && trimmed ? '\n' : '') + line;
    } else if (currentSection === 'approach' || currentSection === 'a - approach') {
      approach += (approach && trimmed ? '\n' : '') + line;
    } else if (currentSection === 'results' || currentSection === 'r - results') {
      results += (results && trimmed ? '\n' : '') + line;
    } else if (currentSection === 'constraints' || currentSection === 'c - constraints') {
      constraints += (constraints && trimmed ? '\n' : '') + line;
    }
  }

  return {
    situation: situation.trim(),
    problem: problem.trim(),
    approach: approach.trim(),
    results: results.trim(),
    constraints: constraints.trim(),
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Generate a SPARC PRD markdown file from a SPARCPrd object
 *
 * @param title - Title for the PRD
 * @param prd - The SPARCPrd object
 * @returns Markdown content for PRD file
 */
export function generatePrdFile(title: string, prd: SPARCPrd): string {
  let content = `# PRD: ${title}\n\n`;
  content += `## Situation\n${prd.situation}\n\n`;
  content += `## Problem\n${prd.problem}\n\n`;
  content += `## Approach\n${prd.approach}\n\n`;
  content += `## Results\n${prd.results}\n\n`;
  content += `## Constraints\n${prd.constraints}\n`;

  return content;
}

/**
 * Parse research.md file into a summary string
 *
 * @param content - Markdown content of the research file
 * @returns Research summary
 */
export function parseResearchFile(content: string): string {
  // The research file is mostly free-form, so we just return it cleaned up
  return content.trim();
}

/**
 * Convert a Phase to feature description format
 *
 * Creates a well-structured description suitable for creating a Feature.
 *
 * @param phase - The phase to convert
 * @param milestone - Parent milestone (for context)
 * @returns Description string for feature creation
 */
export function phaseToFeatureDescription(phase: Phase, milestone?: Milestone): string {
  let description = '';

  if (milestone) {
    description += `**Milestone:** ${milestone.title}\n\n`;
  }

  description += phase.description;

  if (phase.filesToModify && phase.filesToModify.length > 0) {
    description += '\n\n**Files to Modify:**\n';
    for (const file of phase.filesToModify) {
      description += `- ${file}\n`;
    }
  }

  if (phase.acceptanceCriteria && phase.acceptanceCriteria.length > 0) {
    description += '\n**Acceptance Criteria:**\n';
    for (const criterion of phase.acceptanceCriteria) {
      description += `- [ ] ${criterion}\n`;
    }
  }

  if (phase.complexity) {
    description += `\n**Complexity:** ${phase.complexity}`;
  }

  description +=
    '\n\n**Guardrails:** If this phase involves new or changed behavior, include tests that verify correctness. ' +
    'If this phase adds, removes, or changes a user-facing feature, API endpoint, configuration option, or service, ' +
    'update the relevant documentation in `docs/` to reflect those changes.';

  return description;
}

/**
 * Extract milestone dependencies from a list of milestone references
 *
 * Converts human-readable dependency references to milestone slugs.
 *
 * @param dependencies - Array of dependency references
 * @param allMilestones - Array of all milestones to match against
 * @returns Array of milestone slugs
 */
export function resolveMilestoneDependencies(
  dependencies: string[] | undefined,
  allMilestones: Milestone[]
): string[] {
  if (!dependencies || dependencies.length === 0) {
    return [];
  }

  const resolved: string[] = [];

  for (const dep of dependencies) {
    // Try to match by number (e.g., "Milestone 1", "01")
    const numberMatch = dep.match(/(\d+)/);
    if (numberMatch) {
      const num = parseInt(numberMatch[1], 10);
      const milestone = allMilestones.find((m) => m.number === num);
      if (milestone) {
        resolved.push(milestone.slug);
        continue;
      }
    }

    // Try to match by title (partial, case-insensitive)
    const lower = dep.toLowerCase();
    const milestone = allMilestones.find(
      (m) => m.title.toLowerCase().includes(lower) || m.slug.includes(lower)
    );
    if (milestone) {
      resolved.push(milestone.slug);
    }
  }

  return resolved;
}

/**
 * Extract phase dependencies from a list of phase references
 *
 * Converts human-readable dependency references to phase names.
 *
 * @param dependencies - Array of dependency references
 * @param allPhases - Array of all phases to match against
 * @returns Array of phase names
 */
export function resolvePhaseDependencies(
  dependencies: string[] | undefined,
  allPhases: Phase[]
): string[] {
  if (!dependencies || dependencies.length === 0) {
    return [];
  }

  const resolved: string[] = [];

  for (const dep of dependencies) {
    // Try to match by number (e.g., "Phase 1", "01")
    const numberMatch = dep.match(/(\d+)/);
    if (numberMatch) {
      const num = parseInt(numberMatch[1], 10);
      const phase = allPhases.find((p) => p.number === num);
      if (phase) {
        resolved.push(phase.name);
        continue;
      }
    }

    // Try to match by name/title (partial, case-insensitive)
    const lower = dep.toLowerCase();
    const phase = allPhases.find(
      (p) => p.title.toLowerCase().includes(lower) || p.name.includes(lower)
    );
    if (phase) {
      resolved.push(phase.name);
    }
  }

  return resolved;
}
