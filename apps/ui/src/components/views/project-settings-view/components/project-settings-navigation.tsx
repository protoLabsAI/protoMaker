import { SettingsNavButton, SettingsNavContainer } from '@/components/shared/settings';
import { PROJECT_SETTINGS_NAV_ITEMS } from '../config/navigation';
import type { ProjectSettingsViewId } from '../hooks/use-project-settings-view';

interface ProjectSettingsNavigationProps {
  activeSection: ProjectSettingsViewId;
  onNavigate: (sectionId: ProjectSettingsViewId) => void;
  isOpen?: boolean;
  onClose?: () => void;
}

export function ProjectSettingsNavigation({
  activeSection,
  onNavigate,
  isOpen = true,
  onClose,
}: ProjectSettingsNavigationProps) {
  return (
    <SettingsNavContainer
      isOpen={isOpen}
      onClose={onClose ?? (() => {})}
      testId="project-settings-nav-backdrop"
    >
      {PROJECT_SETTINGS_NAV_ITEMS.map((item) => (
        <SettingsNavButton
          key={item.id}
          item={item}
          isActive={activeSection === item.id}
          onClick={() => onNavigate(item.id)}
        />
      ))}
    </SettingsNavContainer>
  );
}
