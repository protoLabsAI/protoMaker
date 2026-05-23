import { useMemo, useState } from 'react';
import { ListTodo, Plus, Check, X, Loader2 } from 'lucide-react';
import { useAppStore } from '@/store/app-store';
import { PanelHeader } from '@/components/shared/panel-header';
import { useBeadsList } from '@/hooks/queries/use-beads';
import {
  useCreateBeadsIssue,
  useUpdateBeadsIssue,
  useCloseBeadsIssue,
  useDeleteBeadsIssue,
} from '@/hooks/mutations/use-beads-mutations';
import type { BeadsIssue, BeadsIssueType, BeadsPriority } from '@protolabsai/types';

const TYPE_OPTIONS: BeadsIssueType[] = ['feature', 'task', 'bug', 'chore', 'epic'];
const PRIORITY_LABELS: Record<BeadsPriority, string> = {
  0: 'P0 critical',
  1: 'P1 high',
  2: 'P2 medium',
  3: 'P3 normal',
  4: 'P4 backlog',
};
const STATUS_BADGE: Record<BeadsIssue['status'], string> = {
  open: 'bg-muted text-foreground border-border',
  in_progress: 'bg-status-info/10 text-status-info border-status-info/30',
  blocked: 'bg-status-warning/10 text-status-warning border-status-warning/30',
  closed: 'bg-status-success/10 text-status-success border-status-success/30',
  tombstone: 'bg-destructive/10 text-destructive border-destructive/30',
};

export function BeadsView() {
  const currentProject = useAppStore((s) => s.currentProject);
  const projectPath = currentProject?.path;

  const { data: issues = [], isLoading, isError, error } = useBeadsList(projectPath);
  const createIssue = useCreateBeadsIssue(projectPath ?? '');
  const updateIssue = useUpdateBeadsIssue(projectPath ?? '');
  const closeIssue = useCloseBeadsIssue(projectPath ?? '');
  const deleteIssue = useDeleteBeadsIssue(projectPath ?? '');

  const [title, setTitle] = useState('');
  const [type, setType] = useState<BeadsIssueType>('task');
  const [priority, setPriority] = useState<BeadsPriority>(2);

  const sorted = useMemo(() => {
    const order: Record<BeadsIssue['status'], number> = {
      in_progress: 0,
      open: 1,
      blocked: 2,
      closed: 3,
      tombstone: 4,
    };
    return [...issues].sort((a, b) => order[a.status] - order[b.status] || a.priority - b.priority);
  }, [issues]);

  const handleCreate = () => {
    const trimmed = title.trim();
    if (!trimmed || !projectPath) return;
    createIssue.mutate({ title: trimmed, type, priority });
    setTitle('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleCreate();
  };

  if (!projectPath) {
    return (
      <div className="flex h-full flex-col">
        <PanelHeader icon={ListTodo} title="Beads" />
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          No project selected
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <PanelHeader icon={ListTodo} title="Beads" />

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {/* Create row */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="New issue title..."
            className="flex-1 rounded-md border bg-background px-3 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value as BeadsIssueType)}
            className="rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
          >
            {TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select
            value={priority}
            onChange={(e) => setPriority(Number(e.target.value) as BeadsPriority)}
            className="rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
          >
            {([0, 1, 2, 3, 4] as BeadsPriority[]).map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABELS[p]}
              </option>
            ))}
          </select>
          <button
            onClick={handleCreate}
            disabled={!title.trim() || createIssue.isPending}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {createIssue.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Add
          </button>
        </div>

        {/* List */}
        {isLoading && (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading issues…
          </div>
        )}

        {isError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            Failed to load issues: {error instanceof Error ? error.message : 'Unknown error'}. Make
            sure `br` is installed and `.beads/` is initialized in this project.
          </div>
        )}

        {!isLoading && !isError && sorted.length === 0 && (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            No issues yet. Create one above, or run{' '}
            <code className="rounded bg-muted px-1">br create</code> in the project root.
          </div>
        )}

        {sorted.length > 0 && (
          <div className="overflow-hidden rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">ID</th>
                  <th className="px-3 py-2 text-left font-medium">Title</th>
                  <th className="px-3 py-2 text-left font-medium">Type</th>
                  <th className="px-3 py-2 text-left font-medium">Priority</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                  <th className="px-3 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((issue) => (
                  <tr key={issue.id} className="border-t hover:bg-muted/30">
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                      {issue.id}
                    </td>
                    <td className="px-3 py-2">
                      {issue.status === 'closed' ? (
                        <span className="text-muted-foreground line-through">{issue.title}</span>
                      ) : (
                        issue.title
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs uppercase text-muted-foreground">
                      {issue.issue_type}
                    </td>
                    <td className="px-3 py-2 text-xs">{PRIORITY_LABELS[issue.priority]}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-block rounded border px-2 py-0.5 text-xs ${STATUS_BADGE[issue.status]}`}
                      >
                        {issue.status}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        {issue.status === 'open' && (
                          <button
                            onClick={() =>
                              updateIssue.mutate({ id: issue.id, input: { status: 'in_progress' } })
                            }
                            disabled={updateIssue.isPending}
                            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                            title="Start"
                          >
                            <Loader2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {issue.status !== 'closed' && (
                          <button
                            onClick={() => closeIssue.mutate({ id: issue.id, reason: 'done' })}
                            disabled={closeIssue.isPending}
                            className="rounded p-1 text-status-success hover:bg-status-success/10"
                            title="Close"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => deleteIssue.mutate(issue.id)}
                          disabled={deleteIssue.isPending}
                          className="rounded p-1 text-destructive hover:bg-destructive/10"
                          title="Delete"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
