/**
 * Workflow Settings Panel — Configure pipeline hardening features.
 *
 * Controls goal gates, checkpointing, loop detection, supervisor,
 * retro feedback, cleanup, and signal intake behavior.
 */

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@protolabs/ui/atoms';
import { Button } from '@protolabs/ui/atoms';
import { Loader2, Save } from 'lucide-react';
import { getHttpApiClient } from '@/lib/http-api-client';
import { useAppStore } from '@/store/app-store';
import { toast } from 'sonner';
import type { WorkflowSettings } from '@automaker/types';
import { DEFAULT_WORKFLOW_SETTINGS } from '@automaker/types';

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
          checked ? 'bg-violet-500' : 'bg-muted'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

function NumberRow({
  label,
  description,
  value,
  onChange,
  min,
  max,
  suffix,
}: {
  label: string;
  description: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  suffix?: string;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-16 rounded border border-border bg-background px-2 py-1 text-sm text-right"
        />
        {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
      </div>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 mt-4 first:mt-0">
      {title}
    </h3>
  );
}

export function WorkflowSettingsPanel() {
  const projectPath = useAppStore((s) => s.currentProject?.path);
  const queryClient = useQueryClient();
  const [localSettings, setLocalSettings] = useState<WorkflowSettings>(DEFAULT_WORKFLOW_SETTINGS);
  const [isDirty, setIsDirty] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['settings', 'workflow', projectPath],
    queryFn: async () => {
      const api = getHttpApiClient();
      return api.settings.getWorkflow(projectPath!);
    },
    enabled: !!projectPath,
    staleTime: 10000,
  });

  useEffect(() => {
    if (data?.workflow) {
      setLocalSettings(data.workflow as unknown as WorkflowSettings);
      setIsDirty(false);
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async (workflow: Partial<WorkflowSettings>) => {
      const api = getHttpApiClient();
      return api.settings.updateWorkflow(projectPath!, workflow as Record<string, unknown>);
    },
    onSuccess: () => {
      toast.success('Workflow settings saved');
      setIsDirty(false);
      queryClient.invalidateQueries({ queryKey: ['settings', 'workflow'] });
    },
    onError: (error) => {
      toast.error(`Failed to save: ${error instanceof Error ? error.message : 'Unknown error'}`);
    },
  });

  const update = <K extends keyof WorkflowSettings>(section: K, key: string, value: unknown) => {
    setLocalSettings((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [key]: value,
      },
    }));
    setIsDirty(true);
  };

  if (!projectPath) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">
          Select a project to configure workflow settings.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-1 max-w-xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">Workflow Settings</h2>
          <p className="text-xs text-muted-foreground">
            Pipeline hardening and automation behavior
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isDirty && (
            <Badge variant="outline" className="text-[10px]">
              Unsaved
            </Badge>
          )}
          <Button
            size="sm"
            onClick={() => saveMutation.mutate(localSettings)}
            disabled={!isDirty || saveMutation.isPending}
          >
            {saveMutation.isPending ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5 mr-1.5" />
            )}
            Save
          </Button>
        </div>
      </div>

      <div className="divide-y divide-border/30">
        <div className="pb-3">
          <SectionHeader title="Pipeline" />
          <ToggleRow
            label="Goal Gates"
            description="Validate pre/post conditions on state transitions"
            checked={localSettings.pipeline.goalGatesEnabled}
            onChange={(v) => update('pipeline', 'goalGatesEnabled', v)}
          />
          <ToggleRow
            label="Checkpointing"
            description="Save state for crash recovery"
            checked={localSettings.pipeline.checkpointEnabled}
            onChange={(v) => update('pipeline', 'checkpointEnabled', v)}
          />
          <ToggleRow
            label="Loop Detection"
            description="Detect and abort agents stuck in loops"
            checked={localSettings.pipeline.loopDetectionEnabled}
            onChange={(v) => update('pipeline', 'loopDetectionEnabled', v)}
          />
          <ToggleRow
            label="Supervisor"
            description="Monitor agent runtime and cost"
            checked={localSettings.pipeline.supervisorEnabled}
            onChange={(v) => update('pipeline', 'supervisorEnabled', v)}
          />
          <NumberRow
            label="Max Runtime"
            description="Warning threshold for agent runtime"
            value={localSettings.pipeline.maxAgentRuntimeMinutes}
            onChange={(v) => update('pipeline', 'maxAgentRuntimeMinutes', v)}
            min={10}
            max={180}
            suffix="min"
          />
          <NumberRow
            label="Max Cost"
            description="Abort threshold for agent cost"
            value={localSettings.pipeline.maxAgentCostUsd}
            onChange={(v) => update('pipeline', 'maxAgentCostUsd', v)}
            min={1}
            max={100}
            suffix="USD"
          />
        </div>

        <div className="py-3">
          <SectionHeader title="Retrospective" />
          <ToggleRow
            label="Auto Retro"
            description="Generate retrospectives on project completion"
            checked={localSettings.retro.enabled}
            onChange={(v) => update('retro', 'enabled', v)}
          />
        </div>

        <div className="py-3">
          <SectionHeader title="Cleanup" />
          <ToggleRow
            label="Auto Cleanup"
            description="Reset stale orphaned features automatically"
            checked={localSettings.cleanup.autoCleanupEnabled}
            onChange={(v) => update('cleanup', 'autoCleanupEnabled', v)}
          />
          <NumberRow
            label="Stale Threshold"
            description="Hours before orphaned features are reset"
            value={localSettings.cleanup.staleThresholdHours}
            onChange={(v) => update('cleanup', 'staleThresholdHours', v)}
            min={1}
            max={24}
            suffix="hrs"
          />
        </div>

        <div className="pt-3">
          <SectionHeader title="Signal Intake" />
          <ToggleRow
            label="Auto Research"
            description="Trigger research pipeline for new signals"
            checked={localSettings.signalIntake.autoResearch}
            onChange={(v) => update('signalIntake', 'autoResearch', v)}
          />
          <ToggleRow
            label="Auto-Approve PRDs"
            description="Skip manual review and auto-approve PRDs for decomposition"
            checked={localSettings.signalIntake.autoApprovePRD}
            onChange={(v) => update('signalIntake', 'autoApprovePRD', v)}
          />
        </div>
      </div>
    </div>
  );
}
