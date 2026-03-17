# Infrastructure as Code: Observability & Deploy Stack

Consolidate all infrastructure into a single, version-controlled Docker Compose stack running on the staging machine. Replace fragmented monitoring/observability compose files, the broken external Langfuse instance, and the failing deploy pipeline with a production-ready IaC setup.

**Status:** active
**Created:** 2026-03-17T07:44:40.005Z
**Updated:** 2026-03-17T07:58:47.985Z

## Research Summary

The Automaker project suffers from fragmented infrastructure configuration: **7 root-level compose files** [1], **two conflicting observability stacks** [2][3], **three independent Grafana instances** [4][5][6], and a **broken external Langfuse dependency** [19] that silently drops LLM traces when unreachable [34]. The deploy pipeline has solid foundations — rollback tagging [40], agent drain [43][44], smoke testing [36], and resource auto-tuning [53] — but lacks compose-file linting in CI [45][46] and has environment parity gaps between staging and production [47][48].

The recommended approach consolidates everything into a single `docker-compose.infra.yml` built on the existing LGTM stack (Loki, Grafana, Tempo, Mimir) [78], retires the legacy Prometheus/Promtail monitoring stack [64][66], and replaces the broken Langfuse Cloud instance with either a self-hosted Langfuse or a lighter-weight alternative like Arize Phoenix [76][77].

---

## PRD

### Situation

protoLabs Studio runs on a self-hosted staging machine (Tailscale 100.101.189.45) via Docker. The observability infrastructure is fragmented across two unused compose files that overlap and neither is running. AI tracing depends on an external Langfuse instance whose Postgres DB is in recovery mode. The deploy-staging.yml workflow is failing silently. The context engine was just enabled by default but has zero observability.

### Problem

Four critical gaps block launch readiness: (1) No working AI tracing. (2) No web analytics. (3) No unified dashboards. (4) Fragile deploys.

### Approach

Create a single docker-compose.infra.yml with all observability services (Langfuse, Umami, Grafana, Prometheus, Loki, Promtail) and a shared Postgres backend. Fix the deploy pipeline. Wire the app to local Langfuse. Add context engine tracing. Delete old fragmented compose files.

### Results

AI traces landing in local Langfuse. Context engine visible as spans. Web analytics via Umami. Unified Grafana dashboards. Reliable staging deploys. All infrastructure defined in code.

### Constraints

All services Tailscale-only. Shared Postgres for Langfuse + Umami. Must coexist with docker-compose.staging.yml. Keep infra under 16GB RAM. No Cloudflare proxy. Delete old compose files after migration.

## Milestones

### 1. Unified Infra Compose

Create the single docker-compose.infra.yml with all observability services, shared Postgres, and version-controlled configs. Delete old fragmented compose files.

**Status:** pending

#### Phases

1. **Infra compose with Postgres, Langfuse, and Umami** (medium)
2. **Add Grafana, Prometheus, Loki, and Promtail** (medium)
3. **Delete old compose files and configs** (small)

### 2. Fix Deploy Pipeline

Fix deploy-staging.yml and add infra stack management to the deploy flow.

**Status:** pending

#### Phases

1. **Fix deploy-staging.yml rebuild step** (medium)
2. **Add infra stack to deploy pipeline** (medium)

### 3. Wire App to Local Stack

Point application config to local Langfuse and wire Umami analytics.

**Status:** pending

#### Phases

1. **Point OTel and Langfuse to local instance** (medium)
2. **Wire Umami tracking into UI and landing site** (small)

### 4. Context Engine Observability

Add tracing to context engine operations so compaction, assembly, and store operations are visible in Langfuse.

**Status:** pending

#### Phases

1. **Add OTel spans to context engine operations** (medium)
2. **Add Langfuse generation spans for compaction LLM calls** (medium)
