# PRD: Infrastructure as Code: Observability & Deploy Stack

## Situation
protoLabs Studio runs on a self-hosted staging machine (Tailscale 100.101.189.45) via Docker. The observability infrastructure is fragmented across two unused compose files that overlap and neither is running. AI tracing depends on an external Langfuse instance whose Postgres DB is in recovery mode. The deploy-staging.yml workflow is failing silently. The context engine was just enabled by default but has zero observability.

## Problem
Four critical gaps block launch readiness: (1) No working AI tracing. (2) No web analytics. (3) No unified dashboards. (4) Fragile deploys.

## Approach
Create a single docker-compose.infra.yml with all observability services (Langfuse, Umami, Grafana, Prometheus, Loki, Promtail) and a shared Postgres backend. Fix the deploy pipeline. Wire the app to local Langfuse. Add context engine tracing. Delete old fragmented compose files.

## Results
AI traces landing in local Langfuse. Context engine visible as spans. Web analytics via Umami. Unified Grafana dashboards. Reliable staging deploys. All infrastructure defined in code.

## Constraints
All services Tailscale-only. Shared Postgres for Langfuse + Umami. Must coexist with docker-compose.staging.yml. Keep infra under 16GB RAM. No Cloudflare proxy. Delete old compose files after migration.
