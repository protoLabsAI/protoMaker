# M1: Unified Infra Compose

**Status**: 🔴 Not started
**Duration**: 3-6 weeks (estimated)
**Dependencies**: None

---

## Overview

Create the single docker-compose.infra.yml with all observability services, shared Postgres, and version-controlled configs. Delete old fragmented compose files.

---

## Phases

| Phase | File | Duration | Dependencies | Owner |
|-------|------|----------|--------------|-------|
| 1 | [phase-01-infra-compose-with-postgres-langfuse-and-umami.md](./phase-01-infra-compose-with-postgres-langfuse-and-umami.md) | 1 week | None | TBD |
| 2 | [phase-02-add-grafana-prometheus-loki-and-promtail.md](./phase-02-add-grafana-prometheus-loki-and-promtail.md) | 1 week | None | TBD |
| 3 | [phase-03-delete-old-compose-files-and-configs.md](./phase-03-delete-old-compose-files-and-configs.md) | 0.5 weeks | None | TBD |

---

## Success Criteria

M1 is **complete** when:

- [ ] All phases complete
- [ ] Tests passing
- [ ] Documentation updated
- [ ] Team reviewed and approved

---

## Outputs

### For Next Milestone
- Foundation work ready for dependent features
- APIs stable and documented
- Types exported and usable

---

## Handoff to M2

Once M1 is complete, the following can begin:

- Next milestone phases that depend on this work
- Parallel work streams that were blocked

---

**Next**: [Phase 1](./phase-01-infra-compose-with-postgres-langfuse-and-umami.md)
