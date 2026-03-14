# PR Remediation Loop

The PR remediation loop automatically handles review feedback on pull requests, enabling autonomous fix cycles without manual intervention.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Feedback Detection                        │
│  ┌──────────────┐              ┌──────────────┐            │
│  │   Webhook    │              │   Polling    │            │
│  │  (immediate) │              │  (1 min)     │            │
│  └──────┬───────┘              └───────┬──────┘            │
│         │                              │                    │
│         └──────────────┬───────────────┘                    │
└────────────────────────┼─────────────────────────────────────┘
                         │
                         ▼
         ┌───────────────────────────┐
         │   Triage Feedback         │
         │  - Fetch review threads   │
         │  - Parse severity/category│
         │  - Separate human/bot     │
         └───────────┬───────────────┘
                     │
                     ▼
         ┌───────────────────────────┐
         │  Agent Evaluation         │
         │  - Present feedback items │
         │  - Agent accepts/denies   │
         │  - Track decisions        │
         └───────────┬───────────────┘
                     │
                     ▼
         ┌───────────────────────────┐
         │  Thread Resolution        │
         │  - Resolve accepted items │
         │  - Update via GraphQL     │
         │  - Track outcomes         │
         └───────────┬───────────────┘
                     │
                     ▼
         ┌───────────────────────────┐
         │   CI Check Monitoring     │
         │  - Poll CI status         │
         │  - Detect failures        │
         │  - Wait for completion    │
         └───────────┬───────────────┘
                     │
                     ▼
         ┌───────────────────────────┐
         │  Iteration Budget Check   │
         │  - Current vs max         │
         │  - Escalate if exceeded   │
         │  - Continue if under      │
         └───────────┬───────────────┘
                     │
                     ▼
              ┌──────────┐
              │   Done   │
              └──────────┘
```

## Flow Details

### 1. Feedback Detection

The service detects PR review feedback via two mechanisms:

#### Webhook (Immediate)

- GitHub webhook fires on `pull_request_review` submission
- Payload includes: PR number, reviewer, review state, branch name
- Triggers immediate processing (no polling delay)
- Deduplicates with polling to prevent double-processing

#### Polling (Fallback)

- Runs every 60 seconds (configurable via `POLL_INTERVAL_MS`)
- Checks all tracked PRs via `gh pr view --json reviewDecision,reviews,comments`
- Skips PRs recently processed via webhook (within 2 minutes)
- Updates `prLastPolledAt` timestamp in feature.json

**Structured Logging:**

```typescript
logger.info('Feedback detected via webhook', {
  featureId,
  prNumber,
  iteration,
  detectionMethod: 'webhook',
  reviewState: 'CHANGES_REQUESTED',
  reviewer: 'josh',
});
```

### 2. Triage Feedback

Parse and classify review feedback:

- **Human Reviews**: Changes requested, comments, approval status
- **Bot Reviews (CodeRabbit)**: Structured comments with severity/category
- **Severity Classification**:
  - `critical`: 🚨 Must fix (security, breaking changes)
  - `warning`: ⚠️ Should fix (bugs, performance issues)
  - `suggestion`: 💡 Nice to have (style, refactoring)
  - `info`: ℹ️ FYI (documentation, explanations)

**Structured Logging:**

```typescript
logger.info('Triage result: Review threads fetched', {
  featureId,
  prNumber,
  iteration,
  threadCount: 12,
  humanThreadCount: 3,
  botThreadCount: 9,
  severityDistribution: {
    critical: 2,
    warning: 5,
    suggestion: 4,
    info: 1,
  },
});
```

### 3. Agent Evaluation

The dev agent evaluates each feedback item and decides whether to accept or deny:

**Agent Decision Format:**

```
Accept #1 - Security issue must be fixed
Accept #3 - Performance improvement is valid
Deny #2 - False positive, logic is correct
Deny #4 - Style preference, not blocking
```

Decisions are tracked in `feature.threadFeedback`:

```typescript
{
  threadId: "PR_kwDOAbc123_reviewThread456",
  decision: "accepted",
  reasoning: "Security issue must be fixed",
  timestamp: "2025-01-15T10:30:00Z"
}
```

**Structured Logging:**

```typescript
logger.info('Agent evaluation summary', {
  featureId,
  prNumber,
  iteration,
  acceptedCount: 8,
  deniedCount: 4,
  totalThreads: 12,
});
```

### 4. Thread Resolution

Resolve accepted threads via GitHub GraphQL API:

```graphql
mutation {
  resolveReviewThread(input: { threadId: "PR_kwDOAbc123_reviewThread456" }) {
    thread {
      id
      isResolved
    }
  }
}
```

**Structured Logging:**

```typescript
logger.info('Thread resolution complete', {
  featureId,
  prNumber,
  iteration,
  resolvedCount: 7,
  failedCount: 1,
  errors: ['GraphQL error: thread already resolved'],
});
```

### 5. CI Check Monitoring

Monitor CI checks after pushing fixes:

- Poll `gh pr checks` every 30 seconds
- Track pending/passing/failing checks
- Wait for all checks to complete
- Log which checks pass/fail

**Structured Logging:**

```typescript
logger.info('CI check monitoring started', {
  featureId,
  prNumber,
  iteration,
  checks: ['build', 'test', 'lint'],
  status: 'pending',
});

logger.info('CI checks complete', {
  featureId,
  prNumber,
  iteration,
  passed: ['build', 'test'],
  failed: ['lint'],
  duration: 120000, // ms
});
```

### 6. Iteration Budget

Track remediation cycles to prevent infinite loops:

- `MAX_PR_ITERATIONS = 2` (configurable)
- Each feedback cycle increments `prIterationCount`
- If exceeded, escalate to authority system (CTO approval)
- Feature marked as `blocked` with error message

**Structured Logging:**

```typescript
logger.warn('Iteration budget exhausted, escalating', {
  featureId,
  prNumber,
  iteration: 3,
  maxIterations: 2,
  status: 'escalated',
});
```

## Configuration

### Environment Variables

| Variable                       | Default | Description                                  |
| ------------------------------ | ------- | -------------------------------------------- |
| `POLL_INTERVAL_MS`             | `60000` | How often to poll GitHub for PR reviews (ms) |
| `MAX_PR_ITERATIONS`            | `2`     | Max review cycles before escalating          |
| `MAX_TOTAL_REMEDIATION_CYCLES` | `5`     | Total remediation attempts (feedback + CI)   |

### Feature-Level Settings

Per-feature overrides in `feature.json`:

```typescript
{
  prIterationCount: 1,              // Current iteration
  prTrackedSince: "2025-01-15T...", // When tracking started
  prLastPolledAt: "2025-01-15T...", // Last poll timestamp
  remediationHistory: [...]         // Full audit trail
}
```

## Event Flow

### Events Emitted

| Event                         | Payload                                                          | Description                    |
| ----------------------------- | ---------------------------------------------------------------- | ------------------------------ |
| `pr:feedback-received`        | `{ featureId, prNumber, type, iterationCount, detectionMethod }` | Review feedback detected       |
| `pr:changes-requested`        | `{ featureId, prNumber, feedback, reviewers, iterationCount }`   | Changes requested by reviewers |
| `pr:approved`                 | `{ featureId, prNumber, approvers }`                             | PR approved                    |
| `authority:awaiting-approval` | `{ proposal, featureTitle, blockerType }`                        | Escalation to CTO              |
| `pr:agent-restart-failed`     | `{ featureId, prNumber, error }`                                 | Agent restart failed           |

### Events Subscribed

| Event                                                      | Handler                 | Description                     |
| ---------------------------------------------------------- | ----------------------- | ------------------------------- |
| `auto-mode:event` (type: `auto_mode_git_workflow`)         | `trackPR()`             | Start tracking newly created PR |
| `feature:pr-merged`                                        | `trackedPRs.delete()`   | Stop tracking merged PR         |
| `webhook:github:pull_request` (action: `review_submitted`) | `handleWebhookReview()` | Process webhook review          |

## Debugging

### Check Service Status

```bash
# View tracked PRs
curl http://localhost:3008/api/pr-feedback/status

# Check feature PR metadata
cat .automaker/features/{featureId}/feature.json | jq '{
  prNumber,
  prIterationCount,
  prTrackedSince,
  prLastPolledAt,
  remediationHistory
}'
```

### Logs to Look For

**Feedback Detection:**

```
[PRFeedbackRemediation] Feedback detected via webhook { featureId, prNumber, iteration, ... }
[PRFeedbackRemediation] Triage result: Review threads fetched { threadCount, severityDistribution, ... }
```

**Agent Remediation:**

```
[PRFeedbackRemediation] Starting agent remediation cycle { featureId, prNumber, iteration, ... }
[PRFeedbackRemediation] Agent evaluation summary { acceptedCount, deniedCount, ... }
[PRFeedbackRemediation] Thread resolution complete { resolvedCount, failedCount, ... }
```

**CI Monitoring:**

```
[PRFeedbackRemediation] CI check monitoring started { checks, status, ... }
[PRFeedbackRemediation] CI checks complete { passed, failed, duration, ... }
```

**Iteration Budget:**

```
[PRFeedbackRemediation] Iteration budget exhausted, escalating { iteration, maxIterations, ... }
```

### Common Issues

#### Issue: Webhook not triggering

**Symptoms:**

- Feedback only detected via polling (1 minute delay)
- No "Feedback detected via webhook" logs

**Solutions:**

1. Check GitHub webhook configuration: Settings → Webhooks
2. Verify webhook URL points to your server: `https://your-domain/webhook/github`
3. Check webhook secret matches `GITHUB_WEBHOOK_SECRET` env var
4. Review webhook delivery logs on GitHub for errors

#### Issue: Infinite remediation loop

**Symptoms:**

- Feature stuck in `in_progress` status
- `prIterationCount` keeps increasing
- No escalation to CTO

**Solutions:**

1. Check `MAX_PR_ITERATIONS` setting (default: 2)
2. Review feature's `remediationHistory` for repeated failures
3. Check if agent is incorrectly accepting feedback that introduces new issues
4. Verify authority system is working for escalation

#### Issue: Thread resolution fails

**Symptoms:**

- Threads remain unresolved on GitHub despite agent acceptance
- "GraphQL error" in thread resolution logs

**Solutions:**

1. Check GitHub API token has `repo` scope
2. Verify thread IDs are valid (format: `PR_kwDOAbc123_reviewThread456`)
3. Check if threads were already resolved manually
4. Review GraphQL error messages in logs

#### Issue: Agent not restarting after feedback

**Symptoms:**

- Feedback detected but feature remains in `review` status
- No "Agent remediation started" log

**Solutions:**

1. Verify `LeadEngineerService` is wired to `PRFeedbackService` (via `wiring.ts`)
2. Check if agent capacity is full (max concurrent agents reached)
3. Review feature status - must be `review` for remediation to trigger
4. Check Lead Engineer REVIEW phase logs for errors

## Antagonistic Review System

The remediation loop uses a tool-based evaluation system where the agent explicitly accepts or denies each feedback item:

### Agent Tools

```typescript
// Agent receives these tools:
{
  name: "accept_thread",
  description: "Accept a review thread and implement the suggested fix",
  input_schema: {
    threadId: string,
    reasoning: string
  }
}

{
  name: "deny_thread",
  description: "Deny a review thread with justification",
  input_schema: {
    threadId: string,
    reasoning: string
  }
}
```

### Decision Tracking

All decisions are tracked in `feature.threadFeedback`:

```typescript
interface ReviewThreadFeedback {
  threadId: string;
  severity: 'critical' | 'warning' | 'suggestion' | 'info';
  category?: string;
  message: string;
  location?: { path: string; line?: number };
  suggestedFix?: string;
  isBot: boolean;
  decision?: 'accepted' | 'denied' | 'pending';
  reasoning?: string;
  timestamp?: string;
}
```

This creates an audit trail of:

- What feedback was received
- What the agent decided
- Why the agent made that decision
- When the decision was made

## Edge Cases

### Concurrent Feedback

**Scenario:** Multiple reviewers submit feedback simultaneously

**Behavior:**

- First webhook triggers processing
- Subsequent webhooks deduplicated within 2 minutes
- Polling skipped if recently processed via webhook
- All feedback from concurrent reviews included in single cycle

### Server Restart

**Scenario:** Server restarts during active remediation

**Behavior:**

- Tracked PRs restored from feature.json (`prTrackedSince`, `prLastPolledAt`)
- In-flight agent executions lost (Claude Agent SDK limitation)
- Polling resumes on next cycle
- Feature status preserved in database

**Recovery:**

```typescript
// On server startup, for each project:
await prFeedbackService.restoreTrackedPRsForProject(projectPath);
```

### Budget Exhaustion

**Scenario:** Feature hits `MAX_PR_ITERATIONS`

**Behavior:**

1. Feature marked as `blocked`
2. `authority:awaiting-approval` event emitted
3. CTO notified via Discord (if configured)
4. Agent execution stopped
5. Feature waits for human approval to continue

**Manual Override:**

```bash
# Reset iteration count and unblock
curl -X POST http://localhost:3008/api/features/update \
  -H "Content-Type: application/json" \
  -d '{
    "projectPath": "/path/to/project",
    "featureId": "feature-123",
    "updates": {
      "status": "backlog",
      "workItemState": "in_progress",
      "prIterationCount": 0,
      "error": null
    }
  }'
```

## Audit Trail

Every remediation cycle appends to `feature.remediationHistory`:

```typescript
{
  id: "remed-1737888000000-abc123",
  iteration: 2,
  cycleType: "feedback", // or "ci_failure"
  startedAt: "2025-01-26T10:00:00Z",
  completedAt: "2025-01-26T10:15:00Z",
  threadCount: 12,
  acceptedCount: 8,
  deniedCount: 4,
  ciChecksFixed: [],
  agentModel: "claude-sonnet-4-5-20250929",
  costUsd: 0.0042,
  success: true
}
```

This provides:

- Complete history of all remediation attempts
- Per-cycle timing and cost tracking
- Thread acceptance/denial statistics
- CI check outcomes
- Success/failure status

## Performance Considerations

### Polling Overhead

- **Default:** 60s interval for all tracked PRs
- **Optimization:** Skip PRs polled recently via webhook
- **Tuning:** Increase `POLL_INTERVAL_MS` for high PR volume

### GraphQL Rate Limits

- **Limit:** 5,000 points/hour (GitHub API)
- **Cost:** ~1 point per thread resolution
- **Mitigation:** Batch thread resolutions when possible

### Agent Costs

- **Per Iteration:** $0.001 - $0.01 (varies by model/complexity)
- **Budget:** Track via `remediationHistory[].costUsd`
- **Escalation:** Auto-escalate to opus after 2 failures

## Related Documentation

- [Engine Architecture](../archived/engine-architecture.md) - Lead Engineer state machine
- [Authority System](../authority/index.md) - Escalation and approval flow
- [Feature Status System](./feature-status-system.md) - Status transitions
