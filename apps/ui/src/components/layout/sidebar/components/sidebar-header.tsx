import { useState } from 'react';
import { Folder, LucideIcon, Menu, Check, ChevronsUpDown } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { cn } from '@/lib/utils';
import { getAuthenticatedImageUrl } from '@/lib/api-fetch';
import type { Project } from '@/lib/electron';
import { Popover, PopoverContent, PopoverTrigger } from '@protolabs/ui/atoms';
import { useAppStore } from '@/store/app-store';

interface SidebarHeaderProps {
  sidebarOpen: boolean;
  contentReady: boolean;
  currentProject: Project | null;
  onExpand?: () => void;
}

export function SidebarHeader({
  sidebarOpen,
  contentReady,
  currentProject,
  onExpand,
}: SidebarHeaderProps) {
  const [projectListOpen, setProjectListOpen] = useState(false);
  const { projects, setCurrentProject } = useAppStore();
  // Get the icon component from lucide-react
  const getIconComponent = (): LucideIcon => {
    if (currentProject?.icon && currentProject.icon in LucideIcons) {
      return (LucideIcons as unknown as Record<string, LucideIcon>)[currentProject.icon];
    }
    return Folder;
  };

  const IconComponent = getIconComponent();
  const hasCustomIcon = !!currentProject?.customIconPath;

  return (
    <div className="shrink-0 flex flex-col relative">
      {/* Expand button - hamburger menu when sidebar is collapsed */}
      {!sidebarOpen && onExpand && (
        <button
          onClick={onExpand}
          className={cn(
            'flex items-center justify-center w-10 h-10 mx-auto mt-2 rounded-lg',
            'bg-muted/50 hover:bg-muted',
            'text-muted-foreground hover:text-foreground',
            'transition-colors duration-200'
          )}
          aria-label="Expand navigation"
          data-testid="sidebar-expand"
        >
          <Menu className="w-5 h-5" />
        </button>
      )}
      {/* Project switcher row */}
      {currentProject && (
        <div className={cn('flex items-center', sidebarOpen ? 'px-2 pt-3 pb-1 gap-1' : 'pt-1')}>
          <Popover open={projectListOpen} onOpenChange={setProjectListOpen}>
            <PopoverTrigger asChild>
              <button
                className={cn(
                  'flex items-center gap-3 text-left flex-1 min-w-0',
                  'rounded-lg transition-colors duration-150',
                  sidebarOpen ? 'px-2 py-1.5' : 'justify-center px-2 py-2',
                  'hover:bg-accent/50 cursor-pointer'
                )}
                title="Switch project"
              >
                {/* Project Icon */}
                <div className="shrink-0">
                  {hasCustomIcon ? (
                    <img
                      src={getAuthenticatedImageUrl(
                        currentProject.customIconPath!,
                        currentProject.path
                      )}
                      alt={currentProject.name}
                      className="w-8 h-8 rounded-lg object-cover ring-1 ring-border/50"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center">
                      <IconComponent className="w-5 h-5 text-brand-500" />
                    </div>
                  )}
                </div>

                {/* Project Name - only show when sidebar is open */}
                {sidebarOpen && (
                  <div
                    className={cn(
                      'flex items-center gap-3 flex-1 min-w-0',
                      'transition-opacity duration-200',
                      contentReady ? 'opacity-100' : 'opacity-0'
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <h2 className="text-sm font-semibold text-foreground truncate">
                        {currentProject.name}
                      </h2>
                    </div>
                    <ChevronsUpDown className="w-4 h-4 text-muted-foreground shrink-0" />
                  </div>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-2" align="start" side="bottom" sideOffset={8}>
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground px-2 py-1">
                  Switch Project
                </p>
                {projects.map((project) => {
                  const ProjectIcon =
                    project.icon && project.icon in LucideIcons
                      ? (LucideIcons as unknown as Record<string, LucideIcon>)[project.icon]
                      : Folder;
                  const isActive = currentProject?.id === project.id;

                  return (
                    <button
                      key={project.id}
                      onClick={() => {
                        setCurrentProject(project);
                        setProjectListOpen(false);
                      }}
                      className={cn(
                        'w-full flex items-center gap-3 px-2 py-2 rounded-lg text-left',
                        'transition-colors duration-150',
                        isActive
                          ? 'bg-brand-500/10 text-brand-500'
                          : 'hover:bg-accent text-foreground'
                      )}
                    >
                      {project.customIconPath ? (
                        <img
                          src={getAuthenticatedImageUrl(project.customIconPath, project.path)}
                          alt={project.name}
                          className="w-6 h-6 rounded object-cover ring-1 ring-border/50"
                        />
                      ) : (
                        <div
                          className={cn(
                            'w-6 h-6 rounded flex items-center justify-center',
                            isActive ? 'bg-brand-500/20' : 'bg-muted'
                          )}
                        >
                          <ProjectIcon
                            className={cn(
                              'w-4 h-4',
                              isActive ? 'text-brand-500' : 'text-muted-foreground'
                            )}
                          />
                        </div>
                      )}
                      <span className="flex-1 text-sm truncate">{project.name}</span>
                      {isActive && <Check className="w-4 h-4 text-brand-500" />}
                    </button>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      )}
    </div>
  );
}
