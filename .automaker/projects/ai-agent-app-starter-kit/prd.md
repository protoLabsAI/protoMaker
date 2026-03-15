# PRD: AI Agent App Starter Kit

## Situation
protoLabs Studio has a production-quality AI chat system across libs/ui/src/ai/ (25 components), server chat routes (AI SDK streaming), model resolver (multi-provider), slash commands, and session state. The scaffold system supports docs, portfolio, landing-page, extension, and general starter kits but has no AI/agent kit.

## Problem
Developers building AI-native apps have no clean starting point. They must wire up Vercel AI SDK streaming from scratch or copy-paste from automaker and manually strip internal code. The Claude Agent SDK is the primary driver but there is no reference implementation showing how to build a complete agent UX.

## Approach
Extract and componentize existing chat UI into a standalone packages/ui library. Build packages/server with Express + Claude Agent SDK streaming, tool registry, slash commands, agent roles, and multi-provider model resolver. Build packages/app as a Vite + React 19 SPA with Zustand persistent sessions and TanStack Router. Ship as libs/templates/starters/ai-agent-app/ integrated into the scaffold system.

## Results
Users run npx create-protolab my-app --kit ai-agent-app and get a working monorepo with streaming chat connected to Claude within 5 minutes. Custom tools render with rich UI cards. HITL works inline. Extended reasoning displays. Sessions persist. Slash commands and agent roles are user-configurable.

## Constraints
React 19 best practices ONLY. Claude Agent SDK is primary driver. npm workspaces only. Inline HITL not dialog. No auth/DB/SaaS. Multi-provider via AI SDK. Must integrate with scaffold system (7 files). All components fully decoupled from @protolabsai packages.
