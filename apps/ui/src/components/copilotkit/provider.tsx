/**
 * CopilotKit Provider
 *
 * Wraps the app with CopilotKit context, but only when the runtime
 * endpoint is available. Falls through to children without CopilotKit
 * when the endpoint is unreachable (e.g. CI/E2E tests without API key).
 *
 * Wrapped in an error boundary so CopilotKit failures never crash the app.
 */

import { Component, createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { CopilotKitProvider as CKProvider, CopilotSidebar } from '@copilotkitnext/react';
import '@copilotkitnext/react/styles.css';
import { getCopilotKitThemeStyles } from './theme-bridge';
import { getAuthHeaders } from '@/lib/api-fetch';
import { useAuthStore } from '@/store/auth-store';
import { AgentStateDisplay } from './agent-state-display';
import { WorkflowSelector, WorkflowProvider } from './workflow-selector';

const CopilotAvailableContext = createContext(false);

/**
 * Error boundary that catches CopilotKit crashes and falls through
 * to rendering children without CopilotKit features.
 */
class CopilotErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode; fallback: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.warn('[CopilotKit] Error caught by boundary, disabling sidebar:', error.message);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

/**
 * Conditionally wraps children with CopilotKit provider.
 * Checks if the /api/copilotkit endpoint responds before enabling.
 * Wrapped in error boundary so CopilotKit can never crash the app.
 */
export function CopilotKitProvider({ children }: { children: ReactNode }) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    // Only check when authenticated — endpoint requires auth
    if (!isAuthenticated) {
      return;
    }
    const controller = new AbortController();
    fetch('/api/copilotkit/info', {
      signal: controller.signal,
      credentials: 'include',
      headers: getAuthHeaders(),
    })
      .then((res) => {
        // 2xx = CopilotKit route exists and responds with agent info.
        // 404 = route not registered (CopilotKit disabled).
        setAvailable(res.ok);
      })
      .catch(() => {
        setAvailable(false);
      });
    return () => controller.abort();
  }, [isAuthenticated]);

  const isAvailable = available === true;
  const unavailableFallback = (
    <CopilotAvailableContext.Provider value={false}>{children}</CopilotAvailableContext.Provider>
  );

  if (!isAvailable) {
    return unavailableFallback;
  }

  return (
    <CopilotErrorBoundary fallback={unavailableFallback}>
      <CopilotAvailableContext.Provider value={true}>
        <WorkflowProvider>
          <CKProvider runtimeUrl="/api/copilotkit" headers={getAuthHeaders()} credentials="include">
            {children}
          </CKProvider>
        </WorkflowProvider>
      </CopilotAvailableContext.Provider>
    </CopilotErrorBoundary>
  );
}

/**
 * Renders CopilotSidebar only when CopilotKit is available.
 * Falls through to plain children when not available.
 */
export function CopilotSidebarWrapper({ children }: { children: ReactNode }) {
  const available = useContext(CopilotAvailableContext);

  if (!available) {
    return <>{children}</>;
  }

  return (
    <>
      {children}
      <div style={getCopilotKitThemeStyles()}>
        <WorkflowSelector />
        <CopilotSidebar
          defaultOpen={false}
          labels={{
            modalHeaderTitle: 'Ava',
            welcomeMessageText: 'How can I help with your project?',
          }}
        />
        <AgentStateDisplay />
      </div>
    </>
  );
}
