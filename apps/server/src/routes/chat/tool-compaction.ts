/**
 * Tool Result Compaction
 *
 * Reduces tool result payload sizes before they are added to conversation history.
 * Applies per-tool policies (structural reduction or truncation) and a size-based
 * fallback for oversized generic results.
 *
 * Usage:
 *   const compact = compactToolResult('list_features', rawResult);
 */

/** Fallback: truncate serialized results exceeding this character count */
const MAX_RESULT_CHARS = 8_000;

/** Maximum characters to retain for agent output (last N chars of the log) */
const AGENT_OUTPUT_MAX_CHARS = 2_000;

/** Maximum characters for large text blobs (spec, notes, briefing, etc.) */
const TEXT_BLOB_MAX_CHARS = 4_000;

// ---------------------------------------------------------------------------
// Per-tool compaction helpers
// ---------------------------------------------------------------------------

function compactListFeatures(result: unknown): unknown {
  if (!Array.isArray(result)) return result;
  return result.map((f: Record<string, unknown>) => ({
    id: f['id'],
    title: f['title'],
    status: f['status'],
  }));
}

function compactBoardSummary(result: unknown): unknown {
  if (result && typeof result === 'object' && !Array.isArray(result)) {
    const r = result as Record<string, unknown>;
    return { total: r['total'], byStatus: r['byStatus'] };
  }
  return result;
}

function compactAgentOutput(result: unknown): unknown {
  if (result && typeof result === 'object' && !Array.isArray(result)) {
    const r = result as Record<string, unknown>;
    const output = typeof r['output'] === 'string' ? r['output'] : '';
    const truncated =
      output.length > AGENT_OUTPUT_MAX_CHARS ? output.slice(-AGENT_OUTPUT_MAX_CHARS) : output;
    return { featureId: r['featureId'], output: truncated };
  }
  return result;
}

function compactFeatureSummary(result: unknown): unknown {
  if (result && typeof result === 'object' && !Array.isArray(result)) {
    const r = result as Record<string, unknown>;
    if (r['id']) {
      return { id: r['id'], title: r['title'], status: r['status'] };
    }
  }
  return result;
}

function truncateTextField(result: unknown, field: string): unknown {
  if (result && typeof result === 'object' && !Array.isArray(result)) {
    const r = result as Record<string, unknown>;
    const text = typeof r[field] === 'string' ? r[field] : '';
    if (text.length > TEXT_BLOB_MAX_CHARS) {
      return { ...r, [field]: text.slice(0, TEXT_BLOB_MAX_CHARS) + '\n...[truncated]' };
    }
  }
  return result;
}

function compactListAgentTemplates(result: unknown): unknown {
  if (!Array.isArray(result)) return result;
  return result.map((t: Record<string, unknown>) => ({
    id: t['id'],
    name: t['name'],
    role: t['role'],
  }));
}

function compactExecuteDynamicAgent(result: unknown): unknown {
  if (result && typeof result === 'object' && !Array.isArray(result)) {
    const r = result as Record<string, unknown>;
    const output = typeof r['output'] === 'string' ? r['output'] : '';
    const truncated =
      output.length > AGENT_OUTPUT_MAX_CHARS * 2
        ? output.slice(-AGENT_OUTPUT_MAX_CHARS * 2)
        : output;
    return { ...r, output: truncated };
  }
  return result;
}

function compactListRunningAgents(result: unknown): unknown {
  if (!Array.isArray(result)) return result;
  return result.map((a: Record<string, unknown>) => ({
    featureId: a['featureId'],
    status: a['status'],
    model: a['model'],
  }));
}

function compactListProjects(result: unknown): unknown {
  if (!Array.isArray(result)) return result;
  return result.map((p: Record<string, unknown>) => ({
    slug: p['slug'],
    title: p['title'],
    status: p['status'],
    milestoneCount: p['milestoneCount'],
  }));
}

function compactProjectSummary(result: unknown): unknown {
  if (result && typeof result === 'object' && !Array.isArray(result)) {
    const r = result as Record<string, unknown>;
    return {
      slug: r['slug'],
      title: r['title'],
      status: r['status'],
      goal: r['goal'],
    };
  }
  return result;
}

function compactListStagingCandidates(result: unknown): unknown {
  if (!Array.isArray(result)) return result;
  return result.map((c: Record<string, unknown>) => ({
    featureId: c['featureId'],
    title: c['title'],
    status: c['status'],
    prNumber: c['prNumber'],
  }));
}

function compactBoardSummaryExtended(result: unknown): unknown {
  if (result && typeof result === 'object' && !Array.isArray(result)) {
    const r = result as Record<string, unknown>;
    return {
      total: r['total'],
      byStatus: r['byStatus'],
      recentActivity: r['recentActivity'],
    };
  }
  return result;
}

// ---------------------------------------------------------------------------
// Size-based fallback
// ---------------------------------------------------------------------------

function compactBySize(result: unknown): unknown {
  if (result === null || result === undefined) return result;
  const serialized = JSON.stringify(result);
  if (serialized.length <= MAX_RESULT_CHARS) return result;
  // Return a truncation notice so the model knows data was cut
  return {
    __compacted: true,
    preview: serialized.slice(0, MAX_RESULT_CHARS),
    originalBytes: serialized.length,
    note: 'Result was compacted due to size. Ask for specific fields if you need more detail.',
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Apply a compaction policy to a tool result before it is added to conversation history.
 *
 * @param toolName - The name of the tool that produced the result
 * @param result   - The raw result value returned by the tool's execute function
 * @returns        A compacted version of the result
 */
export function compactToolResult(toolName: string, result: unknown): unknown {
  switch (toolName) {
    // boardRead
    case 'get_board_summary':
      return compactBoardSummary(result);
    case 'list_features':
      return compactListFeatures(result);
    case 'get_feature':
      return compactBySize(result);
    case 'create_plan':
      return result;
    case 'get_presence_state':
      return result;

    // boardWrite — return only id/title/status for mutating ops that echo the feature
    case 'create_feature':
      return compactFeatureSummary(result);
    case 'update_feature':
      return compactFeatureSummary(result);
    case 'move_feature':
      return result; // already small: { featureId, newStatus }
    case 'delete_feature':
      return result; // small confirmation object

    // agentControl
    case 'list_running_agents':
      return compactListRunningAgents(result);
    case 'start_agent':
      return result;
    case 'stop_agent':
      return result;
    case 'get_agent_output':
      return compactAgentOutput(result);

    // autoMode
    case 'get_auto_mode_status':
      return result;
    case 'start_auto_mode':
      return result;
    case 'stop_auto_mode':
      return result;

    // projectMgmt
    case 'get_project_spec':
      return truncateTextField(result, 'content');
    case 'update_project_spec':
      return result;

    // orchestration
    case 'get_execution_order':
      return compactBySize(result);
    case 'set_feature_dependencies':
      return result;

    // agentTemplates
    case 'list_agent_templates':
      return compactListAgentTemplates(result);
    case 'execute_dynamic_agent':
      return compactExecuteDynamicAgent(result);

    // notes
    case 'list_note_tabs':
      return result;
    case 'read_note_tab':
      return truncateTextField(result, 'content');
    case 'write_note_tab':
      return result;

    // metrics
    case 'get_project_metrics':
      return result;
    case 'get_capacity_metrics':
      return result;

    // github
    case 'check_pr_status':
      return result;
    case 'merge_pr':
      return result;
    case 'get_pr_feedback':
      return compactBySize(result);

    // staging
    case 'list_staging_candidates':
      return compactListStagingCandidates(result);
    case 'promote_to_staging':
      return result;

    // context files
    case 'list_context_files':
      return result;
    case 'get_context_file':
      return truncateTextField(result, 'content');
    case 'create_context_file':
      return result;

    // projects
    case 'list_projects':
      return compactListProjects(result);
    case 'get_project':
      return compactProjectSummary(result);
    case 'create_project':
      return compactProjectSummary(result);
    case 'create_project_plan':
      return compactProjectSummary(result);
    case 'approve_project':
      return result;
    case 'launch_project':
      return result;
    case 'get_project_lifecycle_status':
      return result;

    // briefing / extended board summary
    case 'get_briefing':
      return truncateTextField(result, 'content');
    case 'get_board_summary_extended':
      return compactBoardSummaryExtended(result);

    default:
      return compactBySize(result);
  }
}
