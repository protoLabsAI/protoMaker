import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useAppStore } from '@/store/app-store';
import { Settings, FolderOpen } from 'lucide-react';
import { useSettingsNavigation } from '@/components/shared/settings';
import { ProjectIdentitySection } from './project-identity-section';
import { ProjectThemeSection } from './project-theme-section';
import { WorktreePreferencesSection } from './worktree-preferences-section';
import { ProjectModelsSection } from './project-models-section';
import { ProjectWebhooksSection } from './project-webhooks-section';
import { ProjectCeremoniesSection } from './project-ceremonies-section';
import { ProjectIntegrationsSection } from './project-integrations-section';
import { DangerZoneSection } from '../settings-view/danger-zone/danger-zone-section';
import { DeleteProjectDialog } from '../settings-view/components/delete-project-dialog';
import { SettingsScopeToggle } from '../settings-view/components/settings-scope-toggle';
import { SettingsHeader } from '../settings-view/components/settings-header';
import { ProjectSettingsNavigation } from './components/project-settings-navigation';
import { useProjectSettingsView } from './hooks/use-project-settings-view';
import type { Project as ElectronProject } from '@/lib/electron';

// Convert to the shared types used by components
interface SettingsProject {
  id: string;
  name: string;
  path: string;
  theme?: string;
  icon?: string;
  customIconPath?: string;
}

export function ProjectSettingsView() {
  const navigate = useNavigate();
  const { currentProject, moveProjectToTrash } = useAppStore();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Use project settings view navigation hook
  const { activeView, navigateTo } = useProjectSettingsView();

  // Shared mobile navigation state
  const { showNavigation, setShowNavigation, toggleNavigation } = useSettingsNavigation(activeView);

  // Convert electron Project to settings-view Project type
  const convertProject = (project: ElectronProject | null): SettingsProject | null => {
    if (!project) return null;
    return {
      id: project.id,
      name: project.name,
      path: project.path,
      theme: project.theme,
      icon: project.icon,
      customIconPath: project.customIconPath,
    };
  };

  const settingsProject = convertProject(currentProject);

  // Render the active section based on current view
  const renderActiveSection = () => {
    if (!currentProject) return null;

    switch (activeView) {
      case 'identity':
        return <ProjectIdentitySection project={currentProject} />;
      case 'theme':
        return <ProjectThemeSection project={currentProject} />;
      case 'worktrees':
        return <WorktreePreferencesSection project={currentProject} />;
      case 'claude':
        return <ProjectModelsSection project={currentProject} />;
      case 'webhooks':
        return <ProjectWebhooksSection project={currentProject} />;
      case 'ceremonies':
        return <ProjectCeremoniesSection project={currentProject} />;
      case 'integrations':
        return <ProjectIntegrationsSection project={currentProject} />;
      case 'danger':
        return (
          <DangerZoneSection
            project={settingsProject}
            onDeleteClick={() => setShowDeleteDialog(true)}
          />
        );
      default:
        return <ProjectIdentitySection project={currentProject} />;
    }
  };

  // Show message if no project is selected
  if (!currentProject) {
    return (
      <div
        className="flex-1 flex flex-col overflow-hidden content-bg"
        data-testid="project-settings-view"
      >
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center max-w-md">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-muted/50 flex items-center justify-center">
              <FolderOpen className="w-8 h-8 text-muted-foreground/50" />
            </div>
            <h2 className="text-lg font-semibold text-foreground mb-2">No Project Selected</h2>
            <p className="text-sm text-muted-foreground">
              Select a project from the sidebar to configure project-specific settings.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex-1 flex flex-col overflow-hidden content-bg"
      data-testid="project-settings-view"
    >
      {/* Header */}
      <SettingsHeader
        title="Project Settings"
        description={`Configure settings for ${currentProject.name}`}
        icon={Settings}
        showNavigation={showNavigation}
        onToggleNavigation={toggleNavigation}
      />

      {/* Scope Toggle */}
      <div className="shrink-0 px-4 py-2 border-b border-border/30">
        <SettingsScopeToggle
          active="project"
          onSwitch={(scope) => {
            if (scope === 'global') navigate({ to: '/settings' });
          }}
        />
      </div>

      {/* Content Area with Sidebar */}
      <div className="flex-1 flex overflow-hidden">
        {/* Side Navigation */}
        <ProjectSettingsNavigation
          activeSection={activeView}
          onNavigate={navigateTo}
          isOpen={showNavigation}
          onClose={() => setShowNavigation(false)}
        />

        {/* Content Panel - Shows only the active section */}
        <div className="flex-1 overflow-y-auto p-4 lg:p-8">
          <div className="max-w-4xl mx-auto">{renderActiveSection()}</div>
        </div>
      </div>

      {/* Delete Project Confirmation Dialog */}
      <DeleteProjectDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        project={currentProject}
        onConfirm={moveProjectToTrash}
      />
    </div>
  );
}
