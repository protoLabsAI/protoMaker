import { useMemo, createElement } from 'react';
import type { NavigateOptions } from '@tanstack/react-router';
import {
  FileText,
  LayoutGrid,
  Library,
  Network,
  Inbox,
  Settings,
  NotebookPen,
  Palette,
  CalendarDays,
  FolderOpen,
  FolderKanban,
} from 'lucide-react';

/** protoLabs logo icon sized for sidebar nav (matches lucide icon API) */
function ProtoLabsIcon({ className }: { className?: string }) {
  return createElement(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 2,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      className,
    },
    createElement('rect', { width: 16, height: 12, x: 4, y: 8, rx: 2 }),
    createElement('path', { d: 'M12 8V4H8' }),
    createElement('path', { d: 'M2 14h2' }),
    createElement('path', { d: 'M20 14h2' }),
    createElement('path', { d: 'M15 13v2' }),
    createElement('path', { d: 'M9 13v2' })
  );
}
import type { NavSection, NavItem } from '../types';
import type { KeyboardShortcut } from '@/hooks/use-keyboard-shortcuts';
import type { Project } from '@/lib/electron';

interface UseNavigationProps {
  shortcuts: {
    toggleSidebar: string;
    openProject: string;
    projectPicker: string;
    cyclePrevProject: string;
    cycleNextProject: string;
    spec: string;
    notes: string;
    docs: string;
    board: string;
    settings: string;
    projectSettings: string;
    systemView: string;
    inbox: string;
    fileEditor: string;
    designs: string;
    calendar: string;
    automations: string;
    projects: string;
    chat: string;
  };
  hideSpecEditor: boolean;
  hideDesigns: boolean;
  hideDocs: boolean;
  hideFileEditor: boolean;
  hideSystemView: boolean;
  hideAvaChat: boolean;
  currentProject: Project | null;
  projects: Project[];
  projectHistory: string[];
  navigate: (opts: NavigateOptions) => void;
  toggleSidebar: () => void;
  handleOpenFolder: () => void;
  cyclePrevProject: () => void;
  cycleNextProject: () => void;
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
  hideDesigns,
  hideDocs,
  hideFileEditor,
  hideSystemView,
  hideAvaChat,
  currentProject,
  projects,
  projectHistory,
  navigate,
  toggleSidebar,
  handleOpenFolder,
  cyclePrevProject,
  cycleNextProject,
  unreadNotificationsCount,
  unreadCeremonyCount,
  isSpecGenerating,
}: UseNavigationProps) {
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
        id: 'docs',
        label: 'Docs',
        icon: Library,
        shortcut: shortcuts.docs,
      },
      {
        id: 'notes',
        label: 'Content',
        icon: NotebookPen,
        shortcut: shortcuts.notes,
      },
      {
        id: 'calendar',
        label: 'Calendar',
        icon: CalendarDays,
        shortcut: shortcuts.calendar,
      },
    ];

    // Filter out hidden items
    const visibleToolsItems = allToolsItems.filter((item) => {
      if (item.id === 'spec' && hideSpecEditor) return false;
      if (item.id === 'docs' && hideDocs) return false;
      return true;
    });

    // Build project items
    const projectItems: NavItem[] = [
      {
        id: 'projects',
        label: 'Projects',
        icon: FolderKanban,
        shortcut: shortcuts.projects,
      },
      {
        id: 'board',
        label: 'Features',
        icon: LayoutGrid,
        shortcut: shortcuts.board,
      },
    ];

    if (!hideSystemView) {
      projectItems.push({
        id: 'system-view',
        label: 'System View',
        icon: Network,
        shortcut: shortcuts.systemView,
      });
    }

    if (!hideFileEditor) {
      projectItems.push({
        id: 'file-editor',
        label: 'Editor',
        icon: FolderOpen,
        shortcut: shortcuts.fileEditor,
      });
    }

    if (!hideAvaChat) {
      projectItems.push({
        id: 'chat',
        label: 'Ava',
        icon: ProtoLabsIcon,
        shortcut: shortcuts.chat,
      });
    }

    if (!hideDesigns) {
      projectItems.push({
        id: 'designs',
        label: 'Designs',
        icon: Palette,
        shortcut: shortcuts.designs,
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

    // Add Inbox and Project Settings as a standalone section (no label for visual separation)
    const inboxCount = (unreadNotificationsCount ?? 0) + (unreadCeremonyCount ?? 0);
    sections.push({
      label: '',
      items: [
        {
          id: 'inbox',
          label: 'Inbox',
          icon: Inbox,
          shortcut: shortcuts.inbox,
          count: inboxCount || undefined,
        },
        {
          id: 'project-settings',
          label: 'Settings',
          icon: Settings,
          shortcut: shortcuts.projectSettings,
        },
      ],
    });

    return sections;
  }, [
    shortcuts,
    hideSpecEditor,
    hideDesigns,
    hideDocs,
    hideFileEditor,
    hideSystemView,
    hideAvaChat,
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
              action: item.action
                ? () => item.action!()
                : () => navigate({ to: `/${item.id}` as unknown as '/' }),
              description: item.action ? `Toggle ${item.label}` : `Navigate to ${item.label}`,
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

      // Add automations shortcut (navigates to Settings > Automations)
      shortcutsList.push({
        key: shortcuts.automations,
        action: () => navigate({ to: '/settings', search: { view: 'automations' } }),
        description: 'Navigate to Automations',
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
