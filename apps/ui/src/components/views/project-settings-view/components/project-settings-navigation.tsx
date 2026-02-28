import { SettingsNavButton, SettingsNavContainer } from '@/components/shared/settings';
import { PROJECT_NAV_GROUPS } from '../config/navigation';
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
      {PROJECT_NAV_GROUPS.map((group, groupIndex) => (
        <div key={group.label}>
          {groupIndex > 0 && <div className="my-3 border-t border-border/50" />}
          <div className="px-3 py-2 text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">
            {group.label}
          </div>
          <div className="space-y-1">
            {group.items.map((item) => (
              <SettingsNavButton
                key={item.id}
                item={item}
                isActive={activeSection === item.id}
                onClick={() => onNavigate(item.id)}
              />
            ))}
          </div>
        </div>
      ))}
    </SettingsNavContainer>
  );
}
