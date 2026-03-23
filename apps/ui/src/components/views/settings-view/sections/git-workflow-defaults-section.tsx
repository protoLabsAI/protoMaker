/**
 * Git Workflow Defaults Section — Configure global git automation defaults.
 *
 * Controls auto-commit, push, PR creation, merge strategy, and PR size limits.
 * These defaults apply to all projects that don't override them locally.
 */

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@protolabsai/ui/atoms';
import { Button } from '@protolabsai/ui/atoms';
import { Loader2, Save } from 'lucide-react';
import { getHttpApiClient } from '@/lib/http-api-client';
import { toast } from 'sonner';
import type { GitWorkflowSettings, PRMergeStrategy } from '@protolabsai/types';
import { DEFAULT_GIT_WORKFLOW_SETTINGS } from '@protolabsai/types';

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
          className="w-20 rounded border border-border bg-background px-2 py-1 text-sm text-right"
        />
        {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
      </div>
    </div>
  );
}

function TextRow({
  label,
  description,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  description: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-32 rounded border border-border bg-background px-2 py-1 text-sm"
      />
    </div>
  );
}

function SelectRow({
  label,
  description,
  value,
  options,
  onChange,
}: {
  label: string;
  description: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border border-border bg-background px-2 py-1 text-sm"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function TextareaRow({
  label,
  description,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  description: string;
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
}) {
  const text = value.join('\n');
  return (
    <div className="py-2 space-y-1.5">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <textarea
        value={text}
        onChange={(e) => onChange(e.target.value.split('\n').filter((s) => s.trim() !== ''))}
        placeholder={placeholder}
        rows={3}
        className="w-full rounded border border-border bg-background px-2 py-1 text-sm font-mono resize-none"
      />
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

const PR_MERGE_STRATEGY_OPTIONS: { value: PRMergeStrategy; label: string }[] = [
  { value: 'squash', label: 'Squash' },
  { value: 'merge', label: 'Merge commit' },
  { value: 'rebase', label: 'Rebase' },
];

export function GitWorkflowDefaultsSection() {
  const queryClient = useQueryClient();
  const [localSettings, setLocalSettings] = useState<GitWorkflowSettings>(
    DEFAULT_GIT_WORKFLOW_SETTINGS
  );
  const [isDirty, setIsDirty] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['settings', 'global'],
    queryFn: async () => {
      const api = getHttpApiClient();
      return api.settings.getGlobal();
    },
    staleTime: 10000,
  });

  useEffect(() => {
    if (data?.settings) {
      setLocalSettings({
        ...DEFAULT_GIT_WORKFLOW_SETTINGS,
        ...data.settings.gitWorkflow,
      });
      setIsDirty(false);
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async (gitWorkflow: GitWorkflowSettings) => {
      const api = getHttpApiClient();
      return api.settings.updateGlobal({ gitWorkflow });
    },
    onSuccess: () => {
      toast.success('Git workflow defaults saved');
      setIsDirty(false);
      queryClient.invalidateQueries({ queryKey: ['settings', 'global'] });
    },
    onError: (error) => {
      toast.error(`Failed to save: ${error instanceof Error ? error.message : 'Unknown error'}`);
    },
  });

  const set = <K extends keyof GitWorkflowSettings>(key: K, value: GitWorkflowSettings[K]) => {
    setLocalSettings((prev) => ({ ...prev, [key]: value }));
    setIsDirty(true);
  };

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
          <h2 className="text-lg font-semibold">Git Workflow Defaults</h2>
          <p className="text-xs text-muted-foreground">
            Global defaults for automatic commit, push, PR creation, and merge
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
          <SectionHeader title="Git Automation" />
          <ToggleRow
            label="Auto-Commit"
            description="Commit changes when a feature reaches verified status"
            checked={localSettings.autoCommit ?? DEFAULT_GIT_WORKFLOW_SETTINGS.autoCommit}
            onChange={(v) => set('autoCommit', v)}
          />
          <ToggleRow
            label="Auto-Push"
            description="Push branch to remote after commit (requires Auto-Commit)"
            checked={localSettings.autoPush ?? DEFAULT_GIT_WORKFLOW_SETTINGS.autoPush}
            onChange={(v) => set('autoPush', v)}
          />
          <ToggleRow
            label="Auto-Create PR"
            description="Open a pull request after push (requires Auto-Push)"
            checked={localSettings.autoCreatePR ?? DEFAULT_GIT_WORKFLOW_SETTINGS.autoCreatePR}
            onChange={(v) => set('autoCreatePR', v)}
          />
          <ToggleRow
            label="Auto-Merge PR"
            description="Merge the PR automatically after creation (requires Auto-Create PR)"
            checked={localSettings.autoMergePR ?? DEFAULT_GIT_WORKFLOW_SETTINGS.autoMergePR}
            onChange={(v) => set('autoMergePR', v)}
          />
          <ToggleRow
            label="Wait for CI"
            description="Hold merge until all CI checks pass"
            checked={localSettings.waitForCI ?? DEFAULT_GIT_WORKFLOW_SETTINGS.waitForCI}
            onChange={(v) => set('waitForCI', v)}
          />
        </div>

        <div className="py-3">
          <SectionHeader title="Pull Request" />
          <SelectRow
            label="Merge Strategy"
            description="How commits are combined when the PR is merged"
            value={
              localSettings.prMergeStrategy ?? DEFAULT_GIT_WORKFLOW_SETTINGS.prMergeStrategy
            }
            options={PR_MERGE_STRATEGY_OPTIONS}
            onChange={(v) => set('prMergeStrategy', v as PRMergeStrategy)}
          />
          <TextRow
            label="Base Branch"
            description="Target branch for new pull requests"
            value={localSettings.prBaseBranch ?? DEFAULT_GIT_WORKFLOW_SETTINGS.prBaseBranch}
            onChange={(v) => set('prBaseBranch', v)}
            placeholder="dev"
          />
          <NumberRow
            label="Max Lines Changed"
            description="Flag PR as oversized above this total diff size (0 = disabled)"
            value={
              localSettings.maxPRLinesChanged ?? DEFAULT_GIT_WORKFLOW_SETTINGS.maxPRLinesChanged
            }
            onChange={(v) => set('maxPRLinesChanged', v)}
            min={0}
            max={10000}
            suffix="lines"
          />
          <NumberRow
            label="Max Files Touched"
            description="Flag PR as oversized above this file count (0 = disabled)"
            value={
              localSettings.maxPRFilesTouched ?? DEFAULT_GIT_WORKFLOW_SETTINGS.maxPRFilesTouched
            }
            onChange={(v) => set('maxPRFilesTouched', v)}
            min={0}
            max={500}
            suffix="files"
          />
        </div>

        <div className="pt-3">
          <SectionHeader title="Staging &amp; CI" />
          <TextareaRow
            label="Exclude from Staging"
            description="Directories to skip during git add (one path per line)"
            value={
              localSettings.excludeFromStaging ??
              DEFAULT_GIT_WORKFLOW_SETTINGS.excludeFromStaging
            }
            onChange={(v) => set('excludeFromStaging', v)}
            placeholder=".automaker/&#10;.worktrees/"
          />
          <TextareaRow
            label="Soft CI Checks"
            description="CI check names whose failures won't block auto-merge (one per line, case-insensitive substring)"
            value={localSettings.softChecks ?? DEFAULT_GIT_WORKFLOW_SETTINGS.softChecks}
            onChange={(v) => set('softChecks', v)}
            placeholder="Cloudflare Pages&#10;codecov/patch"
          />
        </div>
      </div>
    </div>
  );
}
