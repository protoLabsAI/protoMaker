# Phase 1: Implement output format generators

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create parallel output nodes: (1) MarkdownOutputNode - writes final markdown with frontmatter; (2) HFDatasetNode - converts content into HuggingFace-compatible JSONL training data (chat format: system/user/assistant messages), extracts Q&A pairs from sections, generates instruction-following examples; (3) MetadataNode - generates SEO metadata, tags, categories, estimated read time, content summary. All execute in parallel via Send() with results collected via fileReducer.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/flows/src/content/nodes/output-generators.ts`

### Verification
- [ ] Markdown output includes frontmatter and proper formatting
- [ ] HF dataset output in JSONL chat format (messages array)
- [ ] Q&A extraction from technical sections
- [ ] Instruction-following pairs generated from how-to content
- [ ] SEO metadata generated (title, description, keywords, readTime)
- [ ] All outputs validated with Zod schemas
- [ ] Parallel execution via Send()

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
