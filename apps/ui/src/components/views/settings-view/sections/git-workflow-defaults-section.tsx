/**
 * Git Workflow Defaults Section — Global defaults for git workflow automation.
 *
 * Configures global git workflow defaults (auto-commit, push, PR creation, merge)
 * stored in data/settings.json under the gitWorkflow key.
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
}: {
  label: string;
  description: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-20 rounded border border-border bg-background px-2 py-1 text-sm text-right"
      />
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
  onChange,
  options,
}: {
  label: string;
  description: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
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
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="py-2">
      <div className="mb-1.5">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="w-full rounded border border-border bg-background px-2 py-1 text-sm font-mono resize-y"
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

export function GitWorkflowDefaultsSection() {
  const queryClient = useQueryClient();
  const [localSettings, setLocalSettings] = useState<Required<GitWorkflowSettings>>(
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
        ...(data.settings.gitWorkflow ?? {}),
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

  const update = <K extends keyof GitWorkflowSettings>(key: K, value: GitWorkflowSettings[K]) => {
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
            Global defaults for git automation after feature completion
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
          <SectionHeader title="Automation" />
          <ToggleRow
            label="Auto Commit"
            description="Automatically commit changes when feature is completed"
            checked={localSettings.autoCommit}
            onChange={(v) => update('autoCommit', v)}
          />
          <ToggleRow
            label="Auto Push"
            description="Push to remote after commit (requires Auto Commit)"
            checked={localSettings.autoPush}
            onChange={(v) => update('autoPush', v)}
          />
          <ToggleRow
            label="Auto Create PR"
            description="Create a pull request after push (requires Auto Push)"
            checked={localSettings.autoCreatePR}
            onChange={(v) => update('autoCreatePR', v)}
          />
          <ToggleRow
            label="Auto Merge PR"
            description="Merge PR automatically after creation (requires Auto Create PR)"
            checked={localSettings.autoMergePR}
            onChange={(v) => update('autoMergePR', v)}
          />
          <ToggleRow
            label="Wait for CI"
            description="Wait for CI checks to pass before merging"
            checked={localSettings.waitForCI}
            onChange={(v) => update('waitForCI', v)}
          />
          <ToggleRow
            label="Skip Git Hooks"
            description="Bypass Husky/commitlint/lint-staged on agent commits. Disable to run local hooks."
            checked={localSettings.skipGitHooks}
            onChange={(v) => update('skipGitHooks', v)}
          />
        </div>

        <div className="py-3">
          <SectionHeader title="Pull Request" />
          <SelectRow
            label="Merge Strategy"
            description="How PRs are merged: merge commit, squash, or rebase"
            value={localSettings.prMergeStrategy}
            onChange={(v) => update('prMergeStrategy', v as PRMergeStrategy)}
            options={[
              { value: 'merge', label: 'Merge commit' },
              { value: 'squash', label: 'Squash' },
              { value: 'rebase', label: 'Rebase' },
            ]}
          />
          <TextRow
            label="Base Branch"
            description="Default branch for PR creation"
            value={localSettings.prBaseBranch}
            onChange={(v) => update('prBaseBranch', v)}
            placeholder="dev"
          />
          <NumberRow
            label="Max Lines Changed"
            description="Flag PR as oversized above this threshold (0 = disabled)"
            value={localSettings.maxPRLinesChanged}
            onChange={(v) => update('maxPRLinesChanged', v)}
            min={0}
            max={10000}
          />
          <NumberRow
            label="Max Files Touched"
            description="Flag PR as oversized above this file count (0 = disabled)"
            value={localSettings.maxPRFilesTouched}
            onChange={(v) => update('maxPRFilesTouched', v)}
            min={0}
            max={500}
          />
        </div>

        <div className="pt-3">
          <SectionHeader title="Staging" />
          <TextareaRow
            label="Exclude from Staging"
            description="Directories to exclude from git add (one per line)"
            value={localSettings.excludeFromStaging.join('\n')}
            onChange={(v) =>
              update(
                'excludeFromStaging',
                v
                  .split('\n')
                  .map((s) => s.trim())
                  .filter(Boolean)
              )
            }
            placeholder={'.automaker/\n.worktrees/'}
          />
          <TextareaRow
            label="Soft Checks"
            description="CI check names that won't block merge (one per line, case-insensitive substring)"
            value={localSettings.softChecks.join('\n')}
            onChange={(v) =>
              update(
                'softChecks',
                v
                  .split('\n')
                  .map((s) => s.trim())
                  .filter(Boolean)
              )
            }
            placeholder={'Cloudflare Pages\ncodecov/patch'}
          />
        </div>
      </div>
    </div>
  );
}
