/**
 * Entry point — minimal hash-based router.
 *
 * Routes:
 *   #/           → Component Playground (default)
 *   #/site       → Documentation site (git-backed content via TinaCMS)
 *   #/admin      → TinaCMS admin panel launcher
 */

import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import { PlaygroundRoute } from './routes/playground';
import { SiteRoute } from './routes/site';
import { AdminRoute } from './routes/admin';
import { DocsRoute } from './routes/docs';

type Route = '/' | '/docs' | '/site' | '/admin';

function getRoute(): Route {
  const hash = window.location.hash.replace('#', '') || '/';
  if (hash === '/docs') return '/docs';
  if (hash === '/site') return '/site';
  if (hash === '/admin') return '/admin';
  return '/';
}

const NAV_ITEMS: { route: Route; label: string }[] = [
  { route: '/', label: 'Playground' },
  { route: '/docs', label: 'Docs' },
  { route: '/site', label: 'Site' },
  { route: '/admin', label: 'Admin' },
];

function Nav({ current }: { current: Route }) {
  return (
    <nav
      style={{
        display: 'flex',
        gap: '2px',
        padding: '8px 16px',
        background: '#111',
        borderBottom: '1px solid #333',
        fontFamily: 'system-ui, sans-serif',
        fontSize: '13px',
      }}
    >
      {NAV_ITEMS.map(({ route, label }) => (
        <a
          key={route}
          href={`#${route}`}
          style={{
            padding: '6px 14px',
            borderRadius: '6px',
            color: current === route ? '#fff' : '#888',
            background: current === route ? '#333' : 'transparent',
            textDecoration: 'none',
            fontWeight: current === route ? 600 : 400,
            transition: 'all 0.15s',
          }}
        >
          {label}
        </a>
      ))}
    </nav>
  );
}

function App() {
  const [route, setRoute] = useState<Route>(getRoute);

  useEffect(() => {
    const onHashChange = () => setRoute(getRoute());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <Nav current={route} />
      <div style={{ flex: 1, overflow: 'auto' }}>
        {route === '/docs' && <DocsRoute />}
        {route === '/site' && <SiteRoute />}
        {route === '/admin' && <AdminRoute />}
        {route === '/' && <PlaygroundRoute />}
      </div>
    </div>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('No #root element found');

createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
