---
tags: [documentation]
summary: documentation implementation decisions and patterns
relevantTo: [documentation]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 464
  referenced: 152
  successfulFeatures: 152
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

### Documentation is structured in three pages that mirror code layers: index.md (what exists + all 4 kit types), architecture.md (how scaffold flow works), add-a-starter.md (how to extend). Each page has a specific concern and audience. (2026-03-15)

- **Context:** Creating architecture.md and add-a-starter.md revealed that the original index.md was incomplete — it documented only docs and portfolio kits, missing browser extension and general kits. Documentation served as a completeness check on the system.
- **Why:** Code architecture has three layers: UI template registry, server scaffold route, and @protolabsai/templates package. Documentation structure follows this split. Each layer gets explained at appropriate depth for its audience (users, developers, contributors).
- **Rejected:** A single comprehensive page would have higher coupling — changes to one layer would require updating the whole page. Separate pages by concern allow independent evolution.
- **Trade-offs:** Multiple smaller pages (modular, easier to update independently, clearer audience separation) vs fewer larger pages (complete picture in one place, less navigation). Cross-linking between pages mitigates navigation friction.
- **Breaking if changed:** If add-a-starter.md is removed, contributors won't have guidance on registration paths and will likely make incorrect decisions (e.g., trying to scaffold a clone kit or vice versa). Architecture.md removal breaks understanding of the internal flow. The modular structure means each page is essential to different stakeholders.

#### [Pattern] Bilingual cross-linking strategy: inline docs links throughout sections PLUS centralized documentation table at end (2026-03-15)

- **Problem solved:** Starter template README needs to serve two audiences: sequential learners (who discover inline links while reading a section) and reference-seeking users (who scan the full docs inventory)
- **Why this works:** Inline links provide just-in-time context; centralized table prevents documentation discoverability gaps where users don't realize features exist
- **Trade-offs:** Makes README slightly longer, but dramatically improves user onboarding by meeting both learning styles

#### [Pattern] Concrete example-driven feature discovery: 'What can I build?' section with six real-world project types instead of abstract feature list (2026-03-15)

- **Problem solved:** Starter template users need to understand what's possible, but abstract feature lists (e.g., 'LangGraph support', 'MCP integration') don't translate to mental models
- **Why this works:** Concrete use cases (customer support bot, code review agent, research assistant) trigger pattern-matching in users' heads: 'Oh, I could build X'
- **Trade-offs:** Makes README longer but converts passive feature scanning into active 'I could build that' moments

#### [Pattern] Turnkey copy-paste configuration snippets for multiple integration points (Claude Code, Claude Desktop, Docker, environment setup) (2026-03-15)

- **Problem solved:** Integration friction is high when users must translate generic instructions to their specific tools/environments
- **Why this works:** Exact, copy-paste examples remove translation burden — users can ctrl-c/ctrl-v instead of interpreting pseudocode
- **Trade-offs:** More verbose documentation but dramatically reduces setup friction and support questions
