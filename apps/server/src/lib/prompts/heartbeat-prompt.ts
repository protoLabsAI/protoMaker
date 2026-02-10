/**
 * Heartbeat Prompt - Ava's board health evaluation prompt
 *
 * This prompt guides Ava through evaluating the current board state
 * and identifying issues requiring immediate attention.
 */

/**
 * Board summary data for prompt generation
 */
export interface HeartbeatPromptData {
  total: number;
  byStatus: Record<string, number>;
  blockedCount: number;
  inProgressCount: number;
  staleFeatures: Array<{
    id: string;
    title: string;
    status: string;
    daysSinceUpdate: number;
  }>;
  failedPRs: Array<{
    id: string;
    title: string;
    prNumber?: number;
    prUrl?: string;
  }>;
}

/**
 * Generate heartbeat evaluation prompt for Ava
 */
export function generateHeartbeatPrompt(data: HeartbeatPromptData): string {
  return `# Ava Heartbeat Check

You are Ava Loveland, Chief of Staff for Automaker. You monitor the development board to identify issues requiring immediate attention.

## Current Board State

**Total Features:** ${data.total}

**By Status:**
${Object.entries(data.byStatus)
  .map(([status, count]) => `- ${status}: ${count}`)
  .join('\n')}

**Blocked Features:** ${data.blockedCount}
**In Progress:** ${data.inProgressCount}

${data.staleFeatures.length > 0 ? `**Stale Features (${data.staleFeatures.length}):**\n${data.staleFeatures.map((f) => `- ${f.title} (${f.status}, ${f.daysSinceUpdate} days old)`).join('\n')}` : '**Stale Features:** None'}

${data.failedPRs.length > 0 ? `**PRs in Review (${data.failedPRs.length}):**\n${data.failedPRs.map((f) => `- ${f.title}${f.prNumber ? ` (#${f.prNumber})` : ''}`).join('\n')}` : '**PRs in Review:** None'}

---

**Question:** What needs immediate attention?

**Instructions:**
- If everything looks good, respond with: HEARTBEAT_OK
- If there are issues, format each alert as:

**ALERT: [severity] Alert Title**
Description of the issue and why it needs attention.
---

**Severity levels:**
- **low**: Minor issue, can wait
- **medium**: Should be addressed soon
- **high**: Needs attention today
- **critical**: Blocking progress, needs immediate action

**Examples of alerts you should raise:**

1. **Stale features** (7+ days without update):
   - ALERT: [medium] Feature stuck in progress
   - ALERT: [high] Blocked feature with no resolution

2. **Too many blocked features** (3+ blocked):
   - ALERT: [high] Multiple features blocked

3. **Too many in-progress features** (5+ in progress):
   - ALERT: [medium] Too much WIP, focus needed

4. **Failed PRs** (reviews with failed checks):
   - ALERT: [medium] PR needs fixes

5. **Empty board** (0 in-progress, 0 backlog):
   - ALERT: [low] Board needs planning

**Response Format:**
Analyze the board state and respond with either:
- HEARTBEAT_OK (if no issues)
- One or more alerts using the format above

Be concise and actionable. Focus on what truly needs attention.`;
}

/**
 * Parse Ava's heartbeat response
 */
export function parseHeartbeatResponse(response: string): {
  status: 'ok' | 'alert';
  message?: string;
  alerts?: Array<{
    severity: 'low' | 'medium' | 'high' | 'critical';
    title: string;
    description: string;
  }>;
} {
  // Check for explicit HEARTBEAT_OK marker
  if (response.includes('HEARTBEAT_OK')) {
    return {
      status: 'ok',
      message: 'All systems nominal',
    };
  }

  // Extract alerts from response
  // Format expected: **ALERT: [severity] title**\ndescription\n---
  const alerts: Array<{
    severity: 'low' | 'medium' | 'high' | 'critical';
    title: string;
    description: string;
  }> = [];

  const alertRegex =
    /\*\*ALERT:\s*\[(low|medium|high|critical)\]\s*(.+?)\*\*\s*\n([\s\S]+?)(?=\n---|$)/gi;
  let match;

  while ((match = alertRegex.exec(response)) !== null) {
    const [, severity, title, description] = match;
    alerts.push({
      severity: severity as 'low' | 'medium' | 'high' | 'critical',
      title: title.trim(),
      description: description.trim(),
    });
  }

  // If we found alerts, return them
  if (alerts.length > 0) {
    return {
      status: 'alert',
      alerts,
    };
  }

  // If response doesn't contain HEARTBEAT_OK but also no explicit alerts,
  // treat the entire response as an alert message
  if (response.trim().length > 0 && !response.includes('No immediate attention')) {
    return {
      status: 'alert',
      message: response.trim(),
      alerts: [
        {
          severity: 'medium',
          title: 'Board attention needed',
          description: response.trim(),
        },
      ],
    };
  }

  // Default: everything is OK
  return {
    status: 'ok',
    message: 'No immediate attention required',
  };
}
