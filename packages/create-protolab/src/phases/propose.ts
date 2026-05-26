/**
 * Alignment Proposal Service
 *
 * Converts gap analysis results into Automaker board features organized
 * into milestones with proper dependencies.
 */

import type {
  GapAnalysisReport,
  GapItem,
  AlignmentProposal,
  AlignmentMilestone,
  AlignmentFeature,
} from '../types.js';

/** Milestone definitions and which gap IDs belong to each */
const MILESTONE_DEFS: { title: string; gapIds: string[] }[] = [
  {
    title: 'Foundation',
    gapIds: [
      'package-manager',
      'turborepo',
      'typescript-setup',
      'typescript-strict',
      'typescript-composite',
    ],
  },
  {
    title: 'Quality Gates',
    gapIds: [
      'ci-pipeline',
      'ci-build-check',
      'ci-test-check',
      'ci-format-check',
      'ci-security-audit',
      'branch-protection',
      'prettier',
      'eslint',
      'eslint-v9',
      'pre-commit-hooks',
    ],
  },
  {
    title: 'Testing',
    gapIds: ['testing-framework', 'testing-migrate-jest', 'playwright', 'python-pytest'],
  },
  {
    title: 'UI & Components',
    gapIds: ['tailwind', 'shadcn', 'storybook'],
  },
  {
    title: 'Automation & Agents',
    gapIds: [
      'automaker-init',
      'discord',
      'coderabbit',
      'analytics',
      'mcp-servers',
      'agent-sdk',
      'payload',
      'python-ruff',
    ],
  },
];

/** Map gap severity to feature priority */
function severityToPriority(severity: string): number {
  switch (severity) {
    case 'critical':
      return 1; // Urgent
    case 'recommended':
      return 2; // High
    case 'optional':
      return 3; // Normal
    default:
      return 3;
  }
}

/**
 * Generate an alignment proposal from gap analysis results.
 * Organizes gaps into milestones with proper feature metadata.
 */
export function generateProposal(gapAnalysis: GapAnalysisReport): AlignmentProposal {
  const gapMap = new Map<string, GapItem>();
  for (const gap of gapAnalysis.gaps) {
    gapMap.set(gap.id, gap);
  }

  const milestones: AlignmentMilestone[] = [];
  const assignedGapIds = new Set<string>();
  const effortCount = { small: 0, medium: 0, large: 0 };

  let milestoneIndex = 0;

  for (const def of MILESTONE_DEFS) {
    const features: AlignmentFeature[] = [];

    for (const gapId of def.gapIds) {
      const gap = gapMap.get(gapId);
      if (!gap) continue;
      assignedGapIds.add(gapId);

      features.push({
        title: gap.title,
        description: gap.featureDescription,
        complexity: gap.effort,
        priority: severityToPriority(gap.severity),
        gapId: gap.id,
        dependsOnMilestone: milestoneIndex > 0 ? milestoneIndex - 1 : undefined,
      });

      effortCount[gap.effort]++;
    }

    if (features.length > 0) {
      // Sort by priority (urgent first) then effort (small first)
      features.sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        const effortOrder = { small: 0, medium: 1, large: 2 };
        return effortOrder[a.complexity] - effortOrder[b.complexity];
      });

      milestones.push({
        title: def.title,
        features,
        order: milestoneIndex,
        dependsOn: milestoneIndex > 0 ? [milestoneIndex - 1] : [],
      });
      milestoneIndex++;
    }
  }

  // Catch any unassigned gaps into an "Other" milestone
  const unassigned: AlignmentFeature[] = [];
  for (const gap of gapAnalysis.gaps) {
    if (!assignedGapIds.has(gap.id)) {
      unassigned.push({
        title: gap.title,
        description: gap.featureDescription,
        complexity: gap.effort,
        priority: severityToPriority(gap.severity),
        gapId: gap.id,
      });
      effortCount[gap.effort]++;
    }
  }
  if (unassigned.length > 0) {
    milestones.push({
      title: 'Other',
      features: unassigned,
      order: milestoneIndex,
      dependsOn: [], // "Other" has no dependencies — can run in parallel
    });
    milestoneIndex++;
  }

  const totalFeatures = milestones.reduce((sum, m) => sum + m.features.length, 0);
  const dependencyOrder = milestones.map((m) => m.order);

  return {
    projectPath: gapAnalysis.projectPath,
    milestones,
    totalFeatures,
    estimatedEffort: effortCount,
    dependencyOrder,
  };
}
