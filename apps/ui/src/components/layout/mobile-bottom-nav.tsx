import { useNavigate, useRouterState } from '@tanstack/react-router';
import { Grid, BarChart3, FileText, Settings, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-media-query';
import { useAppStore } from '@/store/app-store';

interface NavItem {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  path: string;
}

const baseNavItems: NavItem[] = [
  { id: 'board', icon: Grid, label: 'Board', path: '/board' },
  { id: 'notes', icon: FileText, label: 'Notes', path: '/notes' },
  { id: 'settings', icon: Settings, label: 'Settings', path: '/settings' },
];

const chatNavItem: NavItem = {
  id: 'chat',
  icon: MessageCircle,
  label: 'Chat',
  path: '/chat',
};

const systemViewItem: NavItem = {
  id: 'system-view',
  icon: BarChart3,
  label: 'System',
  path: '/system-view',
};

export function MobileBottomNav() {
  const navigate = useNavigate();
  const routerState = useRouterState();
  const isMobile = useIsMobile();
  const { featureFlags } = useAppStore();

  // Don't render on desktop
  if (!isMobile) {
    return null;
  }

  let navItems = [...baseNavItems];
  if (featureFlags.avaChat) {
    navItems.splice(1, 0, chatNavItem);
  }
  if (featureFlags.systemView) {
    navItems.splice(1, 0, systemViewItem);
  }

  const currentPath = routerState.location.pathname;

  const handleNavigate = (path: string) => {
    navigate({ to: path });
  };

  return (
    <nav
      className={cn(
        'fixed bottom-0 left-0 right-0 z-40',
        'h-[56px] pb-[env(safe-area-inset-bottom)]',
        'bg-gradient-to-b from-sidebar/95 via-sidebar/85 to-sidebar/90 backdrop-blur-2xl',
        'border-t border-border/60 shadow-[0_-1px_20px_-5px_rgba(0,0,0,0.1)]',
        'flex items-center justify-around px-2'
      )}
      data-testid="mobile-bottom-nav"
    >
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = currentPath === item.path;

        return (
          <button
            key={item.id}
            onClick={() => handleNavigate(item.path)}
            className={cn(
              'flex flex-col items-center justify-center gap-1 px-4 py-2 rounded-lg',
              'transition-all duration-200',
              'min-w-[60px]',
              isActive
                ? 'text-primary bg-primary/10'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
            )}
            aria-label={item.label}
            aria-current={isActive ? 'page' : undefined}
          >
            <Icon className={cn('h-5 w-5', isActive && 'scale-110')} />
            <span className="text-xs font-medium">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
