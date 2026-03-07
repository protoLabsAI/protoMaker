# Project: Distributed Product Lifecycle Platform

## Goal
Transform protoLabs from a single-instance task runner into a distributed product creation platform — from idea to production. CRDT-synced operational state (features, projects, notes, calendar, todos, settings) across multiple Automaker instances on Tailscale VPN, with an agentic Stage-Gate lifecycle (8 automated gates), cross-instance work-stealing, Ava Mesh orchestration, DORA metrics as auto-regulation control signals, and outcome-driven features (success metrics, kill conditions, hypotheses). The full lifecycle flywheel: signals → gates → execution → promotion → reflection → learning → better signals.

## Milestones
1. Foundation - Core CRDT infrastructure: proto.config loader, libs/crdt workspace package, Automerge document management, and WebSocket sync adapter for Tailscale.
2. Feature Sync - Implement AutomergeFeatureStore backed by CRDT documents, replacing filesystem reads/writes for feature data. Events propagate across instances via EventBus.broadcast().
3. Projects, Notes, and Settings Sync - Extend CRDT sync to projects, notes workspace, and shared settings. Same pattern as features — Automerge documents per domain, change subscriptions, event propagation.
4. Cross-Instance Assignment - Enable features to flow between instances based on capacity, domain ownership, and priority. Work-stealing protocol for idle instances.
5. Rich Text and Polish - Upgrade notes from workspace-level sync to character-level rich-text CRDT, and add operational polish for production multi-instance use.
6. Ava Orchestrator Mesh - Enable Ava orchestrators on each instance to communicate with each other — sharing status, requesting help, coordinating cross-instance work, and logging conversations. An MCP tool and UI view provide visibility into inter-Ava dialogue.
7. Calendar and Todo Sync - Add Calendar (events) and Todo (lists) as shared CRDT domains. Todos have a three-tier permission model: user lists (agent-readable), per-instance Ava lists (writable only by owning Ava + user, readable by all Avas), and shared lists. Calendar events sync across all instances. These complete the data model hierarchy: Parent Project > Projects/Calendar/Notes/Todo.
