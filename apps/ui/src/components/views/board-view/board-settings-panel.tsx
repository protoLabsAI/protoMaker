import { useCallback } from 'react';
import { X, Bot, Zap, ClipboardList, FileText, ScrollText, GitMerge } from 'lucide-react';
import { Label } from '@protolabsai/ui/atoms';
import { Switch } from '@protolabsai/ui/atoms';
import { Slider } from '@protolabsai/ui/atoms';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@protolabsai/ui/atoms';
import { useAppStore } from '@/store/app-store';
import { useGlobalSettings } from '@/hooks/queries';
import { useUpdateGlobalSettings } from '@/hooks/mutations/use-settings-mutations';
import { DEFAULT_GIT_WORKFLOW_SETTINGS } from '@protolabsai/types';
import type { GitWorkflowSettings, PlanningMode } from '@protolabsai/types';

interface BoardSettingsPanelProps {
  onClose: () => void;
  maxConcurrency: number;
  runningAgentsCount: number;
  onConcurrencyChange: (value: number) => void;
}

export function BoardSettingsPanel({
  onClose,
  maxConcurrency,
  runningAgentsCount,
  onConcurrencyChange,
}: BoardSettingsPanelProps) {
  const skipVerificationInAutoMode = useAppStore((s) => s.skipVerificationInAutoMode);
  const setSkipVerificationInAutoMode = useAppStore((s) => s.setSkipVerificationInAutoMode);
  const defaultPlanningMode = useAppStore((s) => s.defaultPlanningMode);
  const setDefaultPlanningMode = useAppStore((s) => s.setDefaultPlanningMode);
  const defaultRequirePlanApproval = useAppStore((s) => s.defaultRequirePlanApproval);
  const setDefaultRequirePlanApproval = useAppStore((s) => s.setDefaultRequirePlanApproval);
  const defaultSkipTests = useAppStore((s) => s.defaultSkipTests);
  const setDefaultSkipTests = useAppStore((s) => s.setDefaultSkipTests);

  const { data: globalSettings } = useGlobalSettings();
  const updateGlobalSettings = useUpdateGlobalSettings({ showSuccessToast: false });

  const gitWorkflow: Required<GitWorkflowSettings> = {
    ...DEFAULT_GIT_WORKFLOW_SETTINGS,
    ...(globalSettings?.gitWorkflow ?? {}),
  };

  const handleGitWorkflowChange = useCallback(
    (patch: Partial<GitWorkflowSettings>) => {
      updateGlobalSettings.mutate({ gitWorkflow: { ...gitWorkflow, ...patch } });
    },
    [updateGlobalSettings, gitWorkflow]
  );

  return (
    <div
      className="absolute top-0 right-0 h-full w-72 bg-card border-l border-border shadow-xl z-20 flex flex-col overflow-hidden"
      data-testid="board-settings-panel"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <h3 className="text-sm font-semibold">Board Settings</h3>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded hover:bg-accent/50 transition-colors"
          aria-label="Close settings panel"
          data-testid="board-settings-panel-close"
        >
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {/* Agents section */}
        <div className="px-4 pt-4 pb-2">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Agents
          </p>

          {/* Max concurrent agents */}
          <div className="space-y-2 mb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Bot className="w-3.5 h-3.5 text-muted-foreground" />
                <Label className="text-xs font-medium">Max Concurrent</Label>
              </div>
              <span className="text-xs text-muted-foreground tabular-nums">
                {runningAgentsCount}/{maxConcurrency}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <Slider
                value={[maxConcurrency]}
                onValueChange={(value) => onConcurrencyChange(value[0])}
                min={1}
                max={10}
                step={1}
                className="flex-1"
                data-testid="board-settings-concurrency-slider"
              />
              <span className="text-xs font-medium min-w-[2ch] text-right tabular-nums">
                {maxConcurrency}
              </span>
            </div>
          </div>

          {/* Skip verification */}
          <div className="flex items-center justify-between py-1.5">
            <Label
              htmlFor="settings-skip-verification"
              className="text-xs font-medium cursor-pointer"
            >
              Skip verification
            </Label>
            <Switch
              id="settings-skip-verification"
              checked={skipVerificationInAutoMode}
              onCheckedChange={setSkipVerificationInAutoMode}
              data-testid="board-settings-skip-verification"
            />
          </div>
        </div>

        <div className="mx-4 border-t border-border/50" />

        {/* Feature Defaults section */}
        <div className="px-4 pt-3 pb-2">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Feature Defaults
          </p>

          {/* Planning mode */}
          <div className="flex items-center justify-between py-1.5">
            <Label className="text-xs font-medium">Planning Mode</Label>
            <Select
              value={defaultPlanningMode}
              onValueChange={(v) => setDefaultPlanningMode(v as PlanningMode)}
            >
              <SelectTrigger
                className="h-7 w-[120px] text-xs border-border bg-secondary"
                data-testid="board-settings-planning-mode"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="skip">
                  <div className="flex items-center gap-1.5">
                    <Zap className="h-3 w-3 text-emerald-500" />
                    <span>Skip</span>
                  </div>
                </SelectItem>
                <SelectItem value="lite">
                  <div className="flex items-center gap-1.5">
                    <ClipboardList className="h-3 w-3 text-blue-500" />
                    <span>Lite</span>
                  </div>
                </SelectItem>
                <SelectItem value="spec">
                  <div className="flex items-center gap-1.5">
                    <FileText className="h-3 w-3 text-purple-500" />
                    <span>Spec</span>
                  </div>
                </SelectItem>
                <SelectItem value="full">
                  <div className="flex items-center gap-1.5">
                    <ScrollText className="h-3 w-3 text-amber-500" />
                    <span>Full</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Require plan approval */}
          {defaultPlanningMode !== 'skip' && (
            <div className="flex items-center justify-between py-1.5">
              <Label
                htmlFor="settings-require-plan-approval"
                className="text-xs font-medium cursor-pointer"
              >
                Require plan approval
              </Label>
              <Switch
                id="settings-require-plan-approval"
                checked={defaultRequirePlanApproval}
                onCheckedChange={setDefaultRequirePlanApproval}
                data-testid="board-settings-require-plan-approval"
              />
            </div>
          )}

          {/* Skip tests */}
          <div className="flex items-center justify-between py-1.5">
            <Label htmlFor="settings-skip-tests" className="text-xs font-medium cursor-pointer">
              Enable tests
            </Label>
            <Switch
              id="settings-skip-tests"
              checked={!defaultSkipTests}
              onCheckedChange={(checked) => setDefaultSkipTests(!checked)}
              data-testid="board-settings-skip-tests"
            />
          </div>
        </div>

        <div className="mx-4 border-t border-border/50" />

        {/* Git Workflow section */}
        <div className="px-4 pt-3 pb-4">
          <div className="flex items-center gap-1.5 mb-3">
            <GitMerge className="w-3 h-3 text-muted-foreground" />
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Git Workflow
            </p>
          </div>

          <div className="flex items-center justify-between py-1.5">
            <Label htmlFor="settings-auto-commit" className="text-xs font-medium cursor-pointer">
              Auto commit
            </Label>
            <Switch
              id="settings-auto-commit"
              checked={gitWorkflow.autoCommit}
              onCheckedChange={(checked) => handleGitWorkflowChange({ autoCommit: checked })}
              data-testid="board-settings-auto-commit"
            />
          </div>

          <div className="flex items-center justify-between py-1.5">
            <Label htmlFor="settings-auto-push" className="text-xs font-medium cursor-pointer">
              Auto push
            </Label>
            <Switch
              id="settings-auto-push"
              checked={gitWorkflow.autoPush}
              onCheckedChange={(checked) => handleGitWorkflowChange({ autoPush: checked })}
              data-testid="board-settings-auto-push"
            />
          </div>

          <div className="flex items-center justify-between py-1.5">
            <Label htmlFor="settings-auto-create-pr" className="text-xs font-medium cursor-pointer">
              Auto create PR
            </Label>
            <Switch
              id="settings-auto-create-pr"
              checked={gitWorkflow.autoCreatePR}
              onCheckedChange={(checked) => handleGitWorkflowChange({ autoCreatePR: checked })}
              data-testid="board-settings-auto-create-pr"
            />
          </div>

          <div className="flex items-center justify-between py-1.5">
            <Label htmlFor="settings-auto-merge-pr" className="text-xs font-medium cursor-pointer">
              Auto merge PR
            </Label>
            <Switch
              id="settings-auto-merge-pr"
              checked={gitWorkflow.autoMergePR}
              onCheckedChange={(checked) => handleGitWorkflowChange({ autoMergePR: checked })}
              data-testid="board-settings-auto-merge-pr"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
