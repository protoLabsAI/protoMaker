/**
 * Workflow Selector for CopilotKit Sidebar
 *
 * Dropdown to choose between available workflows (agents).
 * Fetches workflow metadata from GET /api/copilotkit/workflows.
 */

import { useEffect, useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Workflow } from 'lucide-react';

export interface WorkflowMetadata {
  id: string;
  name: string;
  description: string;
  supportedModels: string[];
}

interface WorkflowSelectorProps {
  value: string;
  onChange: (workflowId: string) => void;
  disabled?: boolean;
}

export function WorkflowSelector({ value, onChange, disabled }: WorkflowSelectorProps) {
  const [workflows, setWorkflows] = useState<WorkflowMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchWorkflows = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch('/api/copilotkit/workflows');
        if (!response.ok) {
          throw new Error(`Failed to fetch workflows: ${response.statusText}`);
        }
        const data = await response.json();
        setWorkflows(data.workflows || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        console.error('Failed to fetch workflows:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchWorkflows();
  }, []);

  const selected = workflows.find((w) => w.id === value);

  if (loading) {
    return (
      <div className="flex items-center gap-2">
        <Select disabled>
          <SelectTrigger className="h-8 w-[180px] text-xs">
            <div className="flex items-center gap-1.5">
              <Workflow className="w-3.5 h-3.5" />
              <span>Loading...</span>
            </div>
          </SelectTrigger>
        </Select>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-destructive text-xs">
        <span>Failed to load workflows</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className="h-8 w-[180px] text-xs">
          <div className="flex items-center gap-1.5">
            <Workflow className="w-3.5 h-3.5" />
            <SelectValue />
          </div>
        </SelectTrigger>
        <SelectContent>
          {workflows.map((workflow) => (
            <SelectItem key={workflow.id} value={workflow.id}>
              <div className="flex flex-col">
                <span className="font-medium">{workflow.name}</span>
                <span className="text-muted-foreground text-[10px]">{workflow.description}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
