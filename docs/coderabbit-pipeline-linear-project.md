# CodeRabbit Integration Pipeline - Linear Project Specification

## Project Overview

**Name**: CodeRabbit Integration Pipeline

**Status**: Planned (Backlog)

**Target Team**: Backend / AI-ML (Infrastructure work with agent integration)

**Timeline**: Post-App Overhaul

**Goal**: Build a comprehensive pipeline that transforms CodeRabbit feedback into actionable Discord notifications, Linear issues, and agent self-healing workflows.

## Project Description

A multi-phase initiative to deeply integrate CodeRabbit code review feedback into Automaker's autonomous development workflow. This project builds on existing infrastructure (CodeRabbitParserService, FeatureBranchLinkingService, GitHub webhook handlers) to create a closed-loop system where:

1. CodeRabbit reviews are detected in real-time
2. Critical findings are surfaced to the team via Discord
3. Issues are automatically created in Linear with priority mapping
4. Auto-mode agents consume feedback and self-heal
5. CodeRabbit is configured for optimal pre-merge quality gates

**Existing Infrastructure**:

- `CodeRabbitParserService` - Parses CodeRabbit review comments
- `FeatureBranchLinkingService` - Links PRs to features
- `/api/github/process-coderabbit-feedback` - Endpoint for processing feedback
- `/api/webhooks/github` - GitHub webhook handler
- CodeRabbit event types defined in `@automaker/types`

**Key Constraints**:

- CodeRabbit has NO outbound webhooks - all integration flows through GitHub webhook events (filter for `coderabbitai[bot]`)
- Programmatic control via PR comments (`@coderabbitai review`, `@coderabbitai resolve`, etc.)
- Community MCP server available: `bradthebeeble/coderabbitai-mcp`
- **BLOCKED** until app overhaul is complete

## Architecture Context

### Current State

- GitHub webhooks already handled via `/api/webhooks/github`
- Event types defined in `libs/types/src/webhook.ts`
- Parser service ready for enhancement
- Agent feedback mechanism exists in auto-mode

### Integration Points

- **GitHub Webhooks**: `issue_comment`, `pull_request_review`, `pull_request_review_comment`
- **Discord**: MCP server available (`saseq/discord-mcp`)
- **Linear**: MCP server available (`@tacticlaunch/mcp-linear`)
- **Agent SDK**: Claude Agent SDK for feedback consumption

## Phases

### Phase 1: Real-time CodeRabbit Detection

**Priority**: High (Foundational)

**Description**: Enhance GitHub webhook handling to reliably detect and parse CodeRabbit reviews in real-time.

**Tasks**:

1. Add `issue_comment` webhook handling for CodeRabbit bot comments
2. Add `pull_request_review` webhook handling for CodeRabbit reviews
3. Extend `CodeRabbitParserService` to handle all CodeRabbit comment formats
4. Add event filtering to identify `coderabbitai[bot]` as author
5. Create integration tests for webhook → parser pipeline

**Files to Modify**:

- `apps/server/src/routes/webhooks/routes/github.ts`
- `apps/server/src/services/coderabbit-parser-service.ts`
- `libs/types/src/webhook.ts` (if new event types needed)

**Acceptance Criteria**:

- [ ] `issue_comment` events from CodeRabbit are captured
- [ ] `pull_request_review` events from CodeRabbit are captured
- [ ] Parser extracts severity, file, line, message for all comment types
- [ ] Integration tests verify end-to-end detection
- [ ] Logs confirm real-time processing (<5s latency)

**Dependencies**: None (foundational)

---

### Phase 2: Discord Notifications

**Priority**: Medium (Immediate Value)

**Description**: Forward parsed CodeRabbit reviews to Discord channels with severity-coded embeds for team awareness.

**Tasks**:

1. Integrate `saseq/discord-mcp` server into Automaker MCP config
2. Create `DiscordNotificationService` using Discord MCP tools
3. Map CodeRabbit severity to Discord embed colors (critical=red, warning=yellow, info=blue)
4. Route notifications to `#pr-notifications` and `#code-review` channels
5. Add rich embeds with PR link, file, line, severity, message
6. Add configuration for channel routing and severity thresholds

**Files to Create**:

- `apps/server/src/services/discord-notification-service.ts`

**Files to Modify**:

- `apps/server/src/routes/github/routes/process-coderabbit-feedback.ts` (call Discord service)
- `.mcp.json` (add Discord MCP server config)
- `apps/server/src/config/notifications.ts` (channel routing config)

**Acceptance Criteria**:

- [ ] Discord MCP server connected and working
- [ ] Critical findings appear in Discord within 10s of CodeRabbit review
- [ ] Embeds include severity color coding
- [ ] Embeds link to PR, file, line number
- [ ] Configuration allows channel + severity threshold customization
- [ ] Manual test: trigger CodeRabbit review, verify Discord notification

**Dependencies**: Phase 1 (needs reliable detection)

---

### Phase 3: Linear Issue Auto-Creation

**Priority**: Medium

**Description**: Automatically create Linear issues for critical CodeRabbit findings with priority mapping and feature linking.

**Tasks**:

1. Integrate `@tacticlaunch/mcp-linear` into Automaker MCP config
2. Create `LinearIntegrationService` using Linear MCP tools
3. Map CodeRabbit severity to Linear priority (critical=urgent, high=high, medium=medium, low=low)
4. Link Linear issue to Automaker feature (if PR is linked to feature)
5. Add Linear issue template with CodeRabbit context (PR link, file, line, message)
6. Add deduplication logic (don't create duplicate issues for same finding)
7. Add configuration for severity threshold (only create issues for high+ severity)

**Files to Create**:

- `apps/server/src/services/linear-integration-service.ts`

**Files to Modify**:

- `apps/server/src/routes/github/routes/process-coderabbit-feedback.ts` (call Linear service)
- `.mcp.json` (ensure Linear MCP server configured)
- `apps/server/src/config/integrations.ts` (severity thresholds, team mapping)

**Acceptance Criteria**:

- [ ] Linear MCP server connected and working
- [ ] Critical CodeRabbit findings create Linear issues automatically
- [ ] Linear issues have correct priority based on severity mapping
- [ ] Issues are linked to Automaker feature (if available)
- [ ] Issue description includes PR link, file, line, message, severity
- [ ] Deduplication prevents duplicate issues
- [ ] Configuration allows severity threshold customization
- [ ] Manual test: trigger critical CodeRabbit finding, verify Linear issue created

**Dependencies**: Phase 1 (needs reliable detection)

---

### Phase 4: Agent Feedback Loop (Self-Healing)

**Priority**: High (Key Differentiator)

**Description**: Enable auto-mode agents to consume CodeRabbit feedback and self-heal by iterating on PRs until reviews pass.

**Tasks**:

1. Extend `AutoModeService` to consume CodeRabbit feedback events
2. Add agent prompt enhancement: include CodeRabbit feedback in retry context
3. Implement feedback → agent → commit → push → review cycle
4. Add termination conditions (max retries, feedback resolved, manual intervention)
5. Track feedback resolution metrics (iterations to resolution, success rate)
6. Add agent session logging for CodeRabbit feedback handling
7. Create `/feedback` MCP command to manually trigger agent feedback consumption

**Files to Modify**:

- `apps/server/src/services/auto-mode-service.ts` (consume feedback events)
- `apps/server/src/routes/auto-mode/routes/resume-with-feedback.ts` (enhance feedback handling)
- `libs/prompts/src/agent-prompts.ts` (add CodeRabbit feedback to agent context)
- `apps/server/src/services/completion-verifier.ts` (add CodeRabbit verification step)

**Files to Create**:

- `apps/server/src/services/agent-feedback-handler.ts`
- `packages/mcp-server/plugins/automaker/commands/feedback.md`

**Acceptance Criteria**:

- [ ] Agent receives CodeRabbit feedback in retry context
- [ ] Agent iterates on code based on feedback
- [ ] Agent pushes updated code, triggering new CodeRabbit review
- [ ] Cycle terminates on success or max retries (configurable, default 3)
- [ ] Metrics tracked: iterations, resolution time, success rate
- [ ] Session logs include CodeRabbit feedback and agent response
- [ ] `/feedback` command allows manual feedback injection
- [ ] Integration test: agent fixes issue flagged by CodeRabbit

**Dependencies**: Phase 1 (needs detection), Phase 3 helps but not required

---

### Phase 5: CodeRabbit Configuration

**Priority**: Low (Polish)

**Description**: Create optimal `.coderabbit.yaml` configuration with pre-merge checks, custom rules, and team-specific settings.

**Tasks**:

1. Research CodeRabbit YAML schema and best practices
2. Create `.coderabbit.yaml` template with Automaker-specific rules
3. Add pre-merge checks for critical issues (block merge if critical findings)
4. Configure review scope (files to include/exclude)
5. Add custom rules for Automaker patterns (monorepo structure, imports, etc.)
6. Document configuration in `docs/coderabbit-config.md`
7. Test configuration on sample PRs

**Files to Create**:

- `.coderabbit.yaml` (root of repo)
- `docs/coderabbit-config.md`

**Acceptance Criteria**:

- [ ] `.coderabbit.yaml` exists and is valid
- [ ] Pre-merge checks block merge on critical findings
- [ ] Review scope excludes irrelevant files (dist, node_modules, etc.)
- [ ] Custom rules enforce Automaker import conventions
- [ ] Custom rules enforce monorepo structure (@automaker/\* imports)
- [ ] Documentation explains all configuration options
- [ ] Manual test: PR with critical issue is blocked from merge

**Dependencies**: Phases 1-4 complete (validates full pipeline)

---

## Success Metrics

- **Detection Latency**: <5s from CodeRabbit review to webhook processing
- **Notification Latency**: <10s from detection to Discord notification
- **Issue Creation Rate**: >90% of critical findings create Linear issues
- **Agent Resolution Rate**: >70% of agent retries resolve CodeRabbit feedback
- **False Positive Rate**: <10% of auto-created Linear issues are invalid
- **Team Satisfaction**: Qualitative feedback from team (post-rollout survey)

## Rollout Plan

1. **Phase 1+2**: Deploy detection + Discord (low risk, high visibility)
2. **Phase 3**: Deploy Linear integration (monitor for false positives, tune thresholds)
3. **Phase 4**: Enable agent feedback loop for 1-2 features (pilot), expand if successful
4. **Phase 5**: Deploy `.coderabbit.yaml` after team review

## Risks & Mitigations

| Risk                                     | Impact | Mitigation                                                          |
| ---------------------------------------- | ------ | ------------------------------------------------------------------- |
| CodeRabbit rate limits                   | Medium | Implement exponential backoff, cache parsed reviews                 |
| Discord spam (too many notifications)    | Medium | Severity thresholds, channel routing, digest mode                   |
| Linear issue duplication                 | Medium | Robust deduplication logic, hash findings                           |
| Agent infinite loop (feedback not fixed) | High   | Max retry limit, manual intervention trigger, timeout               |
| GitHub webhook delivery failures         | Medium | Implement retry queue, monitor webhook delivery metrics             |
| CodeRabbit format changes break parser   | Medium | Version parser logic, add schema validation, monitor parse failures |

## Related Files

- **Webhook Handling**: `apps/server/src/routes/webhooks/routes/github.ts`
- **Parser Service**: `apps/server/src/services/coderabbit-parser-service.ts`
- **Auto-mode Service**: `apps/server/src/services/auto-mode-service.ts`
- **Feedback Endpoint**: `apps/server/src/routes/github/routes/process-coderabbit-feedback.ts`
- **Types**: `libs/types/src/webhook.ts`

## MCP Servers Required

- **Discord**: `saseq/discord-mcp` (already configured)
- **Linear**: `@tacticlaunch/mcp-linear` (already configured)
- **CodeRabbit** (optional): `bradthebeeble/coderabbitai-mcp` (for advanced control)

## Team Notes

- This is a **post-app-overhaul** initiative - do not start until current work is complete
- Requires coordination with team for Discord channel setup and Linear project setup
- Consider assigning phases to different team members based on expertise (backend, agent work, config)
- Phase 4 (agent feedback loop) is the key differentiator - prioritize this for demos

## Next Steps (After Overhaul)

1. Create this project in Linear
2. Create 5 issues (one per phase) with dependencies
3. Schedule team kickoff meeting to review plan
4. Assign phases to team members
5. Set up Discord channels (`#pr-notifications`, `#code-review`)
6. Begin Phase 1 work
