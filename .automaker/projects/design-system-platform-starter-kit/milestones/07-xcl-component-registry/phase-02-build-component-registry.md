# Phase 2: Build component registry

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create packages/registry/ with a type-safe component registry. Adapted from proto2's ComponentRegistry pattern. Maps component names to: schemas (JSON Schema from TypeScript), import paths, categories (atomic design), framework targets, .pen source references. Search by name, category, tags. Auto-populate from generated components.

---

## Tasks

### Files to Create/Modify

- [ ] `libs/templates/starters/design-system/packages/registry/src/registry.ts`
- [ ] `libs/templates/starters/design-system/packages/registry/src/types.ts`
- [ ] `libs/templates/starters/design-system/packages/registry/src/schema-generator.ts`

### Verification

- [ ] Register components with schemas and metadata
- [ ] Search by name, category, tags
- [ ] Auto-populate from generated React components
- [ ] JSON Schema auto-generated from TypeScript interfaces
- [ ] Atomic design hierarchy supported

---

## Deliverables

- [ ] Code implemented and working
- [ ] Tests passing
- [ ] Documentation updated

---

## Handoff Checklist

Before marking Phase 2 complete:

- [ ] All tasks complete
- [ ] Tests passing
- [ ] Code reviewed
- [ ] PR merged to main
- [ ] Team notified

**Next**: Phase 3
