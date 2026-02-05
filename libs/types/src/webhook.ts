/**
 * Webhook Types - Inbound webhook handling for GitHub events
 *
 * Defines the structure for receiving and processing webhooks from external services.
 * Currently focused on GitHub webhook events for automated feature creation and updates.
 */

/**
 * GitHubWebhookEvent - The type of GitHub event received
 *
 * Supported events:
 * - issues: Issue created, updated, or commented
 * - pull_request: PR opened, updated, merged, or closed
 * - push: Code pushed to repository
 * - check_suite: Check suite activity (completed, requested, rerequested)
 * - check_run: Check run activity (created, completed, rerequested, requested_action)
 * - ping: GitHub webhook test event
 */
export type GitHubWebhookEvent =
  | 'issues'
  | 'pull_request'
  | 'push'
  | 'check_suite'
  | 'check_run'
  | 'ping';

/**
 * GitHubIssueAction - Actions that can occur on issues
 */
export type GitHubIssueAction =
  | 'opened'
  | 'edited'
  | 'deleted'
  | 'closed'
  | 'reopened'
  | 'assigned'
  | 'unassigned'
  | 'labeled'
  | 'unlabeled';

/**
 * GitHubPullRequestAction - Actions that can occur on pull requests
 */
export type GitHubPullRequestAction =
  | 'opened'
  | 'edited'
  | 'closed'
  | 'reopened'
  | 'assigned'
  | 'unassigned'
  | 'review_requested'
  | 'review_request_removed'
  | 'labeled'
  | 'unlabeled'
  | 'synchronize';

/**
 * GitHubCheckSuiteAction - Actions that can occur on check suites
 */
export type GitHubCheckSuiteAction = 'completed' | 'requested' | 'rerequested';

/**
 * GitHubCheckRunAction - Actions that can occur on check runs
 */
export type GitHubCheckRunAction =
  | 'created'
  | 'completed'
  | 'rerequested'
  | 'requested_action';

/**
 * GitHubUser - Simplified GitHub user object
 */
export interface GitHubUser {
  login: string;
  id: number;
  avatar_url?: string;
  type: string;
}

/**
 * GitHubRepository - Simplified GitHub repository object
 */
export interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  owner: GitHubUser;
  private: boolean;
  html_url: string;
  description?: string;
  default_branch: string;
}

/**
 * GitHubIssue - Simplified GitHub issue object
 */
export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  user: GitHubUser;
  state: 'open' | 'closed';
  body?: string;
  html_url: string;
  created_at: string;
  updated_at: string;
  labels?: Array<{ name: string; color: string }>;
}

/**
 * GitHubPullRequest - Simplified GitHub pull request object
 */
export interface GitHubPullRequest {
  id: number;
  number: number;
  title: string;
  user: GitHubUser;
  state: 'open' | 'closed';
  body?: string;
  html_url: string;
  created_at: string;
  updated_at: string;
  merged: boolean;
  head: {
    ref: string;
    sha: string;
  };
  base: {
    ref: string;
    sha: string;
  };
}

/**
 * GitHubCheckSuite - Simplified GitHub check suite object
 */
export interface GitHubCheckSuite {
  id: number;
  node_id: string;
  head_branch: string | null;
  head_sha: string;
  status:
    | 'queued'
    | 'in_progress'
    | 'completed'
    | 'waiting'
    | 'requested'
    | 'pending'
    | null;
  conclusion:
    | 'success'
    | 'failure'
    | 'neutral'
    | 'cancelled'
    | 'skipped'
    | 'timed_out'
    | 'action_required'
    | 'startup_failure'
    | 'stale'
    | null;
  url: string | null;
  before: string | null;
  after: string | null;
  pull_requests: Array<{
    id: number;
    number: number;
    url: string;
    head: {
      ref: string;
      sha: string;
    };
    base: {
      ref: string;
      sha: string;
    };
  }> | null;
  app: {
    id: number;
    name: string;
    slug: string;
  } | null;
  created_at: string;
  updated_at: string;
  latest_check_runs_count?: number;
  check_runs_url?: string;
}

/**
 * GitHubCheckRun - Simplified GitHub check run object
 */
export interface GitHubCheckRun {
  id: number;
  head_sha: string;
  node_id: string;
  external_id: string | null;
  url: string;
  html_url: string | null;
  details_url: string | null;
  status: 'queued' | 'in_progress' | 'completed' | 'waiting' | 'requested' | 'pending';
  conclusion:
    | 'success'
    | 'failure'
    | 'neutral'
    | 'cancelled'
    | 'skipped'
    | 'timed_out'
    | 'action_required'
    | null;
  started_at: string | null;
  completed_at: string | null;
  name: string;
  check_suite: {
    id: number;
  };
  app: {
    id: number;
    name: string;
    slug: string;
  } | null;
  pull_requests: Array<{
    id: number;
    number: number;
    url: string;
    head: {
      ref: string;
      sha: string;
    };
    base: {
      ref: string;
      sha: string;
    };
  }>;
  output: {
    title: string | null;
    summary: string | null;
    text?: string | null;
    annotations_count?: number;
    annotations_url?: string;
  };
}

/**
 * GitHubIssueWebhookPayload - Webhook payload for issue events
 */
export interface GitHubIssueWebhookPayload {
  action: GitHubIssueAction;
  issue: GitHubIssue;
  repository: GitHubRepository;
  sender: GitHubUser;
}

/**
 * GitHubPullRequestWebhookPayload - Webhook payload for pull request events
 */
export interface GitHubPullRequestWebhookPayload {
  action: GitHubPullRequestAction;
  pull_request: GitHubPullRequest;
  repository: GitHubRepository;
  sender: GitHubUser;
}

/**
 * GitHubPushWebhookPayload - Webhook payload for push events
 */
export interface GitHubPushWebhookPayload {
  ref: string;
  before: string;
  after: string;
  repository: GitHubRepository;
  pusher: {
    name: string;
    email: string;
  };
  sender: GitHubUser;
  commits: Array<{
    id: string;
    message: string;
    author: {
      name: string;
      email: string;
    };
  }>;
}

/**
 * GitHubPingWebhookPayload - Webhook payload for ping events (webhook test)
 */
export interface GitHubPingWebhookPayload {
  zen: string;
  hook_id: number;
  repository: GitHubRepository;
  sender: GitHubUser;
}

/**
 * GitHubCheckSuiteWebhookPayload - Webhook payload for check suite events
 */
export interface GitHubCheckSuiteWebhookPayload {
  action: GitHubCheckSuiteAction;
  check_suite: GitHubCheckSuite;
  repository: GitHubRepository;
  sender: GitHubUser;
}

/**
 * GitHubCheckRunWebhookPayload - Webhook payload for check run events
 */
export interface GitHubCheckRunWebhookPayload {
  action: GitHubCheckRunAction;
  check_run: GitHubCheckRun;
  repository: GitHubRepository;
  sender: GitHubUser;
}

/**
 * GitHubWebhookPayload - Union type of all webhook payloads
 */
export type GitHubWebhookPayload =
  | GitHubIssueWebhookPayload
  | GitHubPullRequestWebhookPayload
  | GitHubPushWebhookPayload
  | GitHubCheckSuiteWebhookPayload
  | GitHubCheckRunWebhookPayload
  | GitHubPingWebhookPayload;

/**
 * WebhookVerificationResult - Result of webhook signature verification
 */
export interface WebhookVerificationResult {
  /** Whether the webhook signature is valid */
  valid: boolean;
  /** Error message if verification failed */
  error?: string;
}

/**
 * WebhookSettings - Configuration for webhook handling
 */
export interface WebhookSettings {
  /** Secret used to verify webhook signatures (HMAC-SHA256) */
  webhookSecret?: string;
  /** Whether webhook endpoint is enabled */
  webhookEnabled?: boolean;
  /** Auto-create features from GitHub issues (default: false) */
  autoCreateFromIssues?: boolean;
  /** Issue labels that trigger auto-creation (empty = all issues) */
  autoCreateLabels?: string[];
}

/**
 * Default webhook settings
 */
export const DEFAULT_WEBHOOK_SETTINGS: Required<WebhookSettings> = {
  webhookSecret: '',
  webhookEnabled: false,
  autoCreateFromIssues: false,
  autoCreateLabels: [],
};
