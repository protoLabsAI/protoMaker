# Custom Workflows

Custom workflows let you define how the Lead Engineer pipeline processes different types of work. Each workflow controls which phases run, which processors handle each phase, agent configuration, and execution settings. Workflows are YAML files stored in `.automaker/workflows/`.

## Quick Start

Create `.automaker/workflows/audit.yml` in your project:

```yaml
name: audit
description: Read-only code audit with reporting
phases:
  - state: INTAKE
    enabled: true
  - state: PLAN
    enabled: false
  - state: EXECUTE
    enabled: true
  - state: REVIEW
    enabled: false
  - state: MERGE
    enabled: false
  - state: DEPLOY
    enabled: false
execution:
  useWorktrees: false
  gitWorkflow:
    autoCommit: false
    autoPush: false
    autoCreatePR: false
  terminalStatus: done
```

Assign it to a feature:

```bash
# Via MCP
create_feature --workflow audit --title "Security audit of auth module" ...

# Or set on an existing feature
update_feature --workflow audit --featureId <id>
```

The feature runs only INTAKE and EXECUTE, skips all git operations, and goes straight to `done`.

## Built-in Workflows

Four workflows are available without any YAML files:

| Workflow    | Phases                        | Worktrees | Git Ops       | Terminal Status |
| ----------- | ----------------------------- | --------- | ------------- | --------------- |
| `standard`  | All 6                         | Yes       | Full pipeline | `review`        |
| `read-only` | INTAKE, EXECUTE               | No        | None          | `done`          |
| `content`   | INTAKE, PLAN, EXECUTE, REVIEW | No        | No commit     | `done`          |
| `audit`     | INTAKE, EXECUTE               | No        | None          | `done`          |

**standard** is the default when no workflow is specified.

## Workflow Definition

A workflow YAML file has four sections:

### Phases

Each phase maps to a Lead Engineer state machine state. Set `enabled: false` to skip it.

```yaml
phases:
  - state: INTAKE
    enabled: true
  - state: PLAN
    enabled: true
    processor: content-execute # Use a custom processor
  - state: EXECUTE
    enabled: true
  - state: REVIEW
    enabled: true
  - state: MERGE
    enabled: false # Skip merge
  - state: DEPLOY
    enabled: false # Skip deploy
```

Available states: `INTAKE`, `PLAN`, `EXECUTE`, `REVIEW`, `MERGE`, `DEPLOY`.

The `ESCALATE` state is always available regardless of workflow configuration.

#### Custom Processors

Use the `processor` field to route a phase through a non-default processor. Built-in processor names:

| Name              | Default For | Description                                            |
| ----------------- | ----------- | ------------------------------------------------------ |
| `intake`          | INTAKE      | Classify complexity, assign persona, validate deps     |
| `plan`            | PLAN        | Generate implementation plan, antagonistic review gate |
| `execute`         | EXECUTE     | Run agent in worktree, stream output                   |
| `review`          | REVIEW      | Track PR status, CI checks, remediation                |
| `merge`           | MERGE       | Auto-merge PR when checks pass                         |
| `deploy`          | DEPLOY      | Post-merge verification, goal checking                 |
| `escalate`        | ESCALATE    | Failure classification, HITL form                      |
| `content-execute` | --          | GTM content creation via ContentFlowService            |
| `content-review`  | --          | Antagonistic content review scoring                    |

#### Inline Processor Config (config-as-code)

Instead of referencing a named processor, define behavior inline with `processorConfig`. No TypeScript needed -- the generic `ConfigurableProcessor` reads the config at runtime.

```yaml
phases:
  - state: EXECUTE
    enabled: true
    processorConfig:
      prompt: |
        Scan the codebase for TODO/FIXME/HACK comments,
        suppressed lint rules, deprecated API usage, and skipped tests.
        Output a JSON report with file, line, severity, description.
      tools: [Read, Grep, Glob, Bash]
      outputFormat: json
      maxTurns: 15
      preScripts:
        - 'npm run build:packages 2>/dev/null || true'
      postScripts:
        - "echo 'Scan complete'"
```

`processorConfig` takes precedence over the `processor` field. Available options:

| Field          | Type     | Description                                            |
| -------------- | -------- | ------------------------------------------------------ |
| `prompt`       | string   | System prompt injected into the agent                  |
| `tools`        | string[] | Tool allowlist (omit for all tools)                    |
| `model`        | string   | Model override for this phase                          |
| `outputFormat` | string   | Expected output: `markdown`, `json`, `diff`, or `text` |
| `preScripts`   | string[] | Bash commands to run before the agent                  |
| `postScripts`  | string[] | Bash commands to run after the agent                   |
| `maxTurns`     | number   | Agent turn budget                                      |
| `timeoutMs`    | number   | Phase timeout in milliseconds                          |

### Agent Configuration

Override the agent role, model, prompt, or available tools:

```yaml
agent:
  role: qa-engineer # Built-in role or agent manifest name
  model: sonnet # Model override (haiku, sonnet, opus)
  promptFile: .automaker/prompts/audit.md # Custom prompt (relative to project root)
  tools: # Tool allowlist (empty = all tools)
    - Read
    - Grep
    - Glob
```

### Execution Settings

Control worktree isolation, git behavior, and where the feature goes after completion:

```yaml
execution:
  useWorktrees: true # Create isolated git worktree?
  gitWorkflow: # Override git workflow settings
    autoCommit: true
    autoPush: true
    autoCreatePR: true
    autoMergePR: false
    prBaseBranch: dev
  outputDir: .automaker/reports # Custom output directory (optional)
  terminalStatus: done # Where feature goes after: 'done' or 'review'
```

### Match Rules

Auto-assign this workflow to features based on category or keywords:

```yaml
match:
  categories: [audit, review, analysis]
  keywords: [audit, sweep, analyze, check]
  executionMode: read-only # Match legacy executionMode field
```

Match rules are not yet used for auto-assignment -- they are reserved for future workflow auto-detection.

## Backward Compatibility

Existing fields still work and map to workflows automatically:

| Legacy Field                 | Maps To              |
| ---------------------------- | -------------------- |
| `featureType: 'content'`     | `content` workflow   |
| `executionMode: 'read-only'` | `read-only` workflow |
| No workflow set              | `standard` workflow  |

An explicit `workflow` field takes priority over legacy fields.

## Phase Skipping

When a processor returns a transition to a disabled phase, the state machine skips forward to the next enabled phase in standard order:

```
INTAKE -> PLAN -> EXECUTE -> REVIEW -> MERGE -> DEPLOY -> DONE
```

If all remaining phases are disabled, the feature transitions to `DONE`.

## Examples

### Component Review Workflow

Run an agent that reviews components but doesn't modify code:

```yaml
name: component-review
description: Review React components for accessibility and performance
phases:
  - state: INTAKE
    enabled: true
  - state: PLAN
    enabled: false
  - state: EXECUTE
    enabled: true
  - state: REVIEW
    enabled: false
  - state: MERGE
    enabled: false
  - state: DEPLOY
    enabled: false
agent:
  role: frontend-engineer
  model: sonnet
  promptFile: .automaker/prompts/component-review.md
execution:
  useWorktrees: false
  gitWorkflow:
    autoCommit: false
    autoPush: false
    autoCreatePR: false
  terminalStatus: done
```

### Full Pipeline with Custom Plan Processor

Standard code workflow but with a content-style planning phase:

```yaml
name: content-code
description: Code features that need content-style strategic planning
phases:
  - state: INTAKE
    enabled: true
  - state: PLAN
    enabled: true
    processor: content-execute
  - state: EXECUTE
    enabled: true
  - state: REVIEW
    enabled: true
  - state: MERGE
    enabled: true
  - state: DEPLOY
    enabled: true
execution:
  useWorktrees: true
  terminalStatus: review
```

### Benchmark Evaluation Workflow

Run SWE-bench or similar evaluation tasks — agent reads a repo and issue, produces a patch:

```yaml
name: swebench
description: SWE-bench evaluation — read-only agent produces a patch for a repo issue
phases:
  - state: INTAKE
    enabled: true
  - state: PLAN
    enabled: true
  - state: EXECUTE
    enabled: true
  - state: REVIEW
    enabled: false
  - state: MERGE
    enabled: false
  - state: DEPLOY
    enabled: false
agent:
  model: sonnet
execution:
  useWorktrees: false
  gitWorkflow:
    autoCommit: false
    autoPush: false
    autoCreatePR: false
  terminalStatus: done
match:
  categories: [benchmark, eval, swebench]
```

See `tools/swebench/` for the evaluation harness that uses this workflow.

## Resolution Order

When the Lead Engineer picks up a feature, it resolves the workflow in this order:

1. `feature.workflow` field (explicit assignment)
2. `feature.featureType === 'content'` maps to `content` workflow
3. `feature.executionMode === 'read-only'` maps to `read-only` workflow
4. Falls back to `standard`

Project-level YAML files (`.automaker/workflows/{name}.yml`) take priority over built-in defaults with the same name, allowing you to override built-in behavior.
