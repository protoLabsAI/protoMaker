# Phase 1: Extract prompt builder and registry

_AI Agent App Starter Kit > Prompts — Git-Versioned Templates + Playground_

Create packages/prompts/ in the starter kit. Extract PromptBuilder class with section-based composition (SectionName enum, priority ordering, phase filtering, conditional sections). Extract prompt registry pattern (registerPrompt, getPromptForRole, createPromptFromTemplate with {{variable}} interpolation) — ship the registry empty. Create a prompts/ directory at the project root for git-versioned prompt files (markdown with YAML frontmatter: name, role, version, variables). Add a prompt loader that reads from the filesystem and auto-registers.

**Complexity:** medium

## Files to Modify

- libs/templates/starters/ai-agent-app/packages/prompts/src/builder.ts
- libs/templates/starters/ai-agent-app/packages/prompts/src/registry.ts
- libs/templates/starters/ai-agent-app/packages/prompts/src/loader.ts
- libs/templates/starters/ai-agent-app/packages/prompts/src/types.ts
- libs/templates/starters/ai-agent-app/prompts/assistant.md
- libs/templates/starters/ai-agent-app/prompts/code-reviewer.md

## Acceptance Criteria

- [ ] PromptBuilder composes sections with priority ordering
- [ ] Registry registers and resolves prompts by role
- [ ] Template interpolation replaces {{variables}}
- [ ] Prompt files loaded from prompts/ directory
- [ ] Git versioning works (prompts are plain markdown)
