import { createRootRoute, Link, Outlet } from '@tanstack/react-router';
import { useEffect } from 'react';
import { MessageSquare, History, Settings, Workflow, FileText } from 'lucide-react';
import { useSettingsStore } from '../store/settings-store.js';

// ── Root route ───────────────────────────────────────────────────────────────

export const Route = createRootRoute({
  component: RootLayout,
});

// ── Theme sync ───────────────────────────────────────────────────────────────

function useThemeSync() {
  const theme = useSettingsStore((s) => s.theme);

  useEffect(() => {
    const apply = (resolved: 'dark' | 'light') => {
      document.documentElement.dataset.theme = resolved;
    };

    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      apply(mq.matches ? 'dark' : 'light');
      const handler = (e: MediaQueryListEvent) => apply(e.matches ? 'dark' : 'light');
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }

    apply(theme);
  }, [theme]);
}

// ── Layout ───────────────────────────────────────────────────────────────────

function RootLayout() {
  useThemeSync();

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <Sidebar />
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}

// ── Sidebar ──────────────────────────────────────────────────────────────────

const navItems = [
  { to: '/' as const, label: 'Chat', icon: MessageSquare, exact: true },
  { to: '/sessions' as const, label: 'Sessions', icon: History, exact: false },
  { to: '/flows' as const, label: 'Flows', icon: Workflow, exact: false },
  { to: '/prompts' as const, label: 'Prompts', icon: FileText, exact: false },
  { to: '/settings' as const, label: 'Settings', icon: Settings, exact: false },
];

function Sidebar() {
  return (
    <nav className="flex w-16 shrink-0 flex-col items-center gap-1 border-r border-border bg-card py-4">
      {navItems.map(({ to, label, icon: Icon, exact }) => (
        <Link key={to} to={to} className="w-[52px]" activeOptions={{ exact }}>
          {({ isActive }) => (
            <span
              className={`flex flex-col items-center gap-1 rounded-lg px-2 py-2.5 text-[10px] font-medium transition-colors ${
                isActive
                  ? 'bg-accent text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              <Icon size={20} />
              {label}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}
