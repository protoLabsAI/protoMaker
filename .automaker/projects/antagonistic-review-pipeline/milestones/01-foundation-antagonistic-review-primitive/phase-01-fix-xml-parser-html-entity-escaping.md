# Phase 1: Fix XML parser HTML entity escaping

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Add unescape logic to xml-parser.ts to convert &lt; &gt; &amp; &quot; back to literal characters in extracted content. This fixes code blocks in generated content where LLMs output HTML entities instead of raw angle brackets.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/flows/src/content/xml-parser.ts`

### Verification
- [ ] extractTag unescapes HTML entities in returned content
- [ ] Code blocks with TypeScript generics like Annotation<string[]> render correctly
- [ ] Existing tests still pass
- [ ] New test cases for entity escaping added

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
