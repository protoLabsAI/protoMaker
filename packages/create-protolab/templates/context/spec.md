# {{projectName}} — Project Specification

## Overview

{{projectName}} is a {{techStack}} project managed with Automaker ProtoLab.

## Tech Stack

{{#items}}

- **{{label}}**: {{value}}
  {{/items}}

## Architecture

{{#isMonorepo}}

### Monorepo Structure

This project uses a monorepo with {{monorepoTool}} and {{packageManager}}.

**Workspace packages:**
{{#packages}}

- `{{path}}` — {{name}} ({{type}})
  {{/packages}}
  {{/isMonorepo}}

{{#hasFrontend}}

### Frontend

- Framework: {{framework}} {{frameworkVersion}}
- Meta-framework: {{metaFramework}} {{metaFrameworkVersion}}
  {{#hasTailwind}}- Styling: Tailwind CSS {{tailwindVersion}}{{/hasTailwind}}
  {{#hasShadcn}}- Components: shadcn/ui{{/hasShadcn}}
  {{/hasFrontend}}

{{#hasBackend}}

### Backend

{{#hasExpress}}- Express.js server{{/hasExpress}}
{{#hasPayload}}- Payload CMS {{payloadVersion}}{{/hasPayload}}
{{#database}}- Database: {{database}}{{/database}}
{{/hasBackend}}

## Development Guidelines

- All code must pass CI checks before merging
- Use feature branches with descriptive names
- Keep PRs focused and under 300 lines when possible
- Write tests for new functionality
