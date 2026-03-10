# PRD: Flow Intelligence & Kill Criteria

## Situation
The Gate Formalization sprint shipped portfolio gates, execution gates, and authority enforcement. DORA metrics, error budget, review queue depth, and PR size checks are live. The audit surfaced four runtime gaps: no per-feature cost cap, no autonomy rate metric, error budget is advisory-only, and no WIP saturation visibility.

## Problem
A high-throughput agentic system without kill criteria becomes unsafe. Runaway agents cost money, loop indefinitely, and degrade reliability. Without autonomy rate tracking, improvement is unmeasurable. Without error budget enforcement, the budget is advisory only. Without WIP saturation visibility, queue overload is invisible.

## Approach
Four targeted additions: (1) cost cap kill switch via maxCostUsdPerFeature in WorkflowSettings, (2) autonomy rate metric in MetricsCollectionService, (3) error budget auto-freeze that pauses auto-mode, (4) WIP saturation index in board summary and metrics API.

## Results
Cost cap prevents runaway spend. Autonomy rate is measurable. Error budget freeze enforces reliability tradeoffs automatically. WIP saturation is visible in dashboards. All additions have unit tests and are behind settings toggles.

## Constraints
No changes to existing gate logic or DORA service,Cost cap is opt-in via WorkflowSettings, default off,Error budget freeze is reversible - budget recovery auto-resumes,Each phase independently deployable
