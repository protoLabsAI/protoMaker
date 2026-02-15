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
import {
  CopilotKitProvider as CKProvider,
  CopilotSidebar,
  useAgentContext,
} from '@copilotkitnext/react';
import '@copilotkitnext/react/styles.css';
import { getCopilotKitThemeStyles } from './theme-bridge';
import { getAuthHeaders } from '@/lib/api-fetch';
import { useAuthStore } from '@/store/auth-store';
import { AgentStateDisplay } from './agent-state-display';
import { WorkflowSelector } from './workflow-selector';
import { useAppStore } from '@/store/app-store';

const CopilotAvailableContext = createContext(false);

/**
 * Injects project context into CopilotKit using useAgentContext.
 * Provides agents with current project path and feature list.
 */
function ProjectContextInjector() {
  const currentProject = useAppStore((s) => s.currentProject);
  const features = useAppStore((s) => s.features);

  // Inject current project path
  useAgentContext({
    description: 'Current project path — the absolute filesystem path to the active project',
    value: currentProject?.path || null,
  });

  // Inject feature list summary
  useAgentContext({
    description: 'Feature list — all features on the board with their current status',
    value:
      features.length > 0
        ? features.map((f) => ({
            id: f.id,
            title: f.title,
            status: f.status,
            complexity: f.complexity,
          }))
        : null,
  });

  return null;
}

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
        <CKProvider runtimeUrl="/api/copilotkit" headers={getAuthHeaders()} credentials="include">
          <ProjectContextInjector />
          {children}
        </CKProvider>
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
  const [selectedWorkflow, setSelectedWorkflow] = useState('default');

  if (!available) {
    return <>{children}</>;
  }

  return (
    <>
      {children}
      <div style={getCopilotKitThemeStyles()}>
        <WorkflowSelector value={selectedWorkflow} onChange={setSelectedWorkflow} />
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
