/**
 * Beads issue tracker types
 *
 * Public types for the `br` (beads_rust) integration. The server's BeadsService
 * subprocesses the `br` CLI; these types describe the JSON shape it returns.
 *
 * @see CLAUDE.md — "Local Issue Tracker: `br` (beads)"
 */

export type BeadsIssueStatus = 'open' | 'in_progress' | 'blocked' | 'closed' | 'tombstone';
export type BeadsIssueType = 'feature' | 'task' | 'bug' | 'chore' | 'epic';
export type BeadsPriority = 0 | 1 | 2 | 3 | 4;

export interface BeadsIssue {
  id: string;
  title: string;
  description?: string;
  status: BeadsIssueStatus;
  priority: BeadsPriority;
  issue_type: BeadsIssueType;
  created_at: string;
  created_by: string;
  updated_at: string;
  closed_at?: string;
  close_reason?: string;
  source_repo?: string;
  assignee?: string;
  dependency_count?: number;
  dependent_count?: number;
}

export interface CreateBeadsIssueInput {
  title: string;
  type?: BeadsIssueType;
  priority?: BeadsPriority;
  description?: string;
  assignee?: string;
}

export interface UpdateBeadsIssueInput {
  title?: string;
  description?: string;
  status?: Exclude<BeadsIssueStatus, 'closed' | 'tombstone'>;
  priority?: BeadsPriority;
  type?: BeadsIssueType;
  assignee?: string;
}
