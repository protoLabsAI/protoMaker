---
tags: [documentation]
summary: documentation implementation decisions and patterns
relevantTo: [documentation]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 378
  referenced: 93
  successfulFeatures: 93
---
<!-- domain: Documentation | Docs standards, structure, maintenance patterns -->

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

#### [Pattern] Documentation structure follows progressive disclosure: high-level flow → technical details → integration code → examples → related patterns (2026-02-14)

- **Problem solved:** Need to document complex pattern (antagonistic review with G-Eval, Constitutional AI, LangGraph) in under 800 lines while remaining accessible
- **Why this works:** Readers with different backgrounds can stop at relevant depth: product folks read Architecture section, engineers read Integration code, advanced users read Examples. Prevents cognitive overload
- **Trade-offs:** Easier: readers find relevant section quickly. Harder: some redundancy across sections to make each standalone; requires careful section ordering

### XML output format section specifies schema as first-class documented concern rather than implementation detail (2026-02-14)

- **Context:** Antagonistic review produces structured output that must integrate with downstream systems; format consistency is critical
- **Why:** Explicit schema documentation prevents format drift and makes output contracts clear to consumers. Separates 'what the system outputs' from 'how it works internally'
- **Rejected:** Documenting output format only in code comments or TypeScript types - would require readers to reverse-engineer from source code
- **Trade-offs:** Easier: consumers understand expected format without reading code. Harder: XML schema becomes part of API contract and requires careful versioning
- **Breaking if changed:** Removing schema documentation would make output format implicit, forcing consumers to guess at field presence/types and creating brittleness in integrations

### Documentation explicitly positions autonomous mode as default, HITL as optional overlay for specific use cases (legal, medical, financial, brand-sensitive) (2026-02-14)

- **Context:** Moving from mandatory HITL to autonomous-first requires clear guidance on when each mode applies
- **Why:** Sets correct mental model for users: assume autonomous works, use HITL only when justified. Reduces unnecessary overhead and speeds up common use cases
- **Rejected:** Treating modes as equally valid would lead users to always enable HITL unnecessarily
- **Trade-offs:** Gained: clearer guidance, faster adoption; Lost: requires users to actively opt-in to HITL rather than being the default
- **Breaking if changed:** If antagonistic review scoring becomes unreliable, this guidance breaks and HITL becomes necessary again


#### [Gotcha] notes-sync.md documented a CRDT hydration system (conflict resolution, deferred work) that was never fully shipped — the write path was not wired. Documentation described aspirational architecture rather than implementation reality. (2026-03-14)
- **Situation:** Feature started but abandoned mid-implementation, with documentation written for the intended design rather than the actual (disk-only) implementation.
- **Root cause:** Incomplete features leave 'ghost documentation' that describes behavior not actually implemented in code. This happens when feature design documents are written before full implementation and then the feature is shelved.
- **How to avoid:** Rewriting docs to match disk-only reality (simpler, honest) loses the design intent documentation; keeping aspirational docs creates confusion about what's actually implemented. Middle ground would be 'see RFC #X for why this approach was abandoned.'

### Archived format chosen: simple blockquote deprecation notice at top of document pointing to replacement service, no special header convention or formal deprecation structure required. (2026-03-14)
- **Context:** When services are removed entirely (AvaChannelService), their documentation files need a graceful deprecation path rather than hard deletion.
- **Why:** Blockquote notices are minimal, Git-viewable, and don't require special parsing tooling. They satisfy discoverability (someone landing on old doc sees the notice immediately) without ceremony.
- **Rejected:** Formal deprecation headers (e.g., YAML frontmatter); separate 'DEPRECATED' directory with structured metadata; deprecation bot auto-adding standardized notices; removing files entirely.
- **Trade-offs:** Simple blockquote is human-readable but not machine-parseable; formal headers would enable automation but add overhead; removal preserves git history cleanly but breaks existing links.
- **Breaking if changed:** If archived docs are deleted entirely, future developers lose the deprecation context and may re-implement removed services. If deprecation format is inconsistent, navigation and tooling that tries to parse it breaks.