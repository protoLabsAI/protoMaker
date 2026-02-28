import {
  User,
  GitBranch,
  Palette,
  AlertTriangle,
  Workflow,
  Webhook,
  PartyPopper,
  Plug,
} from 'lucide-react';
import type { SettingsNavigationItem } from '@/components/shared/settings';
import type { ProjectSettingsViewId } from '../hooks/use-project-settings-view';

export type ProjectNavigationItem = SettingsNavigationItem & {
  id: ProjectSettingsViewId;
};

export interface ProjectNavigationGroup {
  label: string;
  items: ProjectNavigationItem[];
}

export const PROJECT_NAV_GROUPS: ProjectNavigationGroup[] = [
  {
    label: 'Project',
    items: [
      { id: 'identity', label: 'Identity', icon: User },
      { id: 'worktrees', label: 'Worktrees', icon: GitBranch },
      { id: 'theme', label: 'Theme', icon: Palette },
      { id: 'claude', label: 'Models', icon: Workflow },
      { id: 'webhooks', label: 'Webhooks', icon: Webhook },
      { id: 'ceremonies', label: 'Ceremonies', icon: PartyPopper },
      { id: 'integrations', label: 'Integrations', icon: Plug },
    ],
  },
  {
    label: 'Advanced',
    items: [{ id: 'danger', label: 'Danger Zone', icon: AlertTriangle, colorScheme: 'danger' }],
  },
];

// Flat list for backwards compatibility
export const PROJECT_SETTINGS_NAV_ITEMS: ProjectNavigationItem[] = PROJECT_NAV_GROUPS.flatMap(
  (group) => group.items
);
