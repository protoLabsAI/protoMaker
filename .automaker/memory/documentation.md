---
tags: [documentation]
summary: documentation implementation decisions and patterns
relevantTo: [documentation]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 3
  referenced: 1
  successfulFeatures: 1
---
# documentation

#### [Pattern] API reference uses method signatures with actual TypeScript types rather than prose descriptions (2026-02-13)
- **Problem solved:** Documentation needs to be IDE-usable and reduce need for source-diving
- **Why this works:** TypeScript developers expect to read signatures and infer behavior. Prose descriptions are slower and prone to drift from actual types.
- **Trade-offs:** More technical but more precise. Requires keeping types in sync with actual implementation.

### Separate documentation files for setup.md and troubleshooting.md instead of single README (2026-02-13)
- **Context:** README covers quick start and API concepts, but setup and troubleshooting are lengthy topics
- **Why:** README becomes unreadable if it includes environment variable setup, self-hosted deployment options, and 7+ troubleshooting scenarios. Separate docs allow developers to jump directly to relevant section.
- **Rejected:** Single README would be 200+ lines and hard to navigate. Inline troubleshooting in examples adds noise.
- **Trade-offs:** More files to maintain (clearer organization, more scattered information), better UX for developers looking up specific issues
- **Breaking if changed:** If files are merged back into README, discoverability drops and developers won't know troubleshooting solutions exist until they search.