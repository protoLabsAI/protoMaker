# PRD: Project Lifecycle Hub

## Situation
The project lifecycle pipeline has full event infrastructure: CompletionDetectorService cascades feature→epic→milestone→project, CeremonyService runs retros via LangGraph flows, ChangelogService generates changelogs, EventLedgerService records all events. Ceremony results post to Discord. The project page shows board features but nothing else.

## Problem
Four critical gaps block the pipeline from working end-to-end: (1) P0 bug — createProjectFeatures() does not set milestoneSlug/phaseSlug on features, so the CompletionDetectorService milestone cascade never fires — every project stops at epic completion. (2) Ceremony reports and changelogs are generated but discarded — not stored on the project. Discord is the only outlet, with hardcoded global channel IDs. (3) No per-project Discord webhook config — ceremonies can't be routed to project-specific channels. (4) No unified project page — there is no way to see ceremonies, escalations, changelogs, or a timeline from the project view. Each artifact is siloed.

## Approach
Milestone 1: Fix cascade with TDD — write integration tests proving the full feature→epic→milestone→project cascade, then fix milestoneSlug/phaseSlug. Milestone 2: Persist artifacts — store ceremony reports and changelogs as project artifacts, maintain an artifact index. Milestone 3: Per-project Discord webhook — add webhookUrl to project settings, route ceremonies through it, fix standup flow registration. Milestone 4: Project timeline API — EventLedger project-scoped query and artifact aggregation endpoint. Milestone 5: Project page hub — timeline feed, artifact viewer, webhook settings UI.

## Results
The full project lifecycle fires end-to-end without manual intervention. Every project artifact (ceremony reports, changelogs, escalations, feature summaries) is stored on the project and queryable. The project page shows a complete, cross-linked history from first feature to archive. Discord is an outlet, not the only record.

## Constraints
TDD: every phase must write failing tests before implementation — tests prove the contract, implementation makes them pass,No breaking changes to existing EventLedger, LedgerService, or ceremony-service public interfaces,Discord remains supported as an outlet but must not be the only persistence mechanism,Per-project Discord webhook config stored in .automaker/settings.json under project gitWorkflow or ceremonySettings,Frontend components follow existing atoms/molecules/organisms pattern in @protolabsai/ui
