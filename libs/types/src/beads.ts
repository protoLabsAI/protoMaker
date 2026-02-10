/**
 * Beads task management types
 * https://github.com/beadset/beads
 */

/**
 * Beads task/issue type
 */
export interface BeadsTask {
  id: string;
  title: string;
  description?: string;
  status: 'open' | 'closed';
  priority: number;
  issue_type: 'task' | 'bug' | 'feature' | 'epic' | 'story';
  owner?: string;
  created_at: string;
  created_by?: string;
  updated_at: string;
  labels?: string[];
  dependency_count: number;
  dependent_count: number;
  comment_count: number;
  dependencies?: string[]; // Only in 'show' output
  dependents?: string[]; // Only in 'show' output
}

/**
 * Options for creating a Beads task
 */
export interface CreateBeadsTaskOptions {
  title: string;
  description?: string;
  priority?: number;
  issueType?: 'task' | 'bug' | 'feature' | 'epic' | 'story';
  owner?: string;
  labels?: string[];
  parent?: string; // Parent task ID for dependencies
}

/**
 * Options for updating a Beads task
 */
export interface UpdateBeadsTaskOptions {
  title?: string;
  description?: string;
  priority?: number;
  issueType?: 'task' | 'bug' | 'feature' | 'epic' | 'story';
  owner?: string;
  labels?: string[];
}

/**
 * Options for listing Beads tasks
 */
export interface ListBeadsTasksOptions {
  status?: 'open' | 'closed' | 'all';
  owner?: string;
  label?: string;
  limit?: number;
}

/**
 * Result of a Beads operation
 */
export interface BeadsOperationResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
