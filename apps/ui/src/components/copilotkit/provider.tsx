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
import { ModelSelector, getStoredModel, storeModel, type ModelTier } from './model-selector';

const CopilotAvailableContext = createContext(false);

/**
 * Model + workflow selection context shared between provider and sidebar.
 * Lives at the CopilotKitProvider level so model changes can
 * trigger CKProvider re-mount with updated headers.
 * Workflow state is co-located here because model persistence is per-workflow.
 */
interface ModelContextValue {
  selectedModel: ModelTier;
  setSelectedModel: (model: ModelTier) => void;
  selectedWorkflow: string;
  setSelectedWorkflow: (workflow: string) => void;
}

const ModelContext = createContext<ModelContextValue | null>(null);

function useModelSelection() {
  const context = useContext(ModelContext);
  if (!context) {
    throw new Error('useModelSelection must be used within CopilotKitProvider');
  }
  return context;
}

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
  const [selectedWorkflow, setSelectedWorkflowState] = useState('default');
  const [selectedModel, setSelectedModelState] = useState<ModelTier>(() =>
    getStoredModel('default')
  );

  const setSelectedWorkflow = (workflow: string) => {
    setSelectedWorkflowState(workflow);
    // Load the stored model preference for the new workflow
    setSelectedModelState(getStoredModel(workflow));
  };

  const setSelectedModel = (model: ModelTier) => {
    setSelectedModelState(model);
    storeModel(selectedWorkflow, model);
  };

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

  // Pass model preference to server via header
  const headers = {
    ...getAuthHeaders(),
    'X-Copilotkit-Model': selectedModel,
  };

  return (
    <CopilotErrorBoundary fallback={unavailableFallback}>
      <CopilotAvailableContext.Provider value={true}>
        <ModelContext.Provider
          value={{ selectedModel, setSelectedModel, selectedWorkflow, setSelectedWorkflow }}
        >
          <CKProvider
            key={selectedModel}
            runtimeUrl="/api/copilotkit"
            headers={headers}
            credentials="include"
          >
            <ProjectContextInjector />
            {children}
          </CKProvider>
        </ModelContext.Provider>
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
      <SidebarControls />
    </>
  );
}

/**
 * Sidebar controls rendered inside the CopilotKit context.
 * Separated so useModelSelection() has access to the provider context.
 */
function SidebarControls() {
  const { selectedWorkflow, setSelectedWorkflow } = useModelSelection();

  return (
    <div style={getCopilotKitThemeStyles()}>
      <WorkflowSelector value={selectedWorkflow} onChange={setSelectedWorkflow} />
      <SidebarModelSelector workflowId={selectedWorkflow} />
      <CopilotSidebar
        defaultOpen={false}
        labels={{
          modalHeaderTitle: 'Ava',
          welcomeMessageText: 'How can I help with your project?',
        }}
      />
      <AgentStateDisplay />
    </div>
  );
}

/**
 * Model selector shown in sidebar below workflow selector
 */
function SidebarModelSelector({ workflowId }: { workflowId: string }) {
  const { selectedModel, setSelectedModel } = useModelSelection();

  return (
    <div className="px-4 py-2 border-b border-border">
      <div className="text-xs text-muted-foreground mb-1">Model</div>
      <ModelSelector workflowId={workflowId} value={selectedModel} onChange={setSelectedModel} />
    </div>
  );
}
