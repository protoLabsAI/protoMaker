# Phase 1: Define content output schemas

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create Zod schemas for all content output types: BlogPost (title, slug, frontmatter, sections, metadata), TechDoc (title, sections, code examples, API references), TrainingExample (input, output, metadata, tags), and HFDatasetRow (messages array in chat format). Include ContentType discriminated union. Add to @automaker/flows exports.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/flows/src/content/types.ts`
- [ ] `libs/flows/src/index.ts`

### Verification
- [ ] All content schemas validate with Zod
- [ ] BlogPost schema includes frontmatter, sections array, SEO metadata
- [ ] TrainingExample schema matches HuggingFace chat format
- [ ] ContentType union discriminates by 'type' field
- [ ] Exported from @automaker/flows package

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
