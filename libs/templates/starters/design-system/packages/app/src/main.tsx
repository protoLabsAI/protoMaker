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

type Route = '/' | '/site' | '/admin';

function getRoute(): Route {
  const hash = window.location.hash.replace('#', '') || '/';
  if (hash === '/site') return '/site';
  if (hash === '/admin') return '/admin';
  return '/';
}

function App() {
  const [route, setRoute] = useState<Route>(getRoute);

  useEffect(() => {
    const onHashChange = () => setRoute(getRoute());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  if (route === '/site') return <SiteRoute />;
  if (route === '/admin') return <AdminRoute />;
  return <PlaygroundRoute />;
}

const root = document.getElementById('root');
if (!root) throw new Error('No #root element found');

createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
