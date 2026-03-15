# Prompts — Git-Versioned Templates + Playground

_Part of: AI Agent App Starter Kit_

Extract the PromptBuilder and prompt registry from libs/prompts/ and build a prompt playground for testing and iterating on prompts.

**Status:** undefined

## Phases

### 1. Extract prompt builder and registry

Create packages/prompts/ in the starter kit. Extract PromptBuilder class with section-based composition (SectionName enum, priority ordering, phase filtering, conditional sections). Extract prompt registry pattern (registerPrompt, getPromptForRole, createPromptFromTemplate with {{variable}} interpolation) — ship the registry empty. Create a prompts/ directory at the project root for git-versioned prompt files (markdown with YAML frontmatter: name, role, version, variables). Add a prompt loader that reads from the filesystem and auto-registers.

**Complexity:** medium

**Files:**

- libs/templates/starters/ai-agent-app/packages/prompts/src/builder.ts
- libs/templates/starters/ai-agent-app/packages/prompts/src/registry.ts
- libs/templates/starters/ai-agent-app/packages/prompts/src/loader.ts
- libs/templates/starters/ai-agent-app/packages/prompts/src/types.ts
- libs/templates/starters/ai-agent-app/prompts/assistant.md
- libs/templates/starters/ai-agent-app/prompts/code-reviewer.md

**Acceptance Criteria:**

- [ ] PromptBuilder composes sections with priority ordering
- [ ] Registry registers and resolves prompts by role
- [ ] Template interpolation replaces {{variables}}
- [ ] Prompt files loaded from prompts/ directory
- [ ] Git versioning works (prompts are plain markdown)

### 2. Build prompt playground UI

Create /prompts route in packages/app with a prompt playground. Split view: left panel is a prompt editor (CodeMirror or textarea with syntax highlighting), right panel is a live chat test area. Users can edit prompts, set variables, select a model, and test the prompt with live streaming responses. Load available prompts from GET /api/prompts. Save edits back to the filesystem. Show token count estimate for the prompt.

**Complexity:** medium

**Files:**

- libs/templates/starters/ai-agent-app/packages/app/src/routes/prompts.tsx
- libs/templates/starters/ai-agent-app/packages/app/src/components/prompt-editor.tsx
- libs/templates/starters/ai-agent-app/packages/server/src/routes/prompts.ts

**Acceptance Criteria:**

- [ ] Prompt editor with syntax highlighting
- [ ] Live chat test area with streaming
- [ ] Load prompts from filesystem via API
- [ ] Variable substitution preview
- [ ] Token count estimate displayed
- [ ] Save edits back to prompt files
