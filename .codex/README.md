# Codex Assets

This directory contains shared Codex-native assets for protoLabs Studio.

## Committed

These files are intended to be shared in the repository:

- `skills/` — reusable Codex skills and playbooks
- `config.toml.example` — example MCP and Codex configuration
- this `README.md`

## Not Committed

These files must remain local:

- `config.toml` — real user configuration
- any file containing secrets, tokens, or user-specific paths

## Purpose

The Codex layer is additive. It exists alongside the current Claude-oriented setup and does not replace or modify it.

Use this directory for:

- Codex-native workflow skills
- playbooks and runbooks used by those skills
- safe example configuration
