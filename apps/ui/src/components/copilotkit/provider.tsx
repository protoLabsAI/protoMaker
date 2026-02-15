/**
 * CopilotKit Provider
 *
 * Wraps the app with CopilotKit context, but only when the runtime
 * endpoint is available. Falls through to children without CopilotKit
 * when the endpoint is unreachable (e.g. CI/E2E tests without API key).
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { CopilotKit } from '@copilotkit/react-core';
import { CopilotSidebar } from '@copilotkit/react-ui';
import '@copilotkit/react-ui/styles.css';
import { getCopilotKitThemeStyles } from './theme-bridge';
import { useCopilotKitContext } from '@/hooks/use-copilotkit-context';
import { useCopilotKitSuggestions } from '@/hooks/use-copilotkit-suggestions';
import { getAuthHeaders } from '@/lib/api-fetch';

const CopilotAvailableContext = createContext(false);

/**
 * Injects CopilotKit hooks when provider is active.
 * Must be rendered inside <CopilotKit>.
 */
function CopilotKitHooks({ children }: { children: ReactNode }) {
  useCopilotKitContext();
  useCopilotKitSuggestions();
  return <>{children}</>;
}

/**
 * Conditionally wraps children with CopilotKit provider.
 * Checks if the /api/copilotkit endpoint responds before enabling.
 */
export function CopilotKitProvider({ children }: { children: ReactNode }) {
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/copilotkit', {
      method: 'HEAD',
      signal: controller.signal,
      credentials: 'include',
      headers: getAuthHeaders(),
    })
      .then((res) => {
        // 2xx or 405 = route exists and CopilotKit is available.
        // 401 = auth failed or route not registered. 404 = route not found.
        setAvailable(res.ok || res.status === 405);
      })
      .catch(() => {
        setAvailable(false);
      });
    return () => controller.abort();
  }, []);

  const isAvailable = available === true;

  if (!isAvailable) {
    return (
      <CopilotAvailableContext.Provider value={false}>{children}</CopilotAvailableContext.Provider>
    );
  }

  return (
    <CopilotAvailableContext.Provider value={true}>
      <CopilotKit
        runtimeUrl="/api/copilotkit"
        agent="default"
        headers={getAuthHeaders()}
        credentials="include"
      >
        <CopilotKitHooks>{children}</CopilotKitHooks>
      </CopilotKit>
    </CopilotAvailableContext.Provider>
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
    <div style={getCopilotKitThemeStyles()}>
      <CopilotSidebar
        defaultOpen={false}
        clickOutsideToClose={false}
        shortcut="\\"
        labels={{
          title: 'Ava',
          initial: 'How can I help with your project?',
        }}
      >
        {children}
      </CopilotSidebar>
    </div>
  );
}
