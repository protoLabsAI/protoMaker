# Phase 1: Implement document assembler node

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create the assembler node that merges ordered sections into a complete document. Handles: table of contents generation, internal cross-references between sections, frontmatter/metadata generation (for blog posts), code example numbering, and consistent formatting. Uses the assembler.md prompt template for LLM-assisted coherence checking (ensuring transitions between sections are smooth).

---

## Tasks

### Files to Create/Modify
- [ ] `libs/flows/src/content/nodes/assembler.ts`

### Verification
- [ ] Merges sections in outline order
- [ ] Generates table of contents for docs
- [ ] Creates frontmatter for blog posts
- [ ] Cross-references between sections resolved
- [ ] Output is valid markdown
- [ ] Langfuse tracing for assembly step

---

## Deliverables

- [ ] Code implemented and working
- [ ] Tests passing
- [ ] Documentation updated

---

## Handoff Checklist

Before marking Phase 1 complete:

- [ ] All tasks complete
- [ ] Tests passing
- [ ] Code reviewed
- [ ] PR merged to main
- [ ] Team notified

**Next**: Phase 2
