# Phase 3: Define prompt templates with local fallback

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create prompt templates for each pipeline node as local markdown files in libs/flows/src/content/prompts/. Templates use {{variable}} interpolation (matching MythxEngine pattern). Include: research-synthesis.md, outline-planner.md, section-writer.md, technical-reviewer.md, style-reviewer.md, fact-checker.md, assembler.md. Create compilePrompt() utility that checks Langfuse first, falls back to local markdown.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/flows/src/content/prompts/research-synthesis.md`
- [ ] `libs/flows/src/content/prompts/outline-planner.md`
- [ ] `libs/flows/src/content/prompts/section-writer.md`
- [ ] `libs/flows/src/content/prompts/technical-reviewer.md`
- [ ] `libs/flows/src/content/prompts/style-reviewer.md`
- [ ] `libs/flows/src/content/prompts/fact-checker.md`
- [ ] `libs/flows/src/content/prompts/assembler.md`
- [ ] `libs/flows/src/content/prompt-loader.ts`

### Verification
- [ ] 7 prompt templates as markdown files
- [ ] compilePrompt() utility with {{var}} interpolation
- [ ] Langfuse lookup with local file fallback
- [ ] Works without Langfuse credentials (pure local mode)
- [ ] Templates are well-structured with clear I/O specifications

---

## Deliverables

- [ ] Code implemented and working
- [ ] Tests passing
- [ ] Documentation updated

---

## Handoff Checklist

Before marking Phase 3 complete:

- [ ] All tasks complete
- [ ] Tests passing
- [ ] Code reviewed
- [ ] PR merged to main
- [ ] Team notified

**Next**: Phase 4
