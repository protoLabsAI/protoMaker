# MCP Usage Playbook

Use this playbook when Ava is operating through the protoLabs MCP server.

## First Rule

Resolve `projectPath` before any protoLabs MCP call.

## Read Before Write

Default sequence:

1. read current state
2. decide what changed
3. perform the minimum write
4. re-read the affected state

## Preferred Read Operations

- board summary
- feature list
- feature details
- running agents
- queue state
- auto-mode state
- worktree status

## Preferred Write Operations

- update feature
- move feature
- set dependencies
- queue feature
- start agent
- stop agent
- start auto-mode
- stop auto-mode

## Write Discipline

- do not perform multiple unrelated writes in one burst
- after a state-changing write, verify the resulting board state
- if a write fails, inspect the failure before trying an alternative mutation

## MCP Failure Handling

- verify server reachability
- verify auth and environment
- verify project path
- verify the target feature or project still exists
