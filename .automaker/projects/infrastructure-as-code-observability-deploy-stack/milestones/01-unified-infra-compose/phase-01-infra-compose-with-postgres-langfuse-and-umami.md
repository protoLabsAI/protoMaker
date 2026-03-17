# Phase 1: Infra compose with Postgres, Langfuse, and Umami

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create docker-compose.infra.yml with: (1) Postgres 16 container with init scripts that create langfuse and umami databases, (2) Langfuse server container on port 3012, (3) Umami container on port 3013. Add health checks. Create infra/ directory with Postgres init SQL. All services on shared automaker-infra network.

---

## Tasks

### Files to Create/Modify
- [ ] `docker-compose.infra.yml`
- [ ] `infra/postgres/init-databases.sql`

### Verification
- [ ] docker compose -f docker-compose.infra.yml up -d starts all 3 services
- [ ] Langfuse UI accessible at localhost:3012
- [ ] Umami UI accessible at localhost:3013
- [ ] Health checks pass for all services

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
