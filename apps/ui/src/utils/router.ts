import { createRouter, createMemoryHistory, createBrowserHistory } from '@tanstack/react-router';
import { routeTree } from '../routeTree.gen';

// Use browser history in web mode (for e2e tests and dev), memory history in Electron
const isElectron = typeof window !== 'undefined' && window.electronAPI !== undefined;
const BOARD_ROUTE_PATH = '/board';
const OVERLAY_ROUTE_PATH = '/chat-overlay';

// Overlay windows are loaded with #overlay hash to distinguish from the main window
const isOverlay = typeof window !== 'undefined' && window.location.hash === '#overlay';

const initialRoute = isOverlay ? OVERLAY_ROUTE_PATH : BOARD_ROUTE_PATH;

const history = isElectron
  ? createMemoryHistory({ initialEntries: [initialRoute] })
  : createBrowserHistory();

export const router = createRouter({
  routeTree,
  defaultPendingMinMs: 0,
  history,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
