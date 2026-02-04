/**
 * POST /create-features endpoint - Create features from a project plan
 *
 * Converts project phases into features on the Kanban board:
 * - Each phase becomes a feature
 * - Each milestone can optionally become an epic
 * - Dependencies are translated to feature dependencies
 */

import type { Request, Response } from 'express';
import type { Feature, FeatureFactoryResult, Project, Milestone, Phase } from '@automaker/types';
import { getProjectJsonPath, projectPlanExists } from '@automaker/platform';
import { secureFs } from '@automaker/platform';
import { phaseToFeatureDescription, slugify } from '@automaker/utils';
import { FeatureLoader } from '../../../services/feature-loader.js';
import { getErrorMessage, logError } from '../common.js';

interface CreateFeaturesRequest {
  projectPath: string;
  projectSlug: string;
  createEpics?: boolean;
  setupDependencies?: boolean;
  initialStatus?: 'backlog' | 'in-progress';
}

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

export function createCreateFeaturesHandler(featureLoader: FeatureLoader) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        projectPath,
        projectSlug,
        createEpics = true,
        setupDependencies = true,
        initialStatus = 'backlog',
      } = req.body as CreateFeaturesRequest;

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }
      if (!projectSlug) {
        res.status(400).json({ success: false, error: 'projectSlug is required' });
        return;
      }

      // Check if project exists
      const exists = await projectPlanExists(projectPath, projectSlug);
      if (!exists) {
        res.status(404).json({ success: false, error: `Project "${projectSlug}" not found` });
        return;
      }

      // Load project
      const jsonPath = getProjectJsonPath(projectPath, projectSlug);
      let project: Project;
      try {
        const jsonContent = (await secureFs.readFile(jsonPath, 'utf-8')) as string;
        project = JSON.parse(jsonContent) as Project;
      } catch {
        res.status(500).json({ success: false, error: 'Failed to load project.json' });
        return;
      }

      if (!project.milestones || project.milestones.length === 0) {
        res.status(400).json({ success: false, error: 'Project has no milestones' });
        return;
      }

      const result: FeatureFactoryResult = {
        featuresCreated: 0,
        phaseFeatureMap: {},
        milestoneEpicMap: {},
        errors: [],
      };

      // Track created features for dependency resolution
      const createdFeatures: Map<string, Feature> = new Map();

      // Process milestones
      for (let mi = 0; mi < project.milestones.length; mi++) {
        const milestone = project.milestones[mi];
        let epicId: string | undefined;

        // Create epic feature for milestone if requested
        if (createEpics) {
          try {
            const epicFeature = await featureLoader.create(projectPath, {
              title: `[Epic] ${milestone.title}`,
              description: `# ${milestone.title}\n\n${milestone.description}\n\n## Phases\n${milestone.phases.map((p, i) => `${i + 1}. ${p.title}`).join('\n')}`,
              category: 'Epic',
              status: initialStatus,
              isEpic: true,
              epicColor: EPIC_COLORS[mi % EPIC_COLORS.length],
              branchName: `epic/${slugify(milestone.title, 40)}`,
            });
            epicId = epicFeature.id;
            result.milestoneEpicMap[milestone.slug] = epicId;
            result.featuresCreated++;
            createdFeatures.set(`epic:${milestone.slug}`, epicFeature);
          } catch (err) {
            result.errors?.push(
              `Failed to create epic for milestone ${milestone.slug}: ${getErrorMessage(err)}`
            );
          }
        }

        // Process phases within milestone
        for (const phase of milestone.phases) {
          try {
            // Build feature description from phase
            const description = phaseToFeatureDescription(phase, milestone);

            // Generate unique key for this phase
            const phaseKey = `${milestone.slug}:${phase.name}`;

            // Create feature
            const feature = await featureLoader.create(projectPath, {
              title: phase.title,
              description,
              category: milestone.title,
              status: initialStatus,
              isEpic: false,
              epicId,
              branchName: `feature/${slugify(milestone.title, 20)}-${slugify(phase.title, 20)}`,
            });

            result.phaseFeatureMap[phaseKey] = feature.id;
            result.featuresCreated++;
            createdFeatures.set(phaseKey, feature);
          } catch (err) {
            result.errors?.push(
              `Failed to create feature for phase ${phase.name}: ${getErrorMessage(err)}`
            );
          }
        }
      }

      // Set up dependencies if requested
      if (setupDependencies) {
        // Process milestone dependencies (epic -> epic)
        for (const milestone of project.milestones) {
          if (milestone.dependencies && milestone.dependencies.length > 0) {
            const epicId = result.milestoneEpicMap[milestone.slug];
            if (epicId) {
              const depIds: string[] = [];
              for (const depSlug of milestone.dependencies) {
                const depEpicId = result.milestoneEpicMap[depSlug];
                if (depEpicId) {
                  depIds.push(depEpicId);
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
          }

          // Process phase dependencies (feature -> feature within same milestone)
          const milestoneEpicId = result.milestoneEpicMap[milestone.slug];
          for (const phase of milestone.phases) {
            if (phase.dependencies && phase.dependencies.length > 0) {
              const phaseKey = `${milestone.slug}:${phase.name}`;
              const featureId = result.phaseFeatureMap[phaseKey];
              if (featureId) {
                const depIds: string[] = [];
                for (const depName of phase.dependencies) {
                  // Look for dependency within same milestone
                  const depKey = `${milestone.slug}:${depName}`;
                  const depFeatureId = result.phaseFeatureMap[depKey];
                  if (depFeatureId) {
                    depIds.push(depFeatureId);
                  }
                }
                // Also depend on previous phase if phases have no explicit dependencies
                if (depIds.length === 0 && milestoneEpicId && phase.number > 1) {
                  // Find previous phase in same milestone
                  const prevPhase = milestone.phases.find((p) => p.number === phase.number - 1);
                  if (prevPhase) {
                    const prevKey = `${milestone.slug}:${prevPhase.name}`;
                    const prevFeatureId = result.phaseFeatureMap[prevKey];
                    if (prevFeatureId) {
                      depIds.push(prevFeatureId);
                    }
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
          }
        }
      }

      // Update project status and link to features
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
        await secureFs.writeFile(jsonPath, JSON.stringify(project, null, 2), 'utf-8');
      } catch (err) {
        result.errors?.push(`Failed to update project.json: ${getErrorMessage(err)}`);
      }

      res.json({ success: true, result });
    } catch (error) {
      logError(error, 'Create features from project failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
