# Phase 1: Add research and ceremony types

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Add ResearchStatus ('idle' | 'running' | 'complete' | 'failed'), ResearchSource (url, title, summary), and ResearchReport (status, summary, sources, completedAt) types to libs/types/src/project.ts. Add researchStatus field to Project interface. Add 'research-report' to ArtifactType union in project.ts. Add GlobalCeremoniesConfig interface (dailyStandup: { enabled: boolean, lastRunAt?: string }) and add ceremonies field to GlobalSettings in libs/types/src/global-settings.ts.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/types/src/project.ts`
- [ ] `libs/types/src/global-settings.ts`

### Verification
- [ ] ResearchStatus, ResearchSource, ResearchReport types exported from @protolabsai/types
- [ ] Project interface has researchStatus?: ResearchStatus
- [ ] 'research-report' is a valid ArtifactType value
- [ ] GlobalSettings has ceremonies?: GlobalCeremoniesConfig
- [ ] TypeScript compiles with zero errors across all packages

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
