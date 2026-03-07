# Project: Distributed CRDT Sync

## Goal
Enable multiple Automaker instances to share board state (features, projects, notes, settings) in real-time across distributed compute via CRDTs, with cross-instance feature assignment, offline-first operation, and conflict-free merges over Tailscale VPN.

## Milestones
1. Foundation - Core CRDT infrastructure: proto.config loader, libs/crdt workspace package, Automerge document management, and WebSocket sync adapter for Tailscale.
2. Feature Sync - Implement AutomergeFeatureStore backed by CRDT documents, replacing filesystem reads/writes for feature data. Events propagate across instances via EventBus.broadcast().
3. Projects, Notes, and Settings Sync - Extend CRDT sync to projects, notes workspace, and shared settings. Same pattern as features — Automerge documents per domain, change subscriptions, event propagation.
4. Cross-Instance Assignment - Enable features to flow between instances based on capacity, domain ownership, and priority. Work-stealing protocol for idle instances.
5. Rich Text and Polish - Upgrade notes from workspace-level sync to character-level rich-text CRDT, and add operational polish for production multi-instance use.
