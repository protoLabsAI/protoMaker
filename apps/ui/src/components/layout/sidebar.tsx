import { useState, useCallback, useEffect, useRef } from 'react';
import { createLogger } from '@protolabsai/utils/logger';
import { useNavigate, useLocation } from '@tanstack/react-router';

const logger = createLogger('Sidebar');
import { cn, isMac } from '@/lib/utils';
import { useAppStore } from '@/store/app-store';
import { useActionableItemsStore } from '@/store/actionable-items-store';
import { useCeremonyStore } from '@/store/ceremony-store';
import { useLoadActionableItems, useActionableItemEvents } from '@/hooks/use-actionable-items';
import { useLoadCeremonyEntries, useCeremonyEventStream } from '@/hooks/use-ceremony-events';
import { useKeyboardShortcuts, useKeyboardShortcutsConfig } from '@/hooks/use-keyboard-shortcuts';
import { getElectronAPI, isElectron } from '@/lib/electron';
import { initializeProject, hasAppSpec, hasAutomakerDir } from '@/lib/project-init';
import { toast } from 'sonner';
import { DeleteProjectDialog } from '@/components/views/settings-view/components/delete-project-dialog';
import { NewProjectModal } from '@/components/dialogs/new-project-modal';
import { CreateSpecDialog } from '@/components/views/spec-view/dialogs';

// Local imports from subfolder
import {
  AutomakerLogo,
  QuickActionsBar,
  SidebarHeader,
  SidebarNavigation,
  MobileSidebarToggle,
} from './sidebar/components';
import { useIsCompact } from '@/hooks/use-media-query';
import { TrashDialog, OnboardingDialog } from './sidebar/dialogs';
import { SIDEBAR_FEATURE_FLAGS } from './sidebar/constants';
import {
  useSidebarAutoCollapse,
  useSpecRegeneration,
  useNavigation,
  useProjectCreation,
  useSetupDialog,
  useTrashOperations,
} from './sidebar/hooks';

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  const {
    projects,
    trashedProjects,
    currentProject,
    sidebarOpen,
    mobileSidebarHidden,
    projectHistory,
    upsertAndSetCurrentProject,
    toggleSidebar,
    restoreTrashedProject,
    deleteTrashedProject,
    emptyTrash,
    cyclePrevProject,
    cycleNextProject,
    moveProjectToTrash,
    specCreatingForProject,
    setSpecCreatingForProject,
    featureFlags,
  } = useAppStore();

  const isCompact = useIsCompact();

  // Content fade: delay content appearance until sidebar width transition completes on open,
  // and fade out content before collapsing on close.
  const [contentReady, setContentReady] = useState(sidebarOpen);
  const closingRef = useRef(false);

  useEffect(() => {
    if (sidebarOpen && !closingRef.current) {
      // Opening: wait for width transition to finish, then fade in content
      const timer = setTimeout(() => setContentReady(true), 300);
      return () => clearTimeout(timer);
    }
  }, [sidebarOpen]);

  const handleToggleSidebar = useCallback(() => {
    if (sidebarOpen) {
      // Closing: fade out content first, then collapse sidebar width
      setContentReady(false);
      closingRef.current = true;
      setTimeout(() => {
        toggleSidebar();
        closingRef.current = false;
      }, 150);
    } else {
      // Opening: expand width immediately (content fades in via useEffect)
      toggleSidebar();
    }
  }, [sidebarOpen, toggleSidebar]);

  // Environment variable flags for hiding sidebar items
  const { hideSpecEditor } = SIDEBAR_FEATURE_FLAGS;

  // Get customizable keyboard shortcuts
  const shortcuts = useKeyboardShortcutsConfig();

  // Load inbox data eagerly so the badge count is available without navigating to /inbox
  const projectPath = currentProject?.path ?? null;
  useLoadActionableItems(projectPath);
  useActionableItemEvents(projectPath);
  useLoadCeremonyEntries(projectPath);
  useCeremonyEventStream(projectPath);

  // Get unread actionable items count (drives the inbox badge)
  const unreadNotificationsCount = useActionableItemsStore((s) => s.unreadCount);

  // Get unread ceremony event count
  const unreadCeremonyCount = useCeremonyStore((s) => s.unreadCount);

  // State for delete project confirmation dialog
  const [showDeleteProjectDialog, setShowDeleteProjectDialog] = useState(false);

  // State for trash dialog
  const [showTrashDialog, setShowTrashDialog] = useState(false);

  // Project creation state and handlers
  const {
    showNewProjectModal,
    setShowNewProjectModal,
    isCreatingProject,
    showOnboardingDialog,
    setShowOnboardingDialog,
    newProjectName,
    setNewProjectName,
    newProjectPath,
    setNewProjectPath,
    handleCreateBlankProject,
    handleCreateFromTemplate,
    handleCreateFromCustomUrl,
  } = useProjectCreation({
    upsertAndSetCurrentProject,
  });

  // Setup dialog state and handlers
  const {
    showSetupDialog,
    setShowSetupDialog,
    setupProjectPath,
    setSetupProjectPath,
    projectOverview,
    setProjectOverview,
    generateFeatures,
    setGenerateFeatures,
    analyzeProject,
    setAnalyzeProject,
    featureCount,
    setFeatureCount,
    handleCreateInitialSpec,
    handleSkipSetup,
    handleOnboardingGenerateSpec,
    handleOnboardingSkip,
  } = useSetupDialog({
    setSpecCreatingForProject,
    newProjectPath,
    setNewProjectName,
    setNewProjectPath,
    setShowOnboardingDialog,
  });

  // Derive isCreatingSpec from store state
  const isCreatingSpec = specCreatingForProject !== null;
  const creatingSpecProjectPath = specCreatingForProject;
  // Check if the current project is specifically the one generating spec
  const isCurrentProjectGeneratingSpec =
    specCreatingForProject !== null && specCreatingForProject === currentProject?.path;

  // Auto-collapse sidebar on small screens and update Electron window minWidth
  useSidebarAutoCollapse({ sidebarOpen, toggleSidebar: handleToggleSidebar });

  // Trash operations
  const {
    activeTrashId,
    isEmptyingTrash,
    handleRestoreProject,
    handleDeleteProjectFromDisk,
    handleEmptyTrash,
  } = useTrashOperations({
    restoreTrashedProject,
    deleteTrashedProject,
    emptyTrash,
  });

  // Spec regeneration events
  useSpecRegeneration({
    creatingSpecProjectPath,
    setupProjectPath,
    setSpecCreatingForProject,
    setShowSetupDialog,
    setProjectOverview,
    setSetupProjectPath,
    setNewProjectName,
    setNewProjectPath,
  });

  /**
   * Opens the system folder selection dialog and initializes the selected project.
   * Used by both the 'O' keyboard shortcut and the folder icon button.
   */
  const handleOpenFolder = useCallback(async () => {
    const api = getElectronAPI();
    const result = await api.openDirectory();

    if (!result.canceled && result.filePaths[0]) {
      const path = result.filePaths[0];
      // Extract folder name from path (works on both Windows and Mac/Linux)
      const name = path.split(/[/\\]/).filter(Boolean).pop() || 'Untitled Project';

      try {
        // Check if this is a brand new project (no .automaker directory)
        const hadAutomakerDir = await hasAutomakerDir(path);

        // Initialize the .automaker directory structure
        const initResult = await initializeProject(path);

        if (!initResult.success) {
          toast.error('Failed to initialize project', {
            description: initResult.error || 'Unknown error occurred',
          });
          return;
        }

        // Upsert project and set as current (handles both create and update cases)
        // Theme handling (trashed project recovery or undefined for global) is done by the store
        upsertAndSetCurrentProject(path, name);

        // Check if app_spec.txt exists
        const specExists = await hasAppSpec(path);

        if (!hadAutomakerDir && !specExists) {
          // This is a brand new project - show setup dialog
          setSetupProjectPath(path);
          setShowSetupDialog(true);
          toast.success('Project opened', {
            description: `Opened ${name}. Let's set up your app specification!`,
          });
        } else if (initResult.createdFiles && initResult.createdFiles.length > 0) {
          toast.success(initResult.isNewProject ? 'Project initialized' : 'Project updated', {
            description: `Set up ${initResult.createdFiles.length} file(s) in .automaker`,
          });
        } else {
          toast.success('Project opened', {
            description: `Opened ${name}`,
          });
        }
      } catch (error) {
        logger.error('Failed to open project:', error);
        toast.error('Failed to open project', {
          description: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }, [upsertAndSetCurrentProject]);

  // Navigation sections and keyboard shortcuts (defined after handlers)
  const { navSections, navigationShortcuts } = useNavigation({
    shortcuts,
    hideSpecEditor: hideSpecEditor || !featureFlags.specEditor,
    hideDesigns: !featureFlags.designs,
    hideDocs: !featureFlags.docs,
    hideFileEditor: false,
    hideSystemView: !featureFlags.systemView,
    currentProject,
    projects,
    projectHistory,
    navigate,
    toggleSidebar: handleToggleSidebar,
    handleOpenFolder,
    cyclePrevProject,
    cycleNextProject,
    unreadNotificationsCount,
    unreadCeremonyCount,
    isSpecGenerating: isCurrentProjectGeneratingSpec,
  });

  // Register keyboard shortcuts
  useKeyboardShortcuts(navigationShortcuts);

  const isActiveRoute = (id: string) => {
    // Map view IDs to route paths
    const routePath = id === 'welcome' ? '/' : `/${id}`;
    return location.pathname === routePath;
  };

  // Check if sidebar should be completely hidden on mobile
  const shouldHideSidebar = isCompact && mobileSidebarHidden;

  return (
    <>
      {/* Floating toggle to show sidebar on mobile when hidden */}
      <MobileSidebarToggle />

      {/* Mobile backdrop overlay */}
      {sidebarOpen && !shouldHideSidebar && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={handleToggleSidebar}
          data-testid="sidebar-backdrop"
        />
      )}
      <aside
        className={cn(
          'flex-shrink-0 flex flex-col z-30',
          // Glass morphism background with gradient
          'bg-gradient-to-b from-sidebar/95 via-sidebar/85 to-sidebar/90 backdrop-blur-2xl',
          // Premium border with subtle glow
          'border-r border-border/60 shadow-[1px_0_20px_-5px_rgba(0,0,0,0.1)]',
          // Smooth width transition
          'transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
          // Mobile: completely hidden when mobileSidebarHidden is true
          shouldHideSidebar && 'hidden',
          // Mobile: overlay when open, collapsed when closed
          !shouldHideSidebar &&
            (sidebarOpen ? 'fixed inset-y-0 left-0 w-72 lg:relative lg:w-72' : 'relative w-16')
        )}
        data-testid="sidebar"
      >
        <div
          className={cn(
            'flex-1 flex flex-col overflow-hidden',
            isMac && isElectron() && 'pt-[10px]'
          )}
        >
          {sidebarOpen && (
            <div
              className={cn(
                'transition-opacity duration-200',
                contentReady ? 'opacity-100' : 'opacity-0'
              )}
            >
              <QuickActionsBar
                onBugReport={() =>
                  getElectronAPI().openExternalLink(
                    'https://github.com/protoLabsAI/protoMaker/issues'
                  )
                }
                onDocs={() => getElectronAPI().openExternalLink('https://docs.protolabs.studio')}
                onNewProject={() => setShowNewProjectModal(true)}
                onOpenFolder={handleOpenFolder}
                onSettings={() => navigate({ to: '/settings' })}
                onClose={handleToggleSidebar}
              />
            </div>
          )}

          <SidebarHeader
            sidebarOpen={sidebarOpen}
            contentReady={contentReady}
            currentProject={currentProject}
            onExpand={handleToggleSidebar}
          />

          <SidebarNavigation
            currentProject={currentProject}
            sidebarOpen={sidebarOpen}
            contentReady={contentReady}
            navSections={navSections}
            isActiveRoute={isActiveRoute}
            navigate={navigate}
            onNavItemClick={() => {
              // Close sidebar when in overlay mode (viewport below lg breakpoint)
              if (sidebarOpen && !window.matchMedia('(min-width: 1024px)').matches) {
                handleToggleSidebar();
              }
            }}
          />
        </div>

        <div
          className={cn(
            'shrink-0 border-t border-border/40 py-3',
            sidebarOpen ? 'px-4' : 'px-2 flex justify-center',
            'transition-opacity duration-200',
            sidebarOpen ? (contentReady ? 'opacity-100' : 'opacity-0') : 'opacity-100'
          )}
        >
          <AutomakerLogo sidebarOpen={sidebarOpen} navigate={navigate} />
        </div>

        <TrashDialog
          open={showTrashDialog}
          onOpenChange={setShowTrashDialog}
          trashedProjects={trashedProjects}
          activeTrashId={activeTrashId}
          handleRestoreProject={handleRestoreProject}
          handleDeleteProjectFromDisk={handleDeleteProjectFromDisk}
          deleteTrashedProject={deleteTrashedProject}
          handleEmptyTrash={handleEmptyTrash}
          isEmptyingTrash={isEmptyingTrash}
        />

        {/* New Project Setup Dialog */}
        <CreateSpecDialog
          open={showSetupDialog}
          onOpenChange={setShowSetupDialog}
          projectOverview={projectOverview}
          onProjectOverviewChange={setProjectOverview}
          generateFeatures={generateFeatures}
          onGenerateFeaturesChange={setGenerateFeatures}
          analyzeProject={analyzeProject}
          onAnalyzeProjectChange={setAnalyzeProject}
          featureCount={featureCount}
          onFeatureCountChange={setFeatureCount}
          onCreateSpec={handleCreateInitialSpec}
          onSkip={handleSkipSetup}
          isCreatingSpec={isCreatingSpec}
          showSkipButton={true}
          title="Set Up Your Project"
          description="We didn't find an app_spec.txt file. Let us help you generate your app_spec.txt to help describe your project for our system. We'll analyze your project's tech stack and create a comprehensive specification."
        />

        <OnboardingDialog
          open={showOnboardingDialog}
          onOpenChange={setShowOnboardingDialog}
          newProjectName={newProjectName}
          onSkip={handleOnboardingSkip}
          onGenerateSpec={handleOnboardingGenerateSpec}
        />

        {/* Delete Project Confirmation Dialog */}
        <DeleteProjectDialog
          open={showDeleteProjectDialog}
          onOpenChange={setShowDeleteProjectDialog}
          project={currentProject}
          onConfirm={moveProjectToTrash}
        />

        {/* New Project Modal */}
        <NewProjectModal
          open={showNewProjectModal}
          onOpenChange={setShowNewProjectModal}
          onCreateBlankProject={handleCreateBlankProject}
          onCreateFromTemplate={handleCreateFromTemplate}
          onCreateFromCustomUrl={handleCreateFromCustomUrl}
          isCreating={isCreatingProject}
        />
      </aside>
    </>
  );
}
