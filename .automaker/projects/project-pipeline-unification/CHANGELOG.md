# Changelog: Project Pipeline Unification - Project Complete
**Generated:** 2026-03-14

## ✨ Features

- **Remove or implement manifestPaths setting** [PR#2454](https://github.com/protoLabsAI/protoMaker/pull/2454) - **Milestone:** Type Safety and Scoring
- **Add route tests for /api/agents endpoints** [PR#2455](https://github.com/protoLabsAI/protoMaker/pull/2455) - **Milestone:** Testing and Documentation
- **Add Linux-compatible file watching** [PR#2453](https://github.com/protoLabsAI/protoMaker/pull/2453) - **Milestone:** Testing and Documentation
- **Add project slug resolver service** [PR#2452](https://github.com/protoLabsAI/protoMaker/pull/2452) - **Milestone:** Centralized Project Resolution
- **Wire projectSlug auto-assignment into FeatureLoader.create** [PR#2457](https://github.com/protoLabsAI/protoMaker/pull/2457) - **Milestone:** Centralized Project Resolution
- **Add fallback timeline from feature activity** [PR#2464](https://github.com/protoLabsAI/protoMaker/pull/2464) - **Milestone:** Timeline Reliability
- **Add project timeline to project detail view** [PR#2467](https://github.com/protoLabsAI/protoMaker/pull/2467) - **Milestone:** Timeline Reliability

## 🐛 Fixes

- **Fix auto-mode scheduler race condition preventing second concurrent slot** [PR#2451](https://github.com/protoLabsAI/protoMaker/pull/2451) - **Bug Report**
- **Fix Discord bot sending empty messages to #dev channel** [PR#2463](https://github.com/protoLabsAI/protoMaker/pull/2463) - **Bug Report** (from Josh via #bug-reports 2026-03-14)

## 🔧 Improvements

- **Migrate global personas to project-level agent prompt config** [PR#2462](https://github.com/protoLabsAI/protoMaker/pull/2462) - **Context**

## 📦 Other Changes

- **Calculate confidence from match score** [PR#2450](https://github.com/protoLabsAI/protoMaker/pull/2450) - **Milestone:** Type Safety and Scoring
- **Backfill projectSlug on existing features** [PR#2459](https://github.com/protoLabsAI/protoMaker/pull/2459) - **Milestone:** Centralized Project Resolution
- **Enrich feature events with projectSlug at emission** [PR#2460](https://github.com/protoLabsAI/protoMaker/pull/2460) - **Milestone:** Event Pipeline Enrichment
- **Backfill projectSlug on existing ledger entries** [PR#2461](https://github.com/protoLabsAI/protoMaker/pull/2461) - **Milestone:** Event Pipeline Enrichment
- **Verify completion detector with projectSlug** [PR#2465](https://github.com/protoLabsAI/protoMaker/pull/2465) - **Milestone:** Timeline Reliability
- **Update docs after: Agent Manifest Hardening** [PR#2458](https://github.com/protoLabsAI/protoMaker/pull/2458) - 8 doc-relevant files changed recently.
- **Auto-complete epics when all child features are done** [PR#2466](https://github.com/protoLabsAI/protoMaker/pull/2466) - **Bug / Missing Automation**

---

## 📊 Summary

- **Total Changes:** 17
- **Features:** 7
- **Fixes:** 2
- **Improvements:** 1
- **Other:** 7
- **Total Cost:** $38.89