# {{projectName}}

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

{{projectName}} is managed with Automaker ProtoLab.

## Common Commands

```bash
{{#buildCommand}}
# Build
{{buildCommand}}
{{/buildCommand}}

{{#testCommand}}
# Test
{{testCommand}}
{{/testCommand}}

{{#formatCommand}}
# Format
{{formatCommand}}
{{/formatCommand}}

{{#lintCommand}}
# Lint
{{lintCommand}}
{{/lintCommand}}

{{#devCommand}}
# Development
{{devCommand}}
{{/devCommand}}
```

## Important Guidelines

- Follow the coding standards defined in coding-rules.md
- Write tests for new functionality
- Keep code clean, typed, and maintainable
- Use the established patterns in the codebase
