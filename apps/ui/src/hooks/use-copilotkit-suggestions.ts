/**
 * CopilotKit Chat Suggestions
 *
 * Provides contextual quick-start suggestions in the CopilotKit sidebar.
 * Derived from the ideation prompt categories.
 */

import { useCopilotChatSuggestions } from '@copilotkit/react-ui';
import { useAppStore } from '@/store/app-store';

/**
 * Registers chat suggestions with CopilotKit.
 * Shows project-aware suggestions when a project is selected.
 */
export function useCopilotKitSuggestions() {
  const currentProject = useAppStore((s) => s.currentProject);
  const hasProject = !!currentProject;

  useCopilotChatSuggestions(
    {
      instructions: hasProject
        ? `Suggest actions related to the "${currentProject?.name}" project. Focus on board management, feature planning, and development workflow.`
        : 'Suggest general actions for getting started with Automaker.',
      maxSuggestions: 3,
    },
    [currentProject?.name]
  );
}
