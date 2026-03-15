import { createRouter, RouterProvider } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen.js';

// ─── Router instance ──────────────────────────────────────────────────────────

const router = createRouter({ routeTree });

// Register the router type for type-safety across the app
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

// ─── Root component ───────────────────────────────────────────────────────────

export default function App() {
  return <RouterProvider router={router} />;
}
