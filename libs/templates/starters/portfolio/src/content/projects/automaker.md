---
title: 'Automaker'
description: 'An AI-native project management system where agents autonomously ship features — from ticket to merged PR.'
techStack: ['TypeScript', 'Astro', 'React', 'Node.js', 'Claude API']
pubDate: 2024-11-01
repoUrl: 'https://github.com/yourname/automaker'
liveUrl: 'https://protolabs.studio'
image: '/images/projects/automaker.png'
imageAlt: 'Automaker board UI showing features in different pipeline stages'
featured: true
tags: ['AI', 'Developer Tools', 'Automation']
---

## The Problem

Modern software teams spend as much time on process as on building. Tickets pile up, PRs sit in review, and the feedback loop from idea to deployed code spans days instead of hours.

## The Solution

Automaker is an AI-native project management system where specialized agents handle the entire feature lifecycle — from decomposing a PRD into atomic tasks, to writing code in isolated git worktrees, to opening and merging PRs. Human review is a first-class citizen, not an afterthought.

## Key Highlights

- **Autonomous execution** — agents pick up features from the board, implement them in worktrees, and open PRs without human prompting
- **Human-in-the-loop** — HITL forms surface decisions that require human judgment; everything else proceeds automatically
- **Full observability** — Langfuse tracing, cost tracking, and a real-time activity feed

## What I Learned

Building a system that safely delegates code authorship to AI taught me a lot about defensive architecture: idempotency, mutex patterns, and how to design recovery mechanisms for inevitable failures.
