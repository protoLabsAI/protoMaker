/**
 * Workflow tools — SharedTool wrappers for workflow discovery and management.
 *
 * Factory: createWorkflowTools(deps) returns LangGraph-compatible SharedTool
 * instances for listing available workflows.
 */

import { z } from 'zod';
import { defineSharedTool } from './define-tool.js';
import type { SharedTool } from './types.js';
import type { WorkflowDefinition } from '@protolabsai/types';

// ---------------------------------------------------------------------------
// Minimal structural interface — avoids importing the concrete WorkflowLoader
// ---------------------------------------------------------------------------

export interface WorkflowDeps {
  workflowLoader: {
    listWorkflows: (projectPath: string) => Promise<string[]>;
    resolve: (projectPath: string, name: string) => Promise<WorkflowDefinition | null>;
  };
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const ListWorkflowsInputSchema = z.object({
  projectPath: z.string().describe('Absolute path to the project directory'),
});

const ListWorkflowsOutputSchema = z.object({
  workflows: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      phases: z.array(z.string()),
      useWorktrees: z.boolean(),
      terminalStatus: z.string(),
      model: z.string().optional(),
    })
  ),
  count: z.number(),
});

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates workflow discovery tools bound to the provided WorkflowLoader.
 */
export function createWorkflowTools(deps: WorkflowDeps): SharedTool[] {
  const listWorkflowsTool = defineSharedTool({
    name: 'list_workflows',
    description:
      'List all available workflows for a project. Returns built-in workflows ' +
      '(standard, read-only, content, audit, research, tech-debt-scan, postmortem, ' +
      'dependency-health, cost-analysis, strategic-review, changelog-digest, swebench) ' +
      'plus any project-specific YAML overrides from .automaker/workflows/.',
    inputSchema: ListWorkflowsInputSchema,
    outputSchema: ListWorkflowsOutputSchema,
    metadata: { category: 'workflow', tags: ['workflow', 'list', 'discovery'] },
    execute: async (rawInput) => {
      const input = rawInput as z.infer<typeof ListWorkflowsInputSchema>;
      try {
        const names = await deps.workflowLoader.listWorkflows(input.projectPath);
        const workflows = [];
        for (const name of names) {
          const def = await deps.workflowLoader.resolve(input.projectPath, name);
          if (def) {
            workflows.push({
              name: def.name,
              description: def.description,
              phases: def.phases.filter((p) => p.enabled).map((p) => p.state),
              useWorktrees: def.execution.useWorktrees,
              terminalStatus: def.execution.terminalStatus,
              model: def.agent?.model,
            });
          }
        }
        return {
          success: true,
          data: { workflows: workflows as never[], count: workflows.length },
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to list workflows',
        };
      }
    },
  });

  return [listWorkflowsTool];
}
