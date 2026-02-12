# Project: Agile Ceremony Automation

## Goal
Auto-post rich milestone updates and LLM-generated project retros to Discord when milestones complete and projects finish. Templates for structure, LLM for spice. Per-project config. Zero manual intervention.

## Milestones
1. Types and Configuration - Add ceremony types, extend EventHookTrigger, add per-project ceremony config to ProjectSettings. Foundation for all ceremony features.
2. Ceremony Service - Core service that generates ceremony content and posts to Discord. Enriches event payloads, generates templates, calls LLM for retro spice.
3. Wiring and MCP Tools - Wire CeremonyService into server initialization, add MCP tool for manual ceremony triggers, and register service in the DI container.
