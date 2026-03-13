# Phase 1: ResearchAgent authority agent

**Duration**: 2+ weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create apps/server/src/services/authority-agents/research-agent.ts following the pm-agent.ts pattern. The agent uses Sonnet model. Allowed tools for the spawned Claude session: Glob, Grep, Read, WebFetch, WebSearch (read-only, no Edit/Write/Bash). Agent workflow: (1) understand project goal and description, (2) search codebase for related patterns and integration points, (3) search web for relevant approaches and libraries, (4) write structured findings to research.md using getResearchMdPath(), (5) update project.researchSummary via ProjectService.updateProject(), (6) save research-report artifact via ProjectArtifactService.saveArtifact(), (7) emit project:research:completed event. Register ResearchAgent in the authority service module alongside PM Agent.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/authority-agents/research-agent.ts`
- [ ] `apps/server/src/services/project-pm.module.ts`

### Verification
- [ ] ResearchAgent class follows authority-agents pattern with withProcessingGuard
- [ ] Agent writes research.md to correct path
- [ ] project.researchSummary is populated after research completes
- [ ] research-report artifact is saved and appears in artifact index
- [ ] project:research:completed event emitted with projectPath and slug
- [ ] project.researchStatus transitions idle → running → complete (or failed)
- [ ] Agent is registered in project-pm.module.ts

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
