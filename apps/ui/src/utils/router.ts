import { createRouter, createBrowserHistory } from '@tanstack/react-router';
import { routeTree } from '../routeTree.gen';

const history = createBrowserHistory();

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
