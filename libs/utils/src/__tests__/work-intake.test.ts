import { describe, it, expect } from 'vitest';

import type { Phase, Milestone, Project, InstanceIdentity } from '@protolabsai/types';

import {
  roleMatchesPhase,
  phaseDepsAreSatisfied,
  getClaimablePhases,
  holdsClaim,
  isReclaimable,
  materializeFeature,
  phasePriority,
} from '../work-intake.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePhase(overrides: Partial<Phase> = {}): Phase {
  return {
    number: 1,
    name: 'types',
    title: 'Core Types',
    description: 'Add core type definitions',
    ...overrides,
  };
}

function makeMilestone(overrides: Partial<Milestone> = {}): Milestone {
  return {
    number: 1,
    slug: 'foundation',
    title: 'Foundation',
    description: 'Foundation milestone',
    phases: [makePhase()],
    status: 'pending',
    ...overrides,
  };
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    slug: 'test-project',
    title: 'Test Project',
    goal: 'Test goal',
    status: 'active',
    milestones: [makeMilestone()],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makePeer(instanceId: string, status: 'online' | 'offline' = 'online'): InstanceIdentity {
  return {
    instanceId,
    status,
    capacity: {
      cores: 4,
      ramMb: 8192,
      maxAgents: 3,
      runningAgents: 0,
      backlogCount: 0,
      ramUsagePercent: 50,
      cpuPercent: 30,
    },
    domains: [],
  };
}

// ---------------------------------------------------------------------------
// roleMatchesPhase
// ---------------------------------------------------------------------------

describe('roleMatchesPhase', () => {
  it('fullstack matches everything', () => {
    const phase = makePhase({ filesToModify: ['apps/server/src/routes/foo.ts'] });
    expect(roleMatchesPhase('fullstack', undefined, phase)).toBe(true);
  });

  it('matches when no files listed', () => {
    const phase = makePhase({ filesToModify: [] });
    expect(roleMatchesPhase('frontend', undefined, phase)).toBe(true);
  });

  it('matches when filesToModify is undefined', () => {
    const phase = makePhase({ filesToModify: undefined });
    expect(roleMatchesPhase('backend', undefined, phase)).toBe(true);
  });

  it('backend matches server paths', () => {
    const phase = makePhase({ filesToModify: ['apps/server/src/services/foo.ts'] });
    expect(roleMatchesPhase('backend', undefined, phase)).toBe(true);
  });

  it('frontend matches UI paths', () => {
    const phase = makePhase({ filesToModify: ['apps/ui/src/components/Button.tsx'] });
    expect(roleMatchesPhase('frontend', undefined, phase)).toBe(true);
  });

  it('frontend does NOT match server paths', () => {
    const phase = makePhase({ filesToModify: ['apps/server/src/routes/api.ts'] });
    expect(roleMatchesPhase('frontend', undefined, phase)).toBe(false);
  });

  it('tags expand role matching', () => {
    const phase = makePhase({ filesToModify: ['apps/server/src/services/auth.ts'] });
    // frontend role but with backend tag
    expect(roleMatchesPhase('frontend', ['backend'], phase)).toBe(true);
  });

  it('infra matches CI/CD paths', () => {
    const phase = makePhase({ filesToModify: ['.github/workflows/ci.yml'] });
    expect(roleMatchesPhase('infra', undefined, phase)).toBe(true);
  });

  it('docs matches documentation paths', () => {
    const phase = makePhase({ filesToModify: ['docs/dev/architecture.md'] });
    expect(roleMatchesPhase('docs', undefined, phase)).toBe(true);
  });

  it('qa matches test paths', () => {
    const phase = makePhase({ filesToModify: ['apps/server/tests/unit/foo.test.ts'] });
    expect(roleMatchesPhase('qa', undefined, phase)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// phaseDepsAreSatisfied
// ---------------------------------------------------------------------------

describe('phaseDepsAreSatisfied', () => {
  it('returns true when no dependencies', () => {
    const phase = makePhase({ dependencies: [] });
    const milestone = makeMilestone({ phases: [phase] });
    const project = makeProject({ milestones: [milestone] });
    expect(phaseDepsAreSatisfied(phase, milestone, project)).toBe(true);
  });

  it('returns true when all phase deps are done', () => {
    const dep = makePhase({ name: 'types', executionStatus: 'done' });
    const phase = makePhase({ number: 2, name: 'server', dependencies: ['types'] });
    const milestone = makeMilestone({ phases: [dep, phase] });
    const project = makeProject({ milestones: [milestone] });
    expect(phaseDepsAreSatisfied(phase, milestone, project)).toBe(true);
  });

  it('returns false when phase dep is not done', () => {
    const dep = makePhase({ name: 'types', executionStatus: 'in_progress' });
    const phase = makePhase({ number: 2, name: 'server', dependencies: ['types'] });
    const milestone = makeMilestone({ phases: [dep, phase] });
    const project = makeProject({ milestones: [milestone] });
    expect(phaseDepsAreSatisfied(phase, milestone, project)).toBe(false);
  });

  it('returns false when phase dep has no executionStatus', () => {
    const dep = makePhase({ name: 'types' }); // executionStatus undefined
    const phase = makePhase({ number: 2, name: 'server', dependencies: ['types'] });
    const milestone = makeMilestone({ phases: [dep, phase] });
    const project = makeProject({ milestones: [milestone] });
    expect(phaseDepsAreSatisfied(phase, milestone, project)).toBe(false);
  });

  it('checks milestone-level dependencies', () => {
    const m1Phase = makePhase({ name: 'setup', executionStatus: 'done' });
    const m1 = makeMilestone({ number: 1, slug: 'foundation', phases: [m1Phase] });
    const m2Phase = makePhase({ name: 'ui' });
    const m2 = makeMilestone({
      number: 2,
      slug: 'ui-layer',
      phases: [m2Phase],
      dependencies: ['foundation'],
    });
    const project = makeProject({ milestones: [m1, m2] });
    expect(phaseDepsAreSatisfied(m2Phase, m2, project)).toBe(true);
  });

  it('fails when milestone dep has incomplete phases', () => {
    const m1Phase = makePhase({ name: 'setup', executionStatus: 'in_progress' });
    const m1 = makeMilestone({ number: 1, slug: 'foundation', phases: [m1Phase] });
    const m2Phase = makePhase({ name: 'ui' });
    const m2 = makeMilestone({
      number: 2,
      slug: 'ui-layer',
      phases: [m2Phase],
      dependencies: ['foundation'],
    });
    const project = makeProject({ milestones: [m1, m2] });
    expect(phaseDepsAreSatisfied(m2Phase, m2, project)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getClaimablePhases
// ---------------------------------------------------------------------------

describe('getClaimablePhases', () => {
  it('returns unclaimed phases with satisfied deps', () => {
    const p1 = makePhase({ name: 'types', executionStatus: 'done' });
    const p2 = makePhase({ number: 2, name: 'server', dependencies: ['types'] });
    const p3 = makePhase({ number: 3, name: 'ui', dependencies: ['types'] });
    const milestone = makeMilestone({ phases: [p1, p2, p3] });
    const project = makeProject({ milestones: [milestone] });

    const result = getClaimablePhases(project, 'instance-1', 'fullstack');
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.phase.name)).toEqual(['server', 'ui']);
  });

  it('skips already claimed phases', () => {
    const p1 = makePhase({ name: 'types', executionStatus: 'claimed', claimedBy: 'other' });
    const milestone = makeMilestone({ phases: [p1] });
    const project = makeProject({ milestones: [milestone] });

    const result = getClaimablePhases(project, 'instance-1', 'fullstack');
    expect(result).toHaveLength(0);
  });

  it('skips phases that already have a featureId (prevents duplicates)', () => {
    const p1 = makePhase({ name: 'types', featureId: 'feature-already-exists' });
    const milestone = makeMilestone({ phases: [p1] });
    const project = makeProject({ milestones: [milestone] });

    const result = getClaimablePhases(project, 'instance-1', 'fullstack');
    expect(result).toHaveLength(0);
  });

  it('filters by role affinity', () => {
    const p1 = makePhase({
      name: 'ui-comp',
      filesToModify: ['apps/ui/src/components/Foo.tsx'],
    });
    const milestone = makeMilestone({ phases: [p1] });
    const project = makeProject({ milestones: [milestone] });

    // backend role should not match UI files
    expect(getClaimablePhases(project, 'i1', 'backend')).toHaveLength(0);
    // frontend role should match
    expect(getClaimablePhases(project, 'i1', 'frontend')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// holdsClaim
// ---------------------------------------------------------------------------

describe('holdsClaim', () => {
  it('returns true when claimedBy matches', () => {
    const phase = makePhase({ claimedBy: 'instance-1' });
    expect(holdsClaim(phase, 'instance-1')).toBe(true);
  });

  it('returns false when claimedBy does not match', () => {
    const phase = makePhase({ claimedBy: 'instance-2' });
    expect(holdsClaim(phase, 'instance-1')).toBe(false);
  });

  it('returns false when no claimedBy', () => {
    const phase = makePhase();
    expect(holdsClaim(phase, 'instance-1')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isReclaimable
// ---------------------------------------------------------------------------

describe('isReclaimable', () => {
  const TIMEOUT = 30 * 60 * 1000; // 30 minutes

  it('reclaimable when instance is offline and claim is stale', () => {
    const phase = makePhase({
      executionStatus: 'in_progress',
      claimedBy: 'dead-instance',
      claimedAt: new Date(Date.now() - TIMEOUT - 1000).toISOString(),
    });
    const peers = new Map<string, InstanceIdentity>();
    // dead-instance not in peers at all
    expect(isReclaimable(phase, peers, TIMEOUT)).toBe(true);
  });

  it('not reclaimable when instance is online', () => {
    const phase = makePhase({
      executionStatus: 'in_progress',
      claimedBy: 'alive-instance',
      claimedAt: new Date(Date.now() - TIMEOUT - 1000).toISOString(),
    });
    const peers = new Map([['alive-instance', makePeer('alive-instance', 'online')]]);
    expect(isReclaimable(phase, peers, TIMEOUT)).toBe(false);
  });

  it('not reclaimable when claim is fresh', () => {
    const phase = makePhase({
      executionStatus: 'in_progress',
      claimedBy: 'dead-instance',
      claimedAt: new Date().toISOString(), // just now
    });
    const peers = new Map<string, InstanceIdentity>();
    expect(isReclaimable(phase, peers, TIMEOUT)).toBe(false);
  });

  it('not reclaimable when status is unclaimed', () => {
    const phase = makePhase({ executionStatus: 'unclaimed' });
    const peers = new Map<string, InstanceIdentity>();
    expect(isReclaimable(phase, peers, TIMEOUT)).toBe(false);
  });

  it('not reclaimable when status is done', () => {
    const phase = makePhase({
      executionStatus: 'done',
      claimedBy: 'instance-1',
      claimedAt: new Date(0).toISOString(),
    });
    const peers = new Map<string, InstanceIdentity>();
    expect(isReclaimable(phase, peers, TIMEOUT)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// materializeFeature
// ---------------------------------------------------------------------------

describe('materializeFeature', () => {
  it('creates a feature from a phase', () => {
    const phase = makePhase({
      title: 'Add API Routes',
      description: 'Create REST endpoints',
      complexity: 'large',
      filesToModify: ['apps/server/src/routes/api.ts'],
      acceptanceCriteria: ['Endpoints return 200', 'Tests pass'],
    });
    const milestone = makeMilestone({ title: 'API Layer', slug: 'api-layer' });
    const project = makeProject({ slug: 'my-proj', title: 'My Project' });

    const feature = materializeFeature(project, milestone, phase, 'instance-1');

    expect(feature.title).toBe('Add API Routes');
    expect(feature.status).toBe('backlog');
    expect(feature.complexity).toBe('large');
    expect(feature.projectSlug).toBe('my-proj');
    expect(feature.milestoneSlug).toBe('api-layer');
    expect(feature.phaseSlug).toBe('types');
    expect(feature.claimedBy).toBe('instance-1');
    expect(feature.filesToModify).toEqual(['apps/server/src/routes/api.ts']);
    expect(feature.description).toContain('Create REST endpoints');
    expect(feature.description).toContain('**Project:** My Project');
    expect(feature.description).toContain('**Milestone:** API Layer');
  });

  it('defaults complexity to medium', () => {
    const phase = makePhase();
    const milestone = makeMilestone();
    const project = makeProject();
    const feature = materializeFeature(project, milestone, phase, 'i1');
    expect(feature.complexity).toBe('medium');
  });
});

// ---------------------------------------------------------------------------
// phasePriority
// ---------------------------------------------------------------------------

describe('phasePriority', () => {
  it('urgent project has lower score than medium', () => {
    const phase = makePhase();
    const milestone = makeMilestone();
    const urgentProject = makeProject({ priority: 'urgent' });
    const mediumProject = makeProject({ priority: 'medium' });

    const urgentScore = phasePriority(urgentProject, milestone, phase);
    const mediumScore = phasePriority(mediumProject, milestone, phase);
    expect(urgentScore).toBeLessThan(mediumScore);
  });

  it('earlier milestone has lower score', () => {
    const phase = makePhase();
    const m1 = makeMilestone({ number: 1 });
    const m2 = makeMilestone({ number: 2 });
    const project = makeProject();

    expect(phasePriority(project, m1, phase)).toBeLessThan(phasePriority(project, m2, phase));
  });

  it('earlier phase within milestone has lower score', () => {
    const p1 = makePhase({ number: 1 });
    const p2 = makePhase({ number: 3 });
    const milestone = makeMilestone();
    const project = makeProject();

    expect(phasePriority(project, milestone, p1)).toBeLessThan(
      phasePriority(project, milestone, p2)
    );
  });
});
