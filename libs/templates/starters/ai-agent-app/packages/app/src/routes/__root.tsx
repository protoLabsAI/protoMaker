import { createRootRoute, Link, Outlet } from '@tanstack/react-router';
import { MessageSquare, History, Settings, Workflow, FileText } from 'lucide-react';

// ─── Root route ───────────────────────────────────────────────────────────────

export const Route = createRootRoute({
  component: RootLayout,
});

// ─── Layout ───────────────────────────────────────────────────────────────────

function RootLayout() {
  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        backgroundColor: 'var(--background)',
        color: 'var(--foreground)',
        overflow: 'hidden',
      }}
    >
      <Sidebar />
      <main style={{ flex: 1, overflow: 'hidden' }}>
        <Outlet />
      </main>
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

const navItems = [
  { to: '/' as const, label: 'Chat', icon: MessageSquare, exact: true },
  { to: '/sessions' as const, label: 'Sessions', icon: History, exact: false },
  { to: '/flows' as const, label: 'Flows', icon: Workflow, exact: false },
  { to: '/prompts' as const, label: 'Prompts', icon: FileText, exact: false },
  { to: '/settings' as const, label: 'Settings', icon: Settings, exact: false },
];

function Sidebar() {
  return (
    <nav
      style={{
        width: 64,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        padding: '16px 0',
        borderRight: '1px solid var(--border)',
        backgroundColor: 'var(--surface)',
        flexShrink: 0,
      }}
    >
      {navItems.map(({ to, label, icon: Icon, exact }) => (
        <Link key={to} to={to} style={{ width: 52 }} activeOptions={{ exact }}>
          {({ isActive }) => (
            <span
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
                padding: '10px 8px',
                borderRadius: 8,
                cursor: 'pointer',
                color: isActive ? 'var(--primary)' : 'var(--text-muted)',
                backgroundColor: isActive ? 'var(--surface-2)' : 'transparent',
                transition: 'background-color 150ms, color 150ms',
                textDecoration: 'none',
              }}
            >
              <Icon size={20} />
              <span style={{ fontSize: 10, fontWeight: 500 }}>{label}</span>
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}
