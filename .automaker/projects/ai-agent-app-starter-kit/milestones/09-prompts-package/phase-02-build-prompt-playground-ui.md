# Phase 2: Build prompt playground UI

_AI Agent App Starter Kit > Prompts — Git-Versioned Templates + Playground_

Create /prompts route in packages/app with a prompt playground. Split view: left panel is a prompt editor (CodeMirror or textarea with syntax highlighting), right panel is a live chat test area. Users can edit prompts, set variables, select a model, and test the prompt with live streaming responses. Load available prompts from GET /api/prompts. Save edits back to the filesystem. Show token count estimate for the prompt.

**Complexity:** medium

## Files to Modify

- libs/templates/starters/ai-agent-app/packages/app/src/routes/prompts.tsx
- libs/templates/starters/ai-agent-app/packages/app/src/components/prompt-editor.tsx
- libs/templates/starters/ai-agent-app/packages/server/src/routes/prompts.ts

## Acceptance Criteria

- [ ] Prompt editor with syntax highlighting
- [ ] Live chat test area with streaming
- [ ] Load prompts from filesystem via API
- [ ] Variable substitution preview
- [ ] Token count estimate displayed
- [ ] Save edits back to prompt files
