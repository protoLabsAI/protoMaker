/**
 * Workflow Selector Component
 *
 * Provides a dropdown UI to select which LangGraph workflow/agent to invoke.
 * Queries the /api/copilotkit/info endpoint to discover available agents.
 * Selection persists across messages within the session.
 *
 * Note: Agent selection currently managed via local state.
 * Future enhancement will integrate with CopilotKit's agent routing mechanism.
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getAuthHeaders } from '@/lib/api-fetch';

interface AgentInfo {
  name: string;
  description?: string;
}

interface WorkflowContextValue {
  selectedAgent: string;
  setSelectedAgent: (agent: string) => void;
}

const WorkflowContext = createContext<WorkflowContextValue | null>(null);

export function useWorkflowSelection() {
  const context = useContext(WorkflowContext);
  if (!context) {
    throw new Error('useWorkflowSelection must be used within WorkflowProvider');
  }
  return context;
}

export function WorkflowProvider({ children }: { children: ReactNode }) {
  const [selectedAgent, setSelectedAgent] = useState<string>('default');

  return (
    <WorkflowContext.Provider value={{ selectedAgent, setSelectedAgent }}>
      {children}
    </WorkflowContext.Provider>
  );
}

export function WorkflowSelector() {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const { selectedAgent, setSelectedAgent } = useWorkflowSelection();

  useEffect(() => {
    const controller = new AbortController();

    fetch('/api/copilotkit/info', {
      signal: controller.signal,
      credentials: 'include',
      headers: getAuthHeaders(),
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Failed to fetch agents: ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        // CopilotKit /info endpoint returns { agents: { [name: string]: AgentInfo } }
        const agentList: AgentInfo[] = [];

        if (data.agents && typeof data.agents === 'object') {
          for (const [name, info] of Object.entries(data.agents)) {
            agentList.push({
              name,
              description: (info as any)?.description || getDefaultDescription(name),
            });
          }
        }

        setAgents(agentList);
        setLoading(false);
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          console.warn('[WorkflowSelector] Failed to load agents:', err);
          // Fallback to default agent
          setAgents([{ name: 'default', description: 'Ava - Board Assistant' }]);
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, []);

  const handleAgentChange = (value: string) => {
    setSelectedAgent(value);
    console.log('[WorkflowSelector] Agent selected:', value);
  };

  if (loading) {
    return <div className="px-4 py-2 text-sm text-muted-foreground">Loading workflows...</div>;
  }

  if (agents.length === 0) {
    return null;
  }

  return (
    <div className="px-4 py-2 border-b border-border">
      <Select value={selectedAgent} onValueChange={handleAgentChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select workflow" />
        </SelectTrigger>
        <SelectContent>
          {agents.map((agent) => (
            <SelectItem key={agent.name} value={agent.name}>
              <div className="flex flex-col items-start">
                <span className="font-medium">{formatAgentName(agent.name)}</span>
                {agent.description && (
                  <span className="text-xs text-muted-foreground">{agent.description}</span>
                )}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * Format agent name for display (e.g., "content-pipeline" -> "Content Pipeline")
 */
function formatAgentName(name: string): string {
  if (name === 'default') {
    return 'Ava (Default)';
  }
  return name
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Provide default descriptions for known agents
 */
function getDefaultDescription(name: string): string {
  const descriptions: Record<string, string> = {
    default: 'Board management and project assistance',
    'content-pipeline': 'Autonomous content creation workflow',
    'antagonistic-review': 'Code review and quality assurance',
  };
  return descriptions[name] || 'AI workflow agent';
}
