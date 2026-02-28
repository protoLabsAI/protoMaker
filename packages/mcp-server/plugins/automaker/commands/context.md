---
name: context
description: Manage context files that are injected into AI agent prompts. Add coding standards, architectural guidelines, or project-specific rules.
argument-hint: (list|add|view|delete) [filename]
allowed-tools:
  - AskUserQuestion
  - Read
  - Write
  # Context File Management
  - mcp__plugin_protolabs_studio__list_context_files
  - mcp__plugin_protolabs_studio__get_context_file
  - mcp__plugin_protolabs_studio__create_context_file
  - mcp__plugin_protolabs_studio__delete_context_file
  # Project Spec
  - mcp__plugin_protolabs_studio__get_project_spec
  - mcp__plugin_protolabs_studio__update_project_spec
  - mcp__plugin_protolabs_studio__health_check
---

# Automaker Context Manager

You manage context files that are automatically injected into every AI agent's prompt. This ensures agents follow project conventions and understand architectural decisions.

## What Are Context Files?

Context files live in `.automaker/context/` and contain:

- Coding standards and style guides
- Architectural patterns to follow
- Common pitfalls to avoid
- Testing requirements
- Documentation standards

Every time an agent starts working on a feature, ALL context files are loaded into its prompt.

## Commands

### List Context Files

```
mcp__plugin_protolabs_studio__list_context_files({ projectPath })
```

Display:

```
## Context Files

| File | Size | Description |
|------|------|-------------|
| coding-standards.md | 2.4kb | TypeScript conventions |
| testing-rules.md | 1.1kb | Test requirements |
| api-patterns.md | 3.2kb | REST API conventions |
```

### View a Context File

```
mcp__plugin_protolabs_studio__get_context_file({ projectPath, filename: "coding-standards.md" })
```

### Create a Context File

When user wants to add a new context file:

1. Ask what kind of guidance they want to add
2. Help them write effective agent instructions
3. Create the file

```
header: "Context Type"
question: "What kind of guidance do you want to add?"
options:
  - label: "Coding Standards"
    description: "Style, naming, patterns"
  - label: "Testing Requirements"
    description: "What and how to test"
  - label: "Architecture Guidelines"
    description: "Structure, dependencies"
  - label: "Custom Rules"
    description: "Project-specific instructions"
```

Then create:

```
mcp__plugin_protolabs_studio__create_context_file({
  projectPath,
  filename: "my-rules.md",
  content: "<markdown content>"
})
```

### Delete a Context File

```
mcp__plugin_protolabs_studio__delete_context_file({ projectPath, filename: "old-rules.md" })
```

## Project Spec

The project spec (`.automaker/spec.md`) is a special context file that describes the overall project architecture.

### View Project Spec

```
mcp__plugin_protolabs_studio__get_project_spec({ projectPath })
```

### Update Project Spec

```
mcp__plugin_protolabs_studio__update_project_spec({ projectPath, content: "<new content>" })
```

## Writing Effective Context Files

### Good Context File Structure

```markdown
# [Topic] Guidelines

## Overview

Brief description of why these rules matter.

## Rules

### Rule 1: [Clear, Actionable Title]

- DO: specific example
- DON'T: anti-pattern example

### Rule 2: [Another Rule]

...

## Examples

### Good Example

\`\`\`typescript
// This follows our patterns
\`\`\`

### Bad Example

\`\`\`typescript
// This violates our patterns
\`\`\`
```

### Tips for Effective Rules

1. **Be specific**: "Use camelCase for variables" not "Use good naming"
2. **Show examples**: Agents learn better from concrete code samples
3. **Explain why**: Helps agents make good decisions in edge cases
4. **Keep it focused**: One topic per file, easier to maintain
5. **Use consistent format**: Agents parse structure predictably

## Common Context Files

### coding-standards.md

```markdown
# Coding Standards

## TypeScript

- Use explicit return types on functions
- Prefer interfaces over type aliases for objects
- Use const assertions for literals

## Imports

- Use absolute imports from @project/package
- Group imports: external, internal, relative

## Error Handling

- Always use try/catch for async operations
- Use custom error classes for domain errors
```

### testing-rules.md

```markdown
# Testing Requirements

## Coverage

- All new functions must have unit tests
- Integration tests for API endpoints
- E2E tests for critical user flows

## Naming

- Describe what is being tested
- test('should [expected behavior] when [condition]')

## Mocking

- Mock external services only
- Never mock the code under test
```

### api-patterns.md

```markdown
# API Design Patterns

## REST Conventions

- GET for reads, POST for creates, PATCH for updates
- Use plural nouns: /users, /features
- Nest resources: /users/:id/features

## Response Format

- Always return { data, error, meta }
- Use HTTP status codes correctly
- Include pagination info in meta
```
