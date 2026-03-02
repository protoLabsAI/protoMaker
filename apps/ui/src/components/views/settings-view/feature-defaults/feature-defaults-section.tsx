import { useQuery } from '@tanstack/react-query';
import { Label } from '@protolabs-ai/ui/atoms';
import { Checkbox } from '@protolabs-ai/ui/atoms';
import {
  FlaskConical,
  TestTube,
  AlertCircle,
  Zap,
  ClipboardList,
  FileText,
  ScrollText,
  ShieldCheck,
  FastForward,
  Sparkles,
  Cpu,
  Gauge,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getElectronAPI } from '@/lib/electron';
import { queryKeys } from '@/lib/query-keys';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@protolabs-ai/ui/atoms';
import type { PhaseModelEntry } from '@protolabs-ai/types';
import { PhaseModelSelector } from '../model-defaults/phase-model-selector';

type PlanningMode = 'skip' | 'lite' | 'spec' | 'full';

interface FeatureDefaultsSectionProps {
  defaultSkipTests: boolean;
  enableDependencyBlocking: boolean;
  skipVerificationInAutoMode: boolean;
  defaultPlanningMode: PlanningMode;
  defaultRequirePlanApproval: boolean;
  enableAiCommitMessages: boolean;
  defaultFeatureModel: PhaseModelEntry;
  onDefaultSkipTestsChange: (value: boolean) => void;
  onEnableDependencyBlockingChange: (value: boolean) => void;
  onSkipVerificationInAutoModeChange: (value: boolean) => void;
  onDefaultPlanningModeChange: (value: PlanningMode) => void;
  onDefaultRequirePlanApprovalChange: (value: boolean) => void;
  onEnableAiCommitMessagesChange: (value: boolean) => void;
  onDefaultFeatureModelChange: (value: PhaseModelEntry) => void;
}

export function FeatureDefaultsSection({
  defaultSkipTests,
  enableDependencyBlocking,
  skipVerificationInAutoMode,
  defaultPlanningMode,
  defaultRequirePlanApproval,
  enableAiCommitMessages,
  defaultFeatureModel,
  onDefaultSkipTestsChange,
  onEnableDependencyBlockingChange,
  onSkipVerificationInAutoModeChange,
  onDefaultPlanningModeChange,
  onDefaultRequirePlanApprovalChange,
  onEnableAiCommitMessagesChange,
  onDefaultFeatureModelChange,
}: FeatureDefaultsSectionProps) {
  // Fetch global auto-mode status to display the server-side concurrency cap
  const { data: autoModeStatusData } = useQuery({
    queryKey: ['autoMode', 'status', undefined],
    queryFn: async () => {
      const api = getElectronAPI();
      return api.autoMode?.status(undefined, null);
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const systemMaxConcurrency: number =
    ((autoModeStatusData as Record<string, unknown> | undefined)?.systemMaxConcurrency as number) ??
    null;

  return (
    <div
      className={cn(
        'rounded-lg overflow-hidden',
        'border border-border/50',
        'bg-gradient-to-br from-card/90 via-card/70 to-card/80 backdrop-blur-xl',
        'shadow-sm shadow-black/5'
      )}
    >
      <div className="p-4 border-b border-border/50 bg-gradient-to-r from-transparent via-accent/5 to-transparent">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-500/20 to-brand-600/10 flex items-center justify-center border border-brand-500/20">
            <FlaskConical className="w-5 h-5 text-brand-500" />
          </div>
          <h2 className="text-lg font-semibold text-foreground tracking-tight">Feature Defaults</h2>
        </div>
        <p className="text-sm text-muted-foreground/80 ml-12">
          Configure default settings for new features.
        </p>
      </div>
      <div className="p-6 space-y-5">
        {/* Default Feature Model Setting */}
        <div className="group flex items-start space-x-3 p-3 rounded-lg hover:bg-accent/30 transition-colors duration-200 -mx-3">
          <div className="w-10 h-10 mt-0.5 rounded-lg flex items-center justify-center shrink-0 bg-brand-500/10">
            <Cpu className="w-5 h-5 text-brand-500" />
          </div>
          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-foreground font-medium">Default Model</Label>
              <PhaseModelSelector
                value={defaultFeatureModel}
                onChange={onDefaultFeatureModelChange}
                compact
                align="end"
              />
            </div>
            <p className="text-xs text-muted-foreground/80 leading-relaxed">
              The default AI model and thinking level used when creating new feature cards.
            </p>
          </div>
        </div>

        {/* Separator */}
        <div className="border-t border-border/30" />

        {/* Planning Mode Default */}
        <div className="group flex items-start space-x-3 p-3 rounded-lg hover:bg-accent/30 transition-colors duration-200 -mx-3">
          <div
            className={cn(
              'w-10 h-10 mt-0.5 rounded-lg flex items-center justify-center shrink-0',
              defaultPlanningMode === 'skip'
                ? 'bg-emerald-500/10'
                : defaultPlanningMode === 'lite'
                  ? 'bg-blue-500/10'
                  : defaultPlanningMode === 'spec'
                    ? 'bg-purple-500/10'
                    : 'bg-amber-500/10'
            )}
          >
            {defaultPlanningMode === 'skip' && <Zap className="w-5 h-5 text-emerald-500" />}
            {defaultPlanningMode === 'lite' && <ClipboardList className="w-5 h-5 text-blue-500" />}
            {defaultPlanningMode === 'spec' && <FileText className="w-5 h-5 text-purple-500" />}
            {defaultPlanningMode === 'full' && <ScrollText className="w-5 h-5 text-amber-500" />}
          </div>
          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-foreground font-medium">Default Planning Mode</Label>
              <Select
                value={defaultPlanningMode}
                onValueChange={(v: string) => onDefaultPlanningModeChange(v as PlanningMode)}
              >
                <SelectTrigger className="w-[160px] h-8" data-testid="default-planning-mode-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="skip">
                    <div className="flex items-center gap-2">
                      <Zap className="h-3.5 w-3.5 text-emerald-500" />
                      <span>Skip</span>
                      <span className="text-[10px] text-muted-foreground">(Default)</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="lite">
                    <div className="flex items-center gap-2">
                      <ClipboardList className="h-3.5 w-3.5 text-blue-500" />
                      <span>Lite Planning</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="spec">
                    <div className="flex items-center gap-2">
                      <FileText className="h-3.5 w-3.5 text-purple-500" />
                      <span>Spec (Lite SDD)</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="full">
                    <div className="flex items-center gap-2">
                      <ScrollText className="h-3.5 w-3.5 text-amber-500" />
                      <span>Full (SDD)</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground/80 leading-relaxed">
              {defaultPlanningMode === 'skip' &&
                'Jump straight to implementation without upfront planning.'}
              {defaultPlanningMode === 'lite' &&
                'Create a quick planning outline with tasks before building.'}
              {defaultPlanningMode === 'spec' &&
                'Generate a specification with acceptance criteria for approval.'}
              {defaultPlanningMode === 'full' &&
                'Create comprehensive spec with phased implementation plan.'}
            </p>
          </div>
        </div>

        {/* Require Plan Approval Setting - only show when not skip */}
        {defaultPlanningMode !== 'skip' && (
          <>
            <div className="group flex items-start space-x-3 p-3 rounded-lg hover:bg-accent/30 transition-colors duration-200 -mx-3">
              <Checkbox
                id="default-require-plan-approval"
                checked={defaultRequirePlanApproval}
                onCheckedChange={(checked) => onDefaultRequirePlanApprovalChange(checked === true)}
                className="mt-1"
                data-testid="default-require-plan-approval-checkbox"
              />
              <div className="space-y-1.5">
                <Label
                  htmlFor="default-require-plan-approval"
                  className="text-foreground cursor-pointer font-medium flex items-center gap-2"
                >
                  <ShieldCheck className="w-4 h-4 text-brand-500" />
                  Require manual plan approval by default
                </Label>
                <p className="text-xs text-muted-foreground/80 leading-relaxed">
                  When enabled, the agent will pause after generating a plan and wait for you to
                  review, edit, and approve before starting implementation. You can also view the
                  plan from the feature card.
                </p>
              </div>
            </div>
          </>
        )}

        {/* Separator */}
        <div className="border-t border-border/30" />

        {/* Automated Testing Setting */}
        <div className="group flex items-start space-x-3 p-3 rounded-lg hover:bg-accent/30 transition-colors duration-200 -mx-3">
          <Checkbox
            id="default-skip-tests"
            checked={!defaultSkipTests}
            onCheckedChange={(checked) => onDefaultSkipTestsChange(checked !== true)}
            className="mt-1"
            data-testid="default-skip-tests-checkbox"
          />
          <div className="space-y-1.5">
            <Label
              htmlFor="default-skip-tests"
              className="text-foreground cursor-pointer font-medium flex items-center gap-2"
            >
              <TestTube className="w-4 h-4 text-brand-500" />
              Enable automated testing by default
            </Label>
            <p className="text-xs text-muted-foreground/80 leading-relaxed">
              When enabled, new features will use TDD with automated tests. When disabled, features
              will require manual verification.
            </p>
          </div>
        </div>

        {/* Separator */}
        <div className="border-t border-border/30" />

        {/* Dependency Blocking Setting */}
        <div className="group flex items-start space-x-3 p-3 rounded-lg hover:bg-accent/30 transition-colors duration-200 -mx-3">
          <Checkbox
            id="enable-dependency-blocking"
            checked={enableDependencyBlocking}
            onCheckedChange={(checked) => onEnableDependencyBlockingChange(checked === true)}
            className="mt-1"
            data-testid="enable-dependency-blocking-checkbox"
          />
          <div className="space-y-1.5">
            <Label
              htmlFor="enable-dependency-blocking"
              className="text-foreground cursor-pointer font-medium flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4 text-brand-500" />
              Enable Dependency Blocking
            </Label>
            <p className="text-xs text-muted-foreground/80 leading-relaxed">
              When enabled, features with incomplete dependencies will show blocked badges and
              warnings. Auto mode and backlog ordering always respect dependencies regardless of
              this setting.
            </p>
          </div>
        </div>

        {/* Separator */}
        <div className="border-t border-border/30" />

        {/* Skip Verification in Auto Mode Setting */}
        <div className="group flex items-start space-x-3 p-3 rounded-lg hover:bg-accent/30 transition-colors duration-200 -mx-3">
          <Checkbox
            id="skip-verification-auto-mode"
            checked={skipVerificationInAutoMode}
            onCheckedChange={(checked) => onSkipVerificationInAutoModeChange(checked === true)}
            className="mt-1"
            data-testid="skip-verification-auto-mode-checkbox"
          />
          <div className="space-y-1.5">
            <Label
              htmlFor="skip-verification-auto-mode"
              className="text-foreground cursor-pointer font-medium flex items-center gap-2"
            >
              <FastForward className="w-4 h-4 text-brand-500" />
              Skip verification in auto mode
            </Label>
            <p className="text-xs text-muted-foreground/80 leading-relaxed">
              When enabled, auto mode will grab features even if their dependencies are not
              verified, as long as they are not currently running. This allows faster pipeline
              execution without waiting for manual verification.
            </p>
          </div>
        </div>

        {/* Separator */}
        <div className="border-t border-border/30" />

        {/* AI Commit Messages Setting */}
        <div className="group flex items-start space-x-3 p-3 rounded-lg hover:bg-accent/30 transition-colors duration-200 -mx-3">
          <Checkbox
            id="enable-ai-commit-messages"
            checked={enableAiCommitMessages}
            onCheckedChange={(checked) => onEnableAiCommitMessagesChange(checked === true)}
            className="mt-1"
            data-testid="enable-ai-commit-messages-checkbox"
          />
          <div className="space-y-1.5">
            <Label
              htmlFor="enable-ai-commit-messages"
              className="text-foreground cursor-pointer font-medium flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4 text-brand-500" />
              Generate AI commit messages
            </Label>
            <p className="text-xs text-muted-foreground/80 leading-relaxed">
              When enabled, opening the commit dialog will automatically generate a commit message
              using AI based on your staged or unstaged changes. You can configure the model used in
              Model Defaults.
            </p>
          </div>
        </div>

        {/* Separator */}
        <div className="border-t border-border/30" />

        {/* System Concurrency Limit (read-only) */}
        <div className="group flex items-start space-x-3 p-3 rounded-lg -mx-3">
          <div className="w-10 h-10 mt-0.5 rounded-lg flex items-center justify-center shrink-0 bg-muted/40">
            <Gauge className="w-5 h-5 text-muted-foreground" />
          </div>
          <div className="flex-1 space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-foreground font-medium">System Concurrency Limit</Label>
              <span
                className="text-xs font-semibold tabular-nums px-2 py-0.5 rounded bg-muted/50 text-muted-foreground"
                data-testid="system-max-concurrency-value"
              >
                {systemMaxConcurrency !== null ? systemMaxConcurrency : '--'}
              </span>
            </div>
            <p className="text-xs text-muted-foreground/80 leading-relaxed">
              Maximum concurrent agents allowed system-wide. Set by the{' '}
              <code className="font-mono text-[11px] bg-muted/60 px-1 py-0.5 rounded">
                AUTOMAKER_MAX_CONCURRENCY
              </code>{' '}
              environment variable. Read-only — restart the server to apply changes.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
