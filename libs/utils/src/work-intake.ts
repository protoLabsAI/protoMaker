/**
 * Work Intake — pure functions for pull-based phase claiming.
 *
 * These functions are the decision-making core of the WorkIntakeService.
 * They have no side effects, no I/O, and no dependencies on server services.
 * All state is passed in, all results are returned.
 */

import type {
  Phase,
  Milestone,
  Project,
  InstanceRole,
  InstanceIdentity,
  PhaseComplexity,
} from '@protolabsai/types';

// ---------------------------------------------------------------------------
// Role affinity — maps file paths to roles
// ---------------------------------------------------------------------------

const ROLE_PATH_PATTERNS: Record<InstanceRole, RegExp[]> = {
  frontend: [/apps\/ui\b/, /components\//, /\.tsx$/, /\.css$/, /tailwind/, /\.stories\./],
  backend: [/apps\/server\b/, /routes\//, /services\//, /\.controller\./, /\.service\./],
  infra: [/\.github\//, /docker/, /ci\//, /deploy/, /\.yml$/, /\.yaml$/, /terraform/],
  docs: [/docs\//, /\.md$/, /\.mdx$/, /site\//],
  qa: [/tests?\//, /\.test\./, /\.spec\./, /playwright/, /vitest/],
  fullstack: [], // matches everything
};

/**
 * Check if an instance role (plus optional tags) has affinity for a phase.
 * Affinity is based on the phase's filesToModify paths.
 *
 * `fullstack` role always matches. Other roles match if any file pattern
 * matches any filesToModify entry. Tags expand the match — a `backend`
 * instance with `tags: ['infra']` matches infra paths too.
 */
export function roleMatchesPhase(
  role: InstanceRole,
  tags: string[] | undefined,
  phase: Phase
): boolean {
  // fullstack matches everything
  if (role === 'fullstack') return true;

  // No files listed → any role can claim
  if (!phase.filesToModify || phase.filesToModify.length === 0) return true;

  // Collect all roles to check (primary + tags that are valid roles)
  const rolesToCheck: InstanceRole[] = [role];
  if (tags) {
    for (const tag of tags) {
      if (tag in ROLE_PATH_PATTERNS && tag !== role) {
        rolesToCheck.push(tag as InstanceRole);
      }
    }
  }

  // Check if any file matches any role pattern
  for (const r of rolesToCheck) {
    const patterns = ROLE_PATH_PATTERNS[r];
    if (patterns.length === 0) continue; // fullstack has no patterns
    for (const file of phase.filesToModify) {
      for (const pattern of patterns) {
        if (pattern.test(file)) return true;
      }
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// Dependency resolution
// ---------------------------------------------------------------------------

/**
 * Check if all dependencies for a phase are satisfied (executionStatus === 'done').
 * Dependencies are phase names within the same milestone, or cross-milestone
 * via milestone dependencies.
 */
export function phaseDepsAreSatisfied(
  phase: Phase,
  milestone: Milestone,
  project: Project
): boolean {
  // Check intra-milestone dependencies (phase.dependencies)
  if (phase.dependencies && phase.dependencies.length > 0) {
    for (const depName of phase.dependencies) {
      const depPhase = milestone.phases.find((p) => p.name === depName);
      if (!depPhase || depPhase.executionStatus !== 'done') return false;
    }
  }

  // Check milestone-level dependencies
  if (milestone.dependencies && milestone.dependencies.length > 0) {
    for (const depSlug of milestone.dependencies) {
      const depMilestone = project.milestones.find((m) => m.slug === depSlug);
      if (!depMilestone) return false;
      // All phases in the dependency milestone must be done
      const allDone = depMilestone.phases.every((p) => p.executionStatus === 'done');
      if (!allDone) return false;
    }
  }

  return true;
}

// ---------------------------------------------------------------------------
// Claimability
// ---------------------------------------------------------------------------

/**
 * Get all phases across all milestones that this instance can claim.
 * A phase is claimable when:
 *   1. executionStatus is 'unclaimed' (or undefined)
 *   2. All dependencies are satisfied
 *   3. Role/tags have affinity for the phase
 */
export function getClaimablePhases(
  project: Project,
  instanceId: string,
  role: InstanceRole,
  tags?: string[]
): Array<{ milestone: Milestone; phase: Phase }> {
  const results: Array<{ milestone: Milestone; phase: Phase }> = [];

  for (const milestone of project.milestones) {
    for (const phase of milestone.phases) {
      // Already materialized into a feature — never re-create
      if (phase.featureId) continue;

      // Already claimed or in progress or done
      const status = phase.executionStatus ?? 'unclaimed';
      if (status !== 'unclaimed') continue;

      // Dependencies must be satisfied
      if (!phaseDepsAreSatisfied(phase, milestone, project)) continue;

      // Role affinity
      if (!roleMatchesPhase(role, tags, phase)) continue;

      results.push({ milestone, phase });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Claim verification
// ---------------------------------------------------------------------------

/**
 * Verify that a claim is still held by this instance after sync merge.
 * Returns true if the phase's claimedBy matches instanceId.
 */
export function holdsClaim(phase: Phase, instanceId: string): boolean {
  return phase.claimedBy === instanceId;
}

// ---------------------------------------------------------------------------
// Stale claim recovery
// ---------------------------------------------------------------------------

/**
 * Check if a phase's claim is stale and can be reclaimed.
 * A claim is reclaimable when:
 *   1. executionStatus is 'claimed' or 'in_progress'
 *   2. The claiming instance is offline (not in peerStatus or status === 'offline')
 *   3. The claim age exceeds claimTimeoutMs
 */
export function isReclaimable(
  phase: Phase,
  peerStatus: Map<string, InstanceIdentity>,
  claimTimeoutMs: number,
  now: number = Date.now()
): boolean {
  const status = phase.executionStatus ?? 'unclaimed';
  if (status !== 'claimed' && status !== 'in_progress') return false;
  if (!phase.claimedBy || !phase.claimedAt) return false;

  // Check if the claiming instance is still online
  const peer = peerStatus.get(phase.claimedBy);
  if (peer && peer.status === 'online') return false;

  // Check claim age
  const claimAge = now - new Date(phase.claimedAt).getTime();
  return claimAge >= claimTimeoutMs;
}

// ---------------------------------------------------------------------------
// Feature materialization
// ---------------------------------------------------------------------------

/**
 * Convert a project phase into a local Feature object for board execution.
 * This is a pure data transform — no disk I/O.
 */
/**
 * Shape returned by materializeFeature — subset of Feature fields
 * that can be passed to FeatureLoader.create().
 */
export interface MaterializedFeature {
  title: string;
  description: string;
  category: string;
  status: 'backlog';
  complexity: PhaseComplexity;
  projectSlug: string;
  milestoneSlug: string;
  phaseSlug: string;
  epicId?: string;
  filesToModify?: string[];
  claimedBy: string;
}

export function materializeFeature(
  project: Project,
  milestone: Milestone,
  phase: Phase,
  instanceId: string
): MaterializedFeature {
  const complexity: PhaseComplexity = phase.complexity ?? 'medium';

  return {
    title: phase.title,
    description: buildPhaseDescription(project, milestone, phase),
    category: 'feature',
    status: 'backlog',
    complexity,
    projectSlug: project.slug,
    milestoneSlug: milestone.slug,
    phaseSlug: phase.name,
    epicId: milestone.epicId,
    filesToModify: phase.filesToModify,
    claimedBy: instanceId,
  };
}

/**
 * Build a rich description for a materialized feature from its phase context.
 */
function buildPhaseDescription(project: Project, milestone: Milestone, phase: Phase): string {
  const lines: string[] = [];

  lines.push(phase.description);
  lines.push('');
  lines.push(`**Project:** ${project.title}`);
  lines.push(`**Milestone:** ${milestone.title}`);

  if (phase.dependencies && phase.dependencies.length > 0) {
    lines.push(`**Dependencies:** ${phase.dependencies.join(', ')}`);
  }

  if (phase.acceptanceCriteria && phase.acceptanceCriteria.length > 0) {
    lines.push('');
    lines.push('**Acceptance Criteria:**');
    for (const criterion of phase.acceptanceCriteria) {
      lines.push(`- [ ] ${criterion}`);
    }
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

/** Priority score for sorting claimable phases. Lower = higher priority. */
export function phasePriority(project: Project, milestone: Milestone, phase: Phase): number {
  // Project priority weight
  const priorityWeights: Record<string, number> = {
    urgent: 0,
    high: 1000,
    medium: 2000,
    low: 3000,
    none: 4000,
  };
  const projectWeight = priorityWeights[project.priority ?? 'medium'] ?? 2000;

  // Milestone order within project
  const milestoneOrder = milestone.number * 100;

  // Phase order within milestone
  const phaseOrder = phase.number;

  return projectWeight + milestoneOrder + phaseOrder;
}
