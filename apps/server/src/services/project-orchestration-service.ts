/**
 * Project Orchestration Service
 *
 * Handles the orchestration of creating features from project plans:
 * - Creates epic features for milestones
 * - Creates features for phases
 * - Sets up dependencies between features
 * - Emits progress events for UI updates
 */

import type { Feature, FeatureFactoryResult, Milestone, Phase, Project } from '@protolabsai/types';
import { getProjectJsonPath } from '@protolabsai/platform';
import { secureFs } from '@protolabsai/platform';
import { phaseToFeatureDescription, slugify } from '@protolabsai/utils';
import { FeatureLoader } from './feature-loader.js';
import type { EventEmitter } from '../lib/events.js';
import { getErrorMessage } from '../routes/projects/common.js';

// Epic colors for visual distinction
const EPIC_COLORS = [
  '#4F46E5', // Indigo
  '#7C3AED', // Violet
  '#EC4899', // Pink
  '#EF4444', // Red
  '#F97316', // Orange
  '#EAB308', // Yellow
  '#22C55E', // Green
  '#06B6D4', // Cyan
  '#3B82F6', // Blue
];

export interface OrchestrateFeaturesOptions {
  projectPath: string;
  projectSlug: string;
  createEpics?: boolean;
  setupDependencies?: boolean;
  initialStatus?: 'backlog' | 'in-progress';
}

/**
 * Normalize a dependency identifier for lookup
 * Handles variations in how dependencies might be specified
 */
function normalizeDependencyKey(key: string): string {
  return key
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Look up a dependency ID from maps using normalized keys
 */
function findDependencyId(
  depIdentifier: string,
  milestoneSlug: string,
  milestoneEpicMap: Record<string, string>,
  phaseFeatureMap: Record<string, string>
): string | undefined {
  // Try exact match first
  if (milestoneEpicMap[depIdentifier]) {
    return milestoneEpicMap[depIdentifier];
  }

  // Try normalized match in milestone map
  const normalizedDep = normalizeDependencyKey(depIdentifier);
  for (const [key, id] of Object.entries(milestoneEpicMap)) {
    if (normalizeDependencyKey(key) === normalizedDep) {
      return id;
    }
  }

  // Try as phase within same milestone
  const phaseKey = `${milestoneSlug}:${depIdentifier}`;
  if (phaseFeatureMap[phaseKey]) {
    return phaseFeatureMap[phaseKey];
  }

  // Try normalized phase key
  for (const [key, id] of Object.entries(phaseFeatureMap)) {
    const [ms, phase] = key.split(':');
    if (ms === milestoneSlug && normalizeDependencyKey(phase) === normalizedDep) {
      return id;
    }
  }

  return undefined;
}

/**
 * Orchestrate feature creation from a project plan
 *
 * @param project - The loaded project with milestones and phases
 * @param options - Configuration options
 * @param featureLoader - Feature loader instance
 * @param events - Optional event emitter for progress updates
 * @returns Result with created features and any errors
 */
export async function orchestrateProjectFeatures(
  project: Project,
  options: OrchestrateFeaturesOptions,
  featureLoader: FeatureLoader,
  events?: EventEmitter
): Promise<FeatureFactoryResult> {
  const {
    projectPath,
    projectSlug,
    createEpics = true,
    setupDependencies = true,
    initialStatus = 'backlog',
  } = options;

  // Emit start event
  events?.emit('project:features:start', {
    projectPath,
    projectSlug,
    milestoneCount: project.milestones.length,
    createEpics,
    setupDependencies,
  });

  const result: FeatureFactoryResult = {
    featuresCreated: 0,
    phaseFeatureMap: {},
    milestoneEpicMap: {},
    errors: [],
  };

  // Track created features for dependency resolution
  const createdFeatures: Map<string, Feature> = new Map();

  // ── Idempotency: build lookup of existing features by branchName ──
  const existingFeatures = await featureLoader.getAll(projectPath);
  const existingByBranch = new Map<string, Feature>();
  for (const f of existingFeatures) {
    if (f.branchName && f.projectSlug === projectSlug) {
      existingByBranch.set(f.branchName, f);
    }
  }

  // Phase 1: Create epics and features
  events?.emit('project:features:progress', {
    step: 'creating-features',
    message: 'Creating features from milestones and phases',
  });

  for (let mi = 0; mi < project.milestones.length; mi++) {
    const milestone = project.milestones[mi];
    let epicId: string | undefined;

    // Create epic feature for milestone if requested
    if (createEpics) {
      const epicBranch = `epic/${slugify(milestone.title, 40)}`;
      const existingEpic = existingByBranch.get(epicBranch);
      if (existingEpic) {
        // Reuse existing epic — idempotent on re-run
        epicId = existingEpic.id;
        result.milestoneEpicMap[milestone.slug] = epicId;
        createdFeatures.set(`epic:${milestone.slug}`, existingEpic);
        events?.emit('project:features:progress', {
          step: 'epic-created',
          milestoneSlug: milestone.slug,
          epicId,
        });
      } else {
        try {
          const epicFeature = await featureLoader.create(projectPath, {
            title: `[Epic] ${milestone.title}`,
            description: `# ${milestone.title}\n\n${milestone.description}\n\n## Phases\n${milestone.phases.map((p, i) => `${i + 1}. ${p.title}`).join('\n')}`,
            category: 'Epic',
            status: initialStatus,
            isEpic: true,
            epicColor: EPIC_COLORS[mi % EPIC_COLORS.length],
            branchName: epicBranch,
            projectSlug,
            milestoneSlug: milestone.slug,
          });
          epicId = epicFeature.id;
          result.milestoneEpicMap[milestone.slug] = epicId;
          result.featuresCreated++;
          createdFeatures.set(`epic:${milestone.slug}`, epicFeature);

          events?.emit('project:features:progress', {
            step: 'epic-created',
            milestoneSlug: milestone.slug,
            epicId,
          });
        } catch (err) {
          const errorMsg = `Failed to create epic for milestone ${milestone.slug}: ${getErrorMessage(err)}`;
          result.errors?.push(errorMsg);
          events?.emit('project:features:error', { error: errorMsg });
        }
      }
    }

    // Process phases within milestone
    for (const phase of milestone.phases) {
      try {
        // Generate unique key for this phase
        const phaseKey = `${milestone.slug}:${phase.name}`;
        const phaseBranch = `feature/${slugify(milestone.title, 20)}-${slugify(phase.title, 20)}`;
        const existingPhaseFeature = existingByBranch.get(phaseBranch);

        if (existingPhaseFeature) {
          // Reuse existing feature — idempotent on re-run
          result.phaseFeatureMap[phaseKey] = existingPhaseFeature.id;
          createdFeatures.set(phaseKey, existingPhaseFeature);
          events?.emit('project:features:progress', {
            step: 'feature-created',
            phaseKey,
            featureId: existingPhaseFeature.id,
          });
        } else {
          // Build feature description from phase
          const description = phaseToFeatureDescription(phase, milestone);

          // Create feature — Phase 1 of each milestone is marked as foundation
          // so downstream phases wait for its PR to merge before starting
          const feature = await featureLoader.create(projectPath, {
            title: phase.title,
            description,
            category: milestone.title,
            status: initialStatus,
            isEpic: false,
            epicId,
            branchName: phaseBranch,
            isFoundation: phase.number === 1,
            projectSlug,
            milestoneSlug: milestone.slug,
            phaseSlug: phase.name,
          });

          result.phaseFeatureMap[phaseKey] = feature.id;
          result.featuresCreated++;
          createdFeatures.set(phaseKey, feature);

          events?.emit('project:features:progress', {
            step: 'feature-created',
            phaseKey,
            featureId: feature.id,
          });
        }
      } catch (err) {
        const errorMsg = `Failed to create feature for phase ${phase.name}: ${getErrorMessage(err)}`;
        result.errors?.push(errorMsg);
        events?.emit('project:features:error', { error: errorMsg });
      }
    }
  }

  // Phase 2: Set up dependencies
  if (setupDependencies) {
    events?.emit('project:features:progress', {
      step: 'setting-dependencies',
      message: 'Wiring feature dependencies',
    });

    for (let mi = 0; mi < project.milestones.length; mi++) {
      const milestone = project.milestones[mi];

      // Process milestone dependencies (epic -> epic)
      const epicId = result.milestoneEpicMap[milestone.slug];
      if (epicId) {
        const depIds: string[] = [];

        // Explicit milestone dependencies
        if (milestone.dependencies && milestone.dependencies.length > 0) {
          for (const depSlug of milestone.dependencies) {
            const depEpicId = findDependencyId(
              depSlug,
              milestone.slug,
              result.milestoneEpicMap,
              result.phaseFeatureMap
            );
            if (depEpicId) {
              depIds.push(depEpicId);
            }
          }
        }

        // Automatic sequential dependency: each epic depends on the previous epic
        if (mi > 0) {
          const prevMilestone = project.milestones[mi - 1];
          const prevEpicId = result.milestoneEpicMap[prevMilestone.slug];
          if (prevEpicId && !depIds.includes(prevEpicId)) {
            depIds.push(prevEpicId);
          }
        }

        if (depIds.length > 0) {
          try {
            await featureLoader.update(projectPath, epicId, { dependencies: depIds });
          } catch (err) {
            result.errors?.push(
              `Failed to set dependencies for epic ${milestone.slug}: ${getErrorMessage(err)}`
            );
          }
        }
      }

      // Process phase dependencies
      for (let pi = 0; pi < milestone.phases.length; pi++) {
        const phase = milestone.phases[pi];
        const phaseKey = `${milestone.slug}:${phase.name}`;
        const featureId = result.phaseFeatureMap[phaseKey];

        if (!featureId) continue;

        const depIds: string[] = [];

        // Process explicit dependencies
        if (phase.dependencies && phase.dependencies.length > 0) {
          for (const depName of phase.dependencies) {
            const depFeatureId = findDependencyId(
              depName,
              milestone.slug,
              result.milestoneEpicMap,
              result.phaseFeatureMap
            );
            if (depFeatureId) {
              depIds.push(depFeatureId);
            }
          }
        }

        // Sequential dependency: phase N depends on phase N-1 within the milestone
        if (phase.number > 1) {
          const prevPhase = milestone.phases.find((p) => p.number === phase.number - 1);
          if (prevPhase) {
            const prevKey = `${milestone.slug}:${prevPhase.name}`;
            const prevFeatureId = result.phaseFeatureMap[prevKey];
            if (prevFeatureId && !depIds.includes(prevFeatureId)) {
              depIds.push(prevFeatureId);
            }
          }
        }

        // Cross-milestone dependency: first phase of each milestone depends on previous epic
        if (phase.number === 1 && mi > 0) {
          const prevMilestone = project.milestones[mi - 1];
          const prevEpicId = result.milestoneEpicMap[prevMilestone.slug];
          if (prevEpicId && !depIds.includes(prevEpicId)) {
            depIds.push(prevEpicId);
          }
        }

        if (depIds.length > 0) {
          try {
            await featureLoader.update(projectPath, featureId, { dependencies: depIds });
          } catch (err) {
            result.errors?.push(
              `Failed to set dependencies for phase ${phase.name}: ${getErrorMessage(err)}`
            );
          }
        }
      }
    }

    // Phase 2.5: Detect file contention and add sequential dependencies
    events?.emit('project:features:progress', {
      step: 'checking-file-contention',
      message: 'Detecting file contention between phases',
    });

    // Build a list of all phases with their metadata
    interface PhaseMetadata {
      milestoneIndex: number;
      milestone: Milestone;
      phase: Phase;
      featureId: string;
      phaseKey: string;
    }

    const allPhases: PhaseMetadata[] = [];
    for (let mi = 0; mi < project.milestones.length; mi++) {
      const milestone = project.milestones[mi];
      for (const phase of milestone.phases) {
        const phaseKey = `${milestone.slug}:${phase.name}`;
        const featureId = result.phaseFeatureMap[phaseKey];
        if (featureId && phase.filesToModify && phase.filesToModify.length > 0) {
          allPhases.push({
            milestoneIndex: mi,
            milestone,
            phase,
            featureId,
            phaseKey,
          });
        }
      }
    }

    // Check each pair of phases for file contention
    for (let i = 0; i < allPhases.length; i++) {
      for (let j = i + 1; j < allPhases.length; j++) {
        const phaseA = allPhases[i];
        const phaseB = allPhases[j];

        // Check for file overlap
        const filesA = phaseA.phase.filesToModify || [];
        const filesB = phaseB.phase.filesToModify || [];
        const sharedFiles = filesA.filter((file) => filesB.includes(file));

        if (sharedFiles.length === 0) {
          continue; // No overlap
        }

        // phaseA is always earlier than phaseB (since i < j in iteration order)
        const earlierPhase = phaseA;
        const laterPhase = phaseB;

        // Check if there's already a dependency between them
        const laterFeature = createdFeatures.get(laterPhase.phaseKey);
        if (!laterFeature) continue;

        const laterDeps = laterFeature.dependencies || [];
        if (laterDeps.includes(earlierPhase.featureId)) {
          continue; // Dependency already exists
        }

        // Add dependency: later phase depends on earlier phase
        const updatedDeps = [...laterDeps, earlierPhase.featureId];
        try {
          await featureLoader.update(projectPath, laterPhase.featureId, {
            dependencies: updatedDeps,
          });

          // Update in-memory feature
          laterFeature.dependencies = updatedDeps;

          // Log warning with the files that caused contention
          const fileList = sharedFiles.join(', ');
          console.warn(
            `File contention detected: phase ${earlierPhase.phase.name} and phase ${laterPhase.phase.name} both modify ${fileList} — adding sequential dependency`
          );
        } catch (err) {
          result.errors?.push(
            `Failed to add file contention dependency between ${earlierPhase.phase.name} and ${laterPhase.phase.name}: ${getErrorMessage(err)}`
          );
        }
      }
    }
  }

  // Phase 3: Update project with feature links
  events?.emit('project:features:progress', {
    step: 'updating-project',
    message: 'Linking features to project',
  });

  try {
    project.status = 'active';
    project.updatedAt = new Date().toISOString();

    // Link phases to features
    for (const milestone of project.milestones) {
      milestone.epicId = result.milestoneEpicMap[milestone.slug];
      for (const phase of milestone.phases) {
        const phaseKey = `${milestone.slug}:${phase.name}`;
        phase.featureId = result.phaseFeatureMap[phaseKey];
      }
    }

    // Save updated project
    const jsonPath = getProjectJsonPath(projectPath, projectSlug);
    await secureFs.writeFile(jsonPath, JSON.stringify(project, null, 2), 'utf-8');
  } catch (err) {
    const errorMsg = `Failed to update project.json: ${getErrorMessage(err)}`;
    result.errors?.push(errorMsg);
    events?.emit('project:features:error', { error: errorMsg });
  }

  // Emit completion
  const errorCount = result.errors?.length ?? 0;
  events?.emit('project:features:done', {
    projectSlug,
    featuresCreated: result.featuresCreated,
    errorCount,
  });

  // Only emit project:scaffolded hook event if scaffolding succeeded without errors
  if (errorCount === 0) {
    events?.emit('project:scaffolded', {
      projectPath,
      projectSlug,
      projectTitle: project.title,
      milestoneCount: project.milestones.length,
      featuresCreated: result.featuresCreated,
    });
  }

  return result;
}
