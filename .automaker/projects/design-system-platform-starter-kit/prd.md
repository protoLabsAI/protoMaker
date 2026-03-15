# PRD: Design System Platform Starter Kit

## Situation
protoLabs Studio has a mature .pen design file ecosystem: a parser (libs/pen-parser), a full React renderer (designs-view), a property inspector, component library panel, and Pencil MCP integration. Proto2 explored AI-driven design system tooling with XCL (80-96% token reduction), LCH color science (58/58 tests), and component registries. The scaffold system supports docs, portfolio, landing-page, extension, general, and ai-agent-app starter kits but has no design system kit. No open-source AI-native end-to-end design system platform exists in the market.

## Problem
Frontend teams building design systems have no integrated open-source platform. Current tools are fragmented: Storybook for components (no design integration), zeroheight for docs (SaaS only), Knapsack for design-code sync (enterprise $$$), Locofy for Figma-to-code (Figma-locked). Teams must glue 4-5 tools together. AI-driven design-to-code generation exists only in closed platforms. The .pen file format and existing parser/renderer infrastructure are underutilized.

## Approach
Extract and extend the .pen ecosystem into a monorepo starter kit. Build a pen-to-code generator layered on the existing parser and style-utils. Port XCL converter and color science from proto2. Add W3C DTCG design token management. Build a Ladle-inspired component playground. Integrate TinaCMS for git-backed site building. Create AI agents (Design, Implement, A11y, Color) using Claude Agent SDK with MCP tools. Ship as libs/templates/starters/design-system/.

## Results
Users scaffold a complete design system platform. They drop .pen files in, AI agents generate React components with proper tokens and documentation. Component playground shows live previews. TinaCMS site builder lets non-developers manage the documentation site. A11y agent audits components automatically. Color agent generates WCAG-compliant palettes. Everything is git-backed, self-hosted, and extensible via MCP plugins.

## Constraints
React 19 best practices only. Claude Agent SDK as primary AI driver. npm workspaces. Must integrate with existing scaffold system. All extracted code fully decoupled from @protolabsai packages. W3C DTCG token format for interop. Ladle-level startup speed for playground (not Storybook-heavy). TinaCMS lightweight mode (git-backed, no Redis/MongoDB). Port proto2 assets with tests from day one.
