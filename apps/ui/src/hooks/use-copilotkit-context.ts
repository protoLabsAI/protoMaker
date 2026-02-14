/**
 * CopilotKit Context Hook
 *
 * Injects project context into the CopilotKit sidebar so the AI assistant
 * is aware of the current project, board state, and features.
 */

import { useCopilotReadable } from '@copilotkit/react-core';
import { useAppStore } from '@/store/app-store';
import { useFeatures } from '@/hooks/queries/use-features';

/**
 * Registers project context as CopilotKit readable data.
 * Call this hook once in the root layout — it automatically
 * refreshes when project or features change.
 */
export function useCopilotKitContext() {
  const currentProject = useAppStore((s) => s.currentProject);
  const projectPath = currentProject?.path;
  const { data: features } = useFeatures(projectPath);

  // Project metadata
  useCopilotReadable(
    {
      description: 'Current project information',
      value: currentProject
        ? {
            name: currentProject.name,
            path: currentProject.path,
          }
        : 'No project selected',
    },
    [currentProject?.path, currentProject?.name]
  );

  // Board summary — feature counts by status
  const boardSummary = features
    ? (() => {
        const counts: Record<string, number> = {};
        for (const f of features) {
          const status = f.status ?? 'unknown';
          counts[status] = (counts[status] ?? 0) + 1;
        }
        return { total: features.length, byStatus: counts };
      })()
    : null;

  useCopilotReadable(
    {
      description: 'Board summary showing feature counts by status',
      value: boardSummary ?? 'No features loaded',
    },
    [JSON.stringify(boardSummary)]
  );

  // Active feature list (compact — id, title, status, complexity)
  const featureList = features?.map((f) => ({
    id: f.id,
    title: f.title,
    status: f.status,
    complexity: f.complexity,
    isEpic: f.isEpic ?? false,
  }));

  useCopilotReadable(
    {
      description: 'List of all features on the board with their status',
      value: featureList ?? [],
    },
    [JSON.stringify(featureList)]
  );
}
