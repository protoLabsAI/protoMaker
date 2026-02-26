import { useMemo, useState, useEffect } from 'react';
import type { NavigateOptions } from '@tanstack/react-router';
import {
  FileText,
  LayoutGrid,
  BookOpen,
  Library,
  Terminal,
  CircleDot,
  GitPullRequest,
  Brain,
  Network,
  Inbox,
  Settings,
  NotebookPen,
  Palette,
  CalendarDays,
} from 'lucide-react';
import type { NavSection, NavItem } from '../types';
import type { KeyboardShortcut } from '@/hooks/use-keyboard-shortcuts';
import type { Project } from '@/lib/electron';
import { getElectronAPI } from '@/lib/electron';

interface UseNavigationProps {
  shortcuts: {
    toggleSidebar: string;
    openProject: string;
    projectPicker: string;
    cyclePrevProject: string;
    cycleNextProject: string;
    spec: string;
    context: string;
    memory: string;
    notes: string;
    docs: string;
    board: string;
    graph: string;
    agent: string;
    terminal: string;
    settings: string;
    projectSettings: string;
    githubIssues: string;
    githubPrs: string;
    notifications: string;
  };
  hideSpecEditor: boolean;
  hideContext: boolean;
  hideTerminal: boolean;
  currentProject: Project | null;
  projects: Project[];
  projectHistory: string[];
  navigate: (opts: NavigateOptions) => void;
  toggleSidebar: () => void;
  handleOpenFolder: () => void;
  cyclePrevProject: () => void;
  cycleNextProject: () => void;
  /** Count of unviewed validations to show on GitHub Issues nav item */
  unviewedValidationsCount?: number;
  /** Count of unread notifications to show on Notifications nav item */
  unreadNotificationsCount?: number;
  /** Count of unread ceremony events */
  unreadCeremonyCount?: number;
  /** Whether spec generation is currently running for the current project */
  isSpecGenerating?: boolean;
}

export function useNavigation({
  shortcuts,
  hideSpecEditor,
  hideContext,
  hideTerminal,
  currentProject,
  projects,
  projectHistory,
  navigate,
  toggleSidebar,
  handleOpenFolder,
  cyclePrevProject,
  cycleNextProject,
  unviewedValidationsCount,
  unreadNotificationsCount,
  unreadCeremonyCount,
  isSpecGenerating,
}: UseNavigationProps) {
  // Track if current project has a GitHub remote
  const [hasGitHubRemote, setHasGitHubRemote] = useState(false);

  useEffect(() => {
    async function checkGitHubRemote() {
      if (!currentProject?.path) {
        setHasGitHubRemote(false);
        return;
      }

      try {
        const api = getElectronAPI();
        if (api.github) {
          const result = await api.github.checkRemote(currentProject.path);
          setHasGitHubRemote(result.success && result.hasGitHubRemote === true);
        }
      } catch {
        setHasGitHubRemote(false);
      }
    }

    checkGitHubRemote();
  }, [currentProject?.path]);

  // Build navigation sections
  const navSections: NavSection[] = useMemo(() => {
    const allToolsItems: NavItem[] = [
      {
        id: 'spec',
        label: 'Spec Editor',
        icon: FileText,
        shortcut: shortcuts.spec,
        isLoading: isSpecGenerating,
      },
      {
        id: 'context',
        label: 'Context',
        icon: BookOpen,
        shortcut: shortcuts.context,
      },
      {
        id: 'memory',
        label: 'Memory',
        icon: Brain,
        shortcut: shortcuts.memory,
      },
      {
        id: 'notes',
        label: 'Notes',
        icon: NotebookPen,
        shortcut: shortcuts.notes,
      },
      {
        id: 'docs',
        label: 'Docs',
        icon: Library,
        shortcut: shortcuts.docs,
      },
    ];

    // Filter out hidden items
    const visibleToolsItems = allToolsItems.filter((item) => {
      if (item.id === 'spec' && hideSpecEditor) {
        return false;
      }
      if (item.id === 'context' && hideContext) {
        return false;
      }
      return true;
    });

    // Build project items - Terminal is conditionally included
    const projectItems: NavItem[] = [
      {
        id: 'analytics',
        label: 'System View',
        icon: Network,
      },
      {
        id: 'board',
        label: 'Kanban Board',
        icon: LayoutGrid,
        shortcut: shortcuts.board,
      },
      {
        id: 'designs',
        label: 'Designs',
        icon: Palette,
      },
      {
        id: 'calendar',
        label: 'Calendar',
        icon: CalendarDays,
      },
    ];

    // Add Terminal to Project section if not hidden
    if (!hideTerminal) {
      projectItems.push({
        id: 'terminal',
        label: 'Terminal',
        icon: Terminal,
        shortcut: shortcuts.terminal,
      });
    }

    const sections: NavSection[] = [
      {
        label: 'Project',
        items: projectItems,
      },
      {
        label: 'Tools',
        items: visibleToolsItems,
      },
    ];

    // Add GitHub section if project has a GitHub remote
    if (hasGitHubRemote) {
      sections.push({
        label: 'GitHub',
        items: [
          {
            id: 'github-issues',
            label: 'Issues',
            icon: CircleDot,
            shortcut: shortcuts.githubIssues,
            count: unviewedValidationsCount,
          },
          {
            id: 'github-prs',
            label: 'Pull Requests',
            icon: GitPullRequest,
            shortcut: shortcuts.githubPrs,
          },
        ],
      });
    }

    // Add Inbox and Project Settings as a standalone section (no label for visual separation)
    const inboxCount = (unreadNotificationsCount ?? 0) + (unreadCeremonyCount ?? 0);
    sections.push({
      label: '',
      items: [
        {
          id: 'inbox',
          label: 'Inbox',
          icon: Inbox,
          count: inboxCount || undefined,
        },
        {
          id: 'project-settings',
          label: 'Project Settings',
          icon: Settings,
          shortcut: shortcuts.projectSettings,
        },
      ],
    });

    return sections;
  }, [
    shortcuts,
    hideSpecEditor,
    hideContext,
    hideTerminal,
    hasGitHubRemote,
    unviewedValidationsCount,
    unreadNotificationsCount,
    unreadCeremonyCount,
    isSpecGenerating,
  ]);

  // Build keyboard shortcuts for navigation
  const navigationShortcuts: KeyboardShortcut[] = useMemo(() => {
    const shortcutsList: KeyboardShortcut[] = [];

    // Sidebar toggle shortcut - always available
    shortcutsList.push({
      key: shortcuts.toggleSidebar,
      action: () => toggleSidebar(),
      description: 'Toggle sidebar',
    });

    // Open project shortcut - opens the folder selection dialog directly
    shortcutsList.push({
      key: shortcuts.openProject,
      action: () => handleOpenFolder(),
      description: 'Open folder selection dialog',
    });

    // Project cycling shortcuts - only when we have project history
    if (projectHistory.length > 1) {
      shortcutsList.push({
        key: shortcuts.cyclePrevProject,
        action: () => cyclePrevProject(),
        description: 'Cycle to previous project (MRU)',
      });
      shortcutsList.push({
        key: shortcuts.cycleNextProject,
        action: () => cycleNextProject(),
        description: 'Cycle to next project (LRU)',
      });
    }

    // Only enable nav shortcuts if there's a current project
    if (currentProject) {
      navSections.forEach((section) => {
        section.items.forEach((item) => {
          if (item.shortcut) {
            shortcutsList.push({
              key: item.shortcut,
              // Cast to router path type; ids are constrained to known routes
              action: () => navigate({ to: `/${item.id}` as unknown as '/' }),
              description: `Navigate to ${item.label}`,
            });
          }
        });
      });

      // Add global settings shortcut
      shortcutsList.push({
        key: shortcuts.settings,
        action: () => navigate({ to: '/settings' }),
        description: 'Navigate to Global Settings',
      });
    }

    return shortcutsList;
  }, [
    shortcuts,
    currentProject,
    navigate,
    toggleSidebar,
    projects.length,
    handleOpenFolder,
    projectHistory.length,
    cyclePrevProject,
    cycleNextProject,
    navSections,
  ]);

  return {
    navSections,
    navigationShortcuts,
  };
}
