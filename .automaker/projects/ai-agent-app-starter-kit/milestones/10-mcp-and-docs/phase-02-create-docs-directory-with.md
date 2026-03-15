# Phase 2: Create docs directory with extracted and new content

_AI Agent App Starter Kit > MCP Server + Documentation_

Create docs/ at the starter kit root. Extract and genericize docs from automaker: agent-architecture.md, agent-philosophy.md, prompt-engineering.md, reliability.md (from concepts/), writing-prompts.md, flow-control.md, gotchas.md (from guides/), langfuse.md, mcp-integration.md, sdk-integration.md (from integrations/internal). Write new docs: visual-flow-builder.md, trace-viewer.md, prompt-playground.md, creating-mcp-tools.md, tool-adapters.md. Follow Diataxis framework: tutorials in getting-started/, how-tos in guides/, reference in reference/, explanations in concepts/.

**Complexity:** large

## Files to Modify

- libs/templates/starters/ai-agent-app/docs/getting-started/quickstart.md
- libs/templates/starters/ai-agent-app/docs/concepts/agent-architecture.md
- libs/templates/starters/ai-agent-app/docs/concepts/prompt-engineering.md
- libs/templates/starters/ai-agent-app/docs/guides/creating-tools.md
- libs/templates/starters/ai-agent-app/docs/guides/building-flows.md
- libs/templates/starters/ai-agent-app/docs/guides/tracing-debugging.md
- libs/templates/starters/ai-agent-app/docs/guides/prompt-playground.md
- libs/templates/starters/ai-agent-app/docs/reference/tool-adapters.md
- libs/templates/starters/ai-agent-app/docs/integrations/langfuse.md
- libs/templates/starters/ai-agent-app/docs/integrations/mcp.md

## Acceptance Criteria

- [ ] Diataxis structure with 4 content types
- [ ] Extracted docs genericized (no automaker references)
- [ ] New docs cover flow builder, traces, prompts, MCP
- [ ] Quickstart gets user running in 5 minutes
- [ ] All docs follow outcome-focused headings, code-first
