/**
 * Tool Profiles — Named capability sets for different agent roles.
 *
 * Based on trajectory analysis of `.automaker/trajectory/` and the set of
 * SharedTool instances registered across the system, three canonical profiles
 * are defined:
 *
 *   • execution     — minimal set for feature-implementation agents
 *   • orchestration — full tool set for Ava / CoS orchestration agents
 *   • review        — read-only inspection + comment tools for review agents
 *
 * # Trajectory findings
 *
 * Execution agents (feature-* trajectories) consistently use:
 *   - File operations: Read, Write, Edit, Glob, Grep (Claude Code built-ins)
 *   - Shell + git: Bash (covers `git`, `npm run`, test runners)
 *   - Board updates: update_feature, get_feature, list_features
 *   - HITL: request_user_input (for ambiguity resolution)
 *
 * Ava / orchestration agents also use:
 *   - Discord messaging: discord_send_message, discord_read_channel
 *   - GitHub PR management: github_list_prs, github_merge_pr, github_check_pr_status
 *   - Claude-code delegation: claude-code
 *   - Project management: project_* suite
 *   - Full board suite: create_feature, delete_feature, set_dependencies, get_dependencies, query_board
 *
 * Review agents only read; they never mutate state.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A named profile that groups tool names by agent role.
 */
export type ToolProfileName = 'execution' | 'orchestration' | 'review';

/**
 * A tool profile definition — a named collection of tool names with rationale.
 */
export interface ToolProfile {
  /** Canonical profile identifier */
  name: ToolProfileName;

  /** Human-readable description of the profile's intended use */
  description: string;

  /**
   * Ordered list of tool names included in this profile.
   * Names match the `name` field on each SharedTool registration.
   */
  tools: readonly string[];

  /**
   * Per-tool rationale explaining why each tool is (or is not) in the profile.
   * Useful for auditing and future maintenance.
   */
  rationale: Readonly<Record<string, string>>;
}

// ---------------------------------------------------------------------------
// Profile: execution
// ---------------------------------------------------------------------------

/**
 * Execution profile — minimal tool set for feature-implementation agents.
 *
 * Rationale: execution agents need file I/O, a shell for git/tests, and just
 * enough board access to update task status. Everything else is unnecessary
 * scope that increases attack surface and token usage.
 *
 * Tool count: 10 tools (satisfies AC: 8–15 essential tools max).
 */
export const EXECUTION_PROFILE: ToolProfile = {
  name: 'execution',
  description:
    'Minimal tool set for feature execution agents: file operations, shell/git/test, ' +
    'and essential board status updates. Excludes Discord, GitHub PR management, ' +
    'project management, and delegation tools.',
  tools: [
    // Board — read + status update only
    'list_features',
    'get_feature',
    'update_feature',
    // HITL — pause for ambiguity resolution
    'request_user_input',
    // Claude Code built-ins (provided by the Agent SDK, not SharedTool registry)
    // Included here so callers know the full expected set for this profile.
    'Read',
    'Write',
    'Edit',
    'Bash',
    'Glob',
    'Grep',
  ],
  rationale: {
    list_features:
      'Agents need to inspect existing features to avoid duplicates and understand project state.',
    get_feature:
      'Required to load full feature spec (description, acceptance criteria) at task start.',
    update_feature: 'Required to mark features in-progress, done, or blocked as work proceeds.',
    request_user_input:
      'Allows agents to surface blockers to humans rather than guessing or stalling.',
    Read: 'Core file-read capability — used on every trajectory for context loading.',
    Write: 'Core file-write capability — required for creating new source files.',
    Edit: 'Core file-edit capability — used for targeted diffs; preferred over full Write.',
    Bash: 'Single shell tool covering git operations, npm scripts, and test runners.',
    Glob: 'Fast file-discovery by pattern — reduces unnecessary Bash invocations.',
    Grep: 'Content search across files — essential for symbol/import resolution.',
  },
} as const;

// ---------------------------------------------------------------------------
// Profile: orchestration
// ---------------------------------------------------------------------------

/**
 * Orchestration profile — full tool set for Ava / Chief-of-Staff agents.
 *
 * Rationale: orchestration agents (Ava) direct the overall system. They need
 * every tool available so they can delegate, monitor, communicate, and manage
 * the board without being artificially constrained.
 */
export const ORCHESTRATION_PROFILE: ToolProfile = {
  name: 'orchestration',
  description:
    'Full tool set for Ava and orchestration agents: all board, project, Discord, ' +
    'GitHub PR, Claude-code delegation, and HITL tools.',
  tools: [
    // Board — full CRUD + dependency management
    'list_features',
    'get_feature',
    'create_feature',
    'update_feature',
    'delete_feature',
    'query_board',
    'set_dependencies',
    'get_dependencies',
    // Project management
    'project_list',
    'project_get',
    'project_update',
    'project_add_link',
    'project_remove_link',
    'project_add_update',
    'project_remove_update',
    'project_list_docs',
    'project_get_doc',
    'project_create_doc',
    'project_update_doc',
    'project_delete_doc',
    'project_list_features',
    // Discord communication
    'discord_send_message',
    'discord_read_channel',
    // GitHub PR management
    'github_list_prs',
    'github_merge_pr',
    'github_check_pr_status',
    // Agent delegation
    'claude-code',
    // HITL
    'request_user_input',
    // Claude Code built-ins
    'Read',
    'Write',
    'Edit',
    'Bash',
    'Glob',
    'Grep',
    'WebSearch',
    'WebFetch',
    'Agent',
  ],
  rationale: {
    list_features: 'Orchestrators need full board visibility.',
    get_feature: 'Deep inspection of any feature on demand.',
    create_feature: 'Ava creates features from PRDs and briefings.',
    update_feature: 'Ava updates priority, status, complexity across the board.',
    delete_feature: 'Ava can prune stale or duplicate features.',
    query_board: 'Flexible board queries for planning and reporting.',
    set_dependencies: 'Ava manages the dependency graph for scheduling.',
    get_dependencies: 'Ava reads the dependency graph for scheduling.',
    project_list: 'Orchestrators manage multiple projects.',
    project_get: 'Full project context for planning.',
    project_update: 'Ava updates project health and metadata.',
    project_add_link: 'Ava maintains project resource links.',
    project_remove_link: 'Ava cleans up stale links.',
    project_add_update: 'Ava posts status updates to projects.',
    project_remove_update: 'Ava removes obsolete updates.',
    project_list_docs: 'Ava reads project documentation.',
    project_get_doc: 'Full document content for context.',
    project_create_doc: 'Ava authors project documents.',
    project_update_doc: 'Ava revises living documents.',
    project_delete_doc: 'Ava removes obsolete docs.',
    project_list_features: 'Project-scoped feature listing for reporting.',
    discord_send_message: 'Ava communicates async via Discord.',
    discord_read_channel: 'Ava monitors channels for team updates.',
    github_list_prs: 'Ava reviews open PRs for board status.',
    github_merge_pr: 'Ava can merge approved PRs.',
    github_check_pr_status: 'Ava monitors CI for PR health.',
    'claude-code': 'Ava delegates coding sub-tasks to execution agents.',
    request_user_input: 'Ava escalates decisions requiring human input.',
    Read: 'File reading for context and review.',
    Write: 'File creation for docs and config.',
    Edit: 'Targeted file edits.',
    Bash: 'Shell access for operational tasks.',
    Glob: 'File discovery.',
    Grep: 'Content search.',
    WebSearch: 'Research and trend monitoring.',
    WebFetch: 'Fetching external docs and resources.',
    Agent: 'Spawning subagents for parallelism.',
  },
} as const;

// ---------------------------------------------------------------------------
// Profile: review
// ---------------------------------------------------------------------------

/**
 * Review profile — read-only tools plus comment/notification capabilities.
 *
 * Rationale: review agents inspect code and board state but must not mutate
 * anything. Write access is explicitly excluded to prevent accidental side
 * effects during automated review passes.
 */
export const REVIEW_PROFILE: ToolProfile = {
  name: 'review',
  description:
    'Read-only tool set for review agents: board inspection, PR status, Discord ' +
    'channel reads, and file system reads. No write or mutation tools.',
  tools: [
    // Board — read only
    'list_features',
    'get_feature',
    'get_dependencies',
    'query_board',
    // Project — read only
    'project_list',
    'project_get',
    'project_list_docs',
    'project_get_doc',
    'project_list_features',
    // GitHub — read + status (no merge)
    'github_list_prs',
    'github_check_pr_status',
    // Discord — read + send (for posting review comments)
    'discord_read_channel',
    'discord_send_message',
    // HITL — escalate review blockers
    'request_user_input',
    // Claude Code built-ins — read only
    'Read',
    'Glob',
    'Grep',
  ],
  rationale: {
    list_features: 'Reviewers need board context to understand feature scope.',
    get_feature: 'Full feature spec for review against acceptance criteria.',
    get_dependencies: 'Dependency inspection to assess blast radius of changes.',
    query_board: 'Flexible board queries for review context.',
    project_list: 'Multi-project visibility for cross-cutting reviews.',
    project_get: 'Project health context during review.',
    project_list_docs: 'Access to project documentation.',
    project_get_doc: 'Read project docs for review context.',
    project_list_features: 'Project-scoped feature listing.',
    github_list_prs: 'List open PRs for the feature being reviewed.',
    github_check_pr_status: 'Check CI status before approving.',
    discord_read_channel: 'Read discussion context around the feature.',
    discord_send_message: 'Post review comments and findings asynchronously.',
    request_user_input: 'Escalate ambiguous review decisions to humans.',
    Read: 'Read source files for code review.',
    Glob: 'Discover relevant files within a PR change set.',
    Grep: 'Search for patterns, anti-patterns, and references.',
    // Excluded tools (documented for auditability):
    // create_feature  — review agents must not create new work
    // update_feature  — review agents must not mutate board state
    // delete_feature  — destructive; not appropriate for review
    // Write           — review agents must not write files
    // Edit            — review agents must not edit files
    // Bash            — shell access not needed for read-only review
    // github_merge_pr — merging is an orchestration decision, not review
    // 'claude-code'   — delegation not appropriate for review agents
  },
} as const;

// ---------------------------------------------------------------------------
// Profile registry
// ---------------------------------------------------------------------------

const PROFILES: Readonly<Record<ToolProfileName, ToolProfile>> = {
  execution: EXECUTION_PROFILE,
  orchestration: ORCHESTRATION_PROFILE,
  review: REVIEW_PROFILE,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns the tool name list for a given profile.
 *
 * @param profile - The profile to retrieve tools for
 * @returns A readonly array of tool name strings for the profile
 *
 * @example
 * ```ts
 * const tools = getToolsForProfile('execution');
 * // ['list_features', 'get_feature', 'update_feature', 'request_user_input', 'Read', ...]
 * ```
 */
export function getToolsForProfile(profile: ToolProfileName): readonly string[] {
  return PROFILES[profile].tools;
}

/**
 * Returns the full ToolProfile definition for a given profile name.
 *
 * @param profile - The profile to retrieve
 * @returns The ToolProfile definition including description and rationale
 */
export function getProfile(profile: ToolProfileName): ToolProfile {
  return PROFILES[profile];
}

/**
 * Returns all registered profile names.
 */
export function listProfileNames(): ToolProfileName[] {
  return Object.keys(PROFILES) as ToolProfileName[];
}
