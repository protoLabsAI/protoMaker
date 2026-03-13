# Plan Completion Verification

When implementing a multi-step plan (project phases, architecture redesigns, multi-file features), run this verification checklist BEFORE committing. Half-finished work that passes CI is worse than a build failure --- it ships silently broken code.

## The Problem

CI tests verify "what exists works correctly" but NOT "what should exist actually does." A service can have 32 passing unit tests and still be completely disconnected from the runtime. This is a commission/omission asymmetry --- breaking existing code gets caught, failing to wire new code passes silently.

## Verification Checklist

### 1. Import Check (No Dead Code)

Every new file created in the plan MUST be imported by at least one non-test file. Run:

```bash
# For each new file, verify it has at least one importer
grep -r "from.*<new-file>" apps/ libs/ --include="*.ts" | grep -v ".test." | grep -v "__tests__"
```

If a new service/module file has zero non-test importers, the wiring is incomplete.

### 2. Interface Check (No Orphan Methods)

Every new public method or service added to a shared interface (like `ServiceContainer`) MUST have at least one caller outside its own file and test file. A method that exists only in definition and tests is dead code.

### 3. Integration Test Requirement

Every new service that integrates with the runtime (receives dependencies, runs on a lifecycle hook, responds to events) MUST have at least one test that verifies the integration point --- not just the service logic in isolation.

Examples:
- Service wired into auto-mode start/stop -> test that start() is called when auto-mode starts
- Service registered in ServiceContainer -> test that the container type includes it
- Event handler registered -> test that the handler fires on the expected event

### 4. Plan Step Audit

Before the final commit, review each step in the plan and check:
- [ ] All files listed in the step's file table were modified/created
- [ ] All "wire X into Y" instructions were executed (not just "remove old X")
- [ ] Removal steps (delete old code) AND addition steps (wire new code) are both complete

## Common Failure Patterns

| Pattern | Why CI Misses It | How to Catch |
|---------|-----------------|--------------|
| Service created but never instantiated | No test asserts instantiation | Import check |
| Service instantiated but deps never injected | Service guards on null deps, no-ops silently | Integration test |
| Old code removed, new code not wired | Removing imports makes things compile | Plan step audit |
| Module file created but not registered in wiring.ts | Module never runs | Import check |

## When to Apply

- Any PR implementing 3+ files from a plan
- Any PR that creates new services or modules
- Any PR that replaces one system with another (old removed + new added)

Single-file changes and bug fixes do not need this checklist.

## Related Context Rules

- **Phase Restructuring Conflicts** (`phase-restructuring-conflicts.md`): When reviewing plans that restructure files across phases, check for modify/delete conflict patterns. Applies at plan design time, before any code is written.
