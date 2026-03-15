import { TracesPage } from './routes/traces.js';

/**
 * Root application component.
 *
 * Routing is intentionally kept minimal here — the app currently has a single
 * page (/traces).  Replace with react-router-dom if you need multi-page routing.
 */
export default function App() {
  return <TracesPage />;
}
