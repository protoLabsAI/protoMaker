# Project: Project Lifecycle Hub

## Goal
Complete the project lifecycle end-to-end: fix the milestoneSlug cascade bug so milestone/project completion events fire correctly, persist all project artifacts (ceremony reports, changelogs, escalations) on the project, add per-project Discord webhook routing, build a timeline API, and surface everything on a unified project page hub. TDD throughout.

## Milestones
1. Cascade Fix (TDD) - Fix the P0 milestoneSlug bug so the full feature→epic→milestone→project completion cascade fires. TDD-first: write tests proving the cascade, then fix.
2. Project Artifact Persistence - Persist ceremony reports and changelogs as structured artifacts on the project. Maintain an artifact index. Everything stored in .automaker/projects/{slug}/artifacts/.
3. Per-Project Discord Webhook - Replace hardcoded global Discord channel IDs with per-project webhook config. Fix standup flow registration.
4. Project Timeline API - Add a project-scoped timeline endpoint combining EventLedger events and project artifacts into a unified, chronologically ordered feed.
5. Project Page Hub (Frontend) - Surface the unified project data on the project page: timeline/activity feed, artifact viewer for ceremonies and changelogs, and webhook settings UI.
