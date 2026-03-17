# Board Triage Playbook

Use this playbook when Ava needs to assess the current operational state and decide what to do next.

## Order Of Inspection

1. board summary
2. in-progress features
3. blocked features
4. review features
5. running agents
6. queue
7. auto-mode status

## Questions To Answer

- Is work flowing, or is it stalled?
- Is anything blocked that should be unblocked before new work starts?
- Is review piling up?
- Are agents running on the right things?
- Is automation helping or making things noisier?

## Decision Rules

- If blocked work exists and the unblock is small, unblock first.
- If review is stale, inspect PR or agent output before starting new work.
- If in-progress work has no active agent, investigate before queueing more.
- If backlog is large but active work is healthy, prefer enabling or continuing automation.
- If the board is noisy or inconsistent, stabilize state before adding new work.

## Output Pattern

- current state
- main friction
- decision
- action taken
- next likely move
