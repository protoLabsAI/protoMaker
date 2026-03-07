# Phase 1: Artifact storage service + ceremony report persistence

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

TDD phase. Create apps/server/src/services/project-artifact-service.ts. Write unit tests first: (1) saveArtifact(projectPath, slug, type, content) writes to .automaker/projects/{slug}/artifacts/{type}/{timestamp}.json and updates the index. (2) listArtifacts(projectPath, slug, type?) returns index entries. (3) getArtifact(projectPath, slug, artifactId) returns full content. Types: 'ceremony-report', 'changelog', 'escalation', 'standup'. Then implement. Wire into CeremonyService: on completion of retro/project-retro LangGraph flow, call saveArtifact with the ceremony output. Add artifact index type to libs/types.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/project-artifact-service.ts`
- [ ] `apps/server/src/services/ceremony-service.ts`
- [ ] `libs/types/src/project.ts`
- [ ] `apps/server/tests/unit/services/project-artifact-service.test.ts`

### Verification
- [ ] ProjectArtifactService saves artifacts to .automaker/projects/{slug}/artifacts/{type}/{timestamp}.json
- [ ] Artifact index file (.automaker/projects/{slug}/artifacts/index.json) maintained on every save
- [ ] CeremonyService persists retro and project-retro reports as ceremony-report artifacts
- [ ] listArtifacts and getArtifact return correct data
- [ ] Unit tests cover save, list, get, and index update
- [ ] Build passes

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
