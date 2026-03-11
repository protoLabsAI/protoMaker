---
name: deep-research
description: Research codebase before planning a feature. Gathers context, identifies patterns, and documents constraints.
category: engineering
argument-hint: <topic to research>
allowed-tools:
  - Read
  - Glob
  - Grep
  - Task
  - AskUserQuestion
  - mcp__plugin_protolabs_studio__get_project_spec
  - mcp__plugin_protolabs_studio__list_context_files
  - mcp__plugin_protolabs_studio__get_context_file
  - mcp__plugin_protolabs_studio__list_features
model: haiku
---

# Deep Research Command

Research the codebase before planning a new feature or project.

## Purpose

Before creating a PRD or planning implementation, you need to understand:

- Current codebase structure and patterns
- Existing implementations similar to what's being planned
- Constraints, gotchas, and technical debt
- Recommended approaches based on project conventions

## Workflow

### Step 1: Understand the Request

Parse the research topic from the user's input. If unclear, ask for clarification:

```
question: "What aspect of the codebase do you want to research?"
options:
  - label: "New feature area"
    description: "Research before implementing new functionality"
  - label: "Existing system"
    description: "Understand how something currently works"
  - label: "Technical approach"
    description: "Evaluate best way to implement something"
```

### Step 2: Gather Project Context

1. Get the project specification:

   ```
   mcp__plugin_protolabs_studio__get_project_spec({ projectPath })
   ```

2. Check context files for coding standards:

   ```
   mcp__plugin_protolabs_studio__list_context_files({ projectPath })
   ```

3. Review existing features for related work:
   ```
   mcp__plugin_protolabs_studio__list_features({ projectPath })
   ```

### Step 3: Explore the Codebase

Use the Explore agent for comprehensive codebase analysis:

```
Task(subagent_type: "Explore",
     prompt: "Explore the codebase to understand: [topic]

              Look for:
              1. Files related to this area
              2. Existing patterns and conventions
              3. Dependencies and integrations
              4. Tests and documentation

              Project path: [projectPath]",
     model: "haiku")
```

### Step 4: Document Findings

Structure the research summary:

```markdown
# Research Summary: [Topic]

## Relevant Files Identified

| Path                 | Purpose                | Key Patterns                    |
| -------------------- | ---------------------- | ------------------------------- |
| src/services/auth.ts | Authentication service | Singleton pattern, JWT handling |

## Existing Patterns

- **Pattern Name**: Description and examples
- **Convention**: How it's used in the codebase

## Constraints & Gotchas

- ⚠️ **Warning**: Description and severity
- ℹ️ **Info**: Useful context

## Recommendations

1. Recommended approach based on findings
2. Files to reference
3. Patterns to follow

## Questions for PRD

- [ ] Question that needs answering before implementation
```

### Step 5: Hand Off to PRD Creation

After research is complete, suggest next step:

```
Research complete! To create a PRD based on these findings, use:
/sparc-prd [feature name]
```

## Output Format

Always output a structured research summary that can be fed into the SPARC PRD creator.
