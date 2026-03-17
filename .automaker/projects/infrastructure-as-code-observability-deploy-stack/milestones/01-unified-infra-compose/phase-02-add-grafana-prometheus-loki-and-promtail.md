# Phase 2: Add Grafana, Prometheus, Loki, and Promtail

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Extend docker-compose.infra.yml with Prometheus, Loki, Promtail, and Grafana with pre-provisioned datasources on port 3010. Create config files in infra/ subdirectories.

---

## Tasks

### Files to Create/Modify
- [ ] `docker-compose.infra.yml`
- [ ] `infra/prometheus/prometheus.yml`
- [ ] `infra/loki/config.yml`
- [ ] `infra/promtail/config.yml`
- [ ] `infra/grafana/datasources.yml`

### Verification
- [ ] Grafana accessible at localhost:3010 with datasources pre-configured
- [ ] Prometheus scraping targets visible
- [ ] Docker logs visible in Grafana via Loki
- [ ] All services healthy

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
