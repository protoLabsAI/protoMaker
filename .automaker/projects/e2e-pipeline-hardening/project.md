# Project: E2E Pipeline Hardening

## Goal
Fix the 3 known durability and enforcement gaps in the idea-to-production pipeline: completion event dedup loses state on restart causing double-ceremonies, ceremony dedup loses state on restart causing double-retros, and no CI enforcement preventing arbitrary branches from targeting staging.

## Milestones
1. CompletionDetector Durability - Persist epic/milestone/project completion dedup state to disk so server restarts do not re-fire completion events and ceremonies.
2. Ceremony Dedup Durability - Persist CeremonyService.processedProjects to disk so server restarts do not cause duplicate retros.
3. Staging Branch Protection - Add a GitHub Actions workflow enforcing that PRs targeting staging must originate from dev or a promote/* branch.
