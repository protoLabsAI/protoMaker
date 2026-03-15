---
title: 'Building Software with AI Agents in 2025'
description: 'Lessons learned from shipping production features with autonomous AI agents — what works, what breaks, and how to design for graceful failure.'
pubDate: 2025-02-20
tags: ['AI', 'Engineering', 'Automation']
author: 'Your Name'
draft: false
---

The discourse around AI-assisted development tends to oscillate between two extremes: "AI will replace developers" and "AI produces garbage code." After spending the better part of a year building a system where agents ship production features end-to-end, I've landed somewhere more nuanced.

AI agents are remarkably capable within well-defined boundaries. The hard part isn't the code generation — it's designing those boundaries.

## The Scope Discipline Problem

The most common failure mode I observed was scope expansion. Give an agent a vague task like "improve the settings page" and it might reasonably decide to refactor the shared `Input` component, update three other pages that use it, add new types to the shared library, and wire in a new API endpoint. Each step is individually reasonable. Collectively, it's a merge conflict nightmare.

The fix: break work into **atomic features** with explicit file boundaries. An agent that knows it should only touch `apps/ui/src/components/settings/index.tsx` produces focused, reviewable diffs.

## Design for Idempotency

Agents fail. Network timeouts, context limits, process crashes — at scale, every possible failure will eventually happen. The question is whether the system can recover cleanly.

Every mutation in my system now follows a pattern:

1. **Check** — is this already done? (read current state)
2. **Write** — perform the change
3. **Verify** — confirm the write succeeded

This three-step pattern adds a few lines per operation, but it makes every mutation restartable. An interrupted agent can resume from the last checkpoint rather than starting over.

## The Human-in-the-Loop Sweet Spot

Full automation is tempting, but there are decision points that genuinely benefit from human judgment: "Should this breaking change ship before the weekend?", "Is this PR diff within the intended scope?" Surfacing these moments as structured forms, rather than Slack messages or email threads, keeps the process fast without removing the human gate.

My rule of thumb: automate everything you'd do the same way every time; add a human gate for decisions where context matters.

## What's Next

I'm working on friction pattern detection — automatically identifying systemic issues (recurring merge conflicts, flaky tests, repeated timeouts) and filing improvement tickets without any human prompting. Turning failure signals into improvement tasks is the next frontier for self-healing systems.
