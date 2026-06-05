# Architecture: how the template system works

This page explains how starter kits are implemented — from the `@protolabsai/templates` package to the scaffold API endpoint to the UI template registry. Read this if you want to understand the internals or extend the system.

## Overview

The template system has three layers:

```
UI template registry (apps/ui/src/lib/templates.ts)
        ↓  POST /api/setup/scaffold-starter
Server scaffold route (apps/server/src/routes/setup/routes/scaffold-starter.ts)
        ↓  imports
@protolabsai/templates package (libs/templates/)
        ↓  reads from
Starter source files (libs/templates/starters/<kit>/)
```

The UI layer defines what templates to show and how to present them. The server layer validates the request and delegates to the templates package. The templates package does the actual file I/O.

## The `@protolabsai/templates` package

**Location:** `libs/templates/`

The package exports four scaffold functions and the types they use.

### Types

**`StarterKitType`** — the union of valid kit names:

```typescript
type StarterKitType = 'docs' | 'portfolio' | 'landing-page' | 'general';
```

**`ScaffoldOptions`** — input to every scaffold function:

```typescript
interface ScaffoldOptions {
  /** Project name — used as the package.json name and in config substitution. */
  projectName: string;
  /** Absolute path to the destination directory (must not already exist). */
  outputDir: string;
}
```

**`ScaffoldResult`** — return value of every scaffold function:

```typescript
interface ScaffoldResult {
  success: boolean;
  outputDir: string;
  filesCreated: string[];
  error?: string;
}
```

### Scaffold functions

| Function                              | Kit type       | Source directory         |
| ------------------------------------- | -------------- | ------------------------ |
| `scaffoldDocsStarter(options)`        | `docs`         | `starters/docs/`         |
| `scaffoldPortfolioStarter(options)`   | `portfolio`    | `starters/portfolio/`    |
| `scaffoldLandingPageStarter(options)` | `landing-page` | `starters/landing-page/` |
| `scaffoldGeneralStarter(options)`     | `general`      | `starters/general/`      |

All four functions follow the same pattern:

1. Resolve the source directory path relative to the compiled package
2. Recursively copy the directory to `outputDir`, skipping `node_modules` and `package-lock.json`
3. Apply name substitutions to `package.json` and framework config files
4. Return a `ScaffoldResult` with the list of top-level files created

The `general` starter additionally writes an `app_spec.txt` with the project name and a placeholder structure.

### Name substitution

After copying, `applySubstitutions()` patches config files:

- **`package.json`** — sets `name` to `projectName`
- **`.vitepress/config.mts`** (docs) — updates `title` and `description` with `projectName`
- **`index.md`** (docs) — updates the hero name with `projectName`
- **`astro.config.mjs`** (portfolio, landing-page) — updates `site`, `title`, and `description`

If a file is missing (e.g., the general starter has no framework config), the substitution is silently skipped.

### The `starters/` directory

Each starter kit is a self-contained project directory under `libs/templates/starters/`:

```
libs/templates/starters/
├── docs/
│   ├── .automaker/
│   │   └── CONTEXT.md
│   ├── .github/
│   │   └── workflows/
│   │       └── ci.yml
│   ├── .vitepress/
│   │   ├── config.mts
│   │   └── theme/
│   ├── getting-started/
│   ├── guides/
│   ├── reference/
│   └── package.json
├── portfolio/
│   ├── src/
│   │   ├── components/
│   │   ├── content/
│   │   └── pages/
│   ├── astro.config.mjs
│   └── package.json
├── landing-page/
│   ├── src/
│   │   ├── components/
│   │   ├── content/
│   │   └── pages/
│   ├── astro.config.mjs
│   └── package.json
└── general/
    └── .automaker/
        ├── settings.json
        └── categories.json
```

These files are the exact files that get copied to the user's project. Edit them directly to change what a scaffolded project looks like.

## The scaffold server route

**Location:** `apps/server/src/routes/setup/routes/scaffold-starter.ts`

**Endpoint:** `POST /api/setup/scaffold-starter`

**Request body:**

| Field         | Type                                                   | Required | Description                                            |
| ------------- | ------------------------------------------------------ | -------- | ------------------------------------------------------ |
| `projectPath` | `string`                                               | Yes      | Absolute or relative path to the destination directory |
| `kitType`     | `'docs' \| 'portfolio' \| 'landing-page' \| 'general'` | Yes      | Which starter kit to scaffold                          |
| `projectName` | `string`                                               | No       | Overrides the name derived from the directory basename |

**Response:**

```typescript
{
  success: boolean;
  outputDir: string;      // resolved absolute path
  filesCreated: string[]; // top-level entries created
  error?: string;
}
```

The route:

1. Validates `projectPath` and `kitType`
2. Creates the target directory if it doesn't exist
3. Resolves symlinks and checks against `ALLOWED_ROOT_DIRECTORY` (env var) to block path traversal
4. Derives `projectName` from the directory basename if not provided
5. Delegates to the matching scaffold function from `@protolabsai/templates`

Note: `kitType: 'extension'` is not accepted by this endpoint. The browser extension kit uses `git clone` and is handled separately.

## The UI template registry

**Location:** `apps/ui/src/lib/templates.ts`

Defines the `StarterTemplate` interface and the `starterTemplates` array that the New Project dialog consumes.

```typescript
interface StarterTemplate {
  id: string;
  name: string;
  description: string;
  source: 'scaffold' | 'clone';
  kitType?: 'docs' | 'portfolio' | 'landing-page'; // for scaffold source
  repoUrl?: string; // for clone source
  techStack: string[];
  features: string[];
  category: 'fullstack' | 'frontend' | 'backend' | 'ai' | 'other';
  author: string;
}
```

The `source` field determines how the UI provisions the project:

- `scaffold` — sends `POST /api/setup/scaffold-starter` with `kitType`
- `clone` — runs `git clone repoUrl` at the target path

Helper functions:

```typescript
getTemplateById(id: string): StarterTemplate | undefined
getTemplatesByCategory(category: StarterTemplate['category']): StarterTemplate[]
```

## Scaffold flow end-to-end

When a user creates a project from the New Project dialog:

```
1. User selects a template in new-project-modal.tsx
2. UI reads template.source
   ├── 'scaffold' → POST /api/setup/scaffold-starter { projectPath, kitType, projectName }
   │     └── Server calls scaffoldDocsStarter / scaffoldPortfolioStarter / scaffoldLandingPageStarter / scaffoldGeneralStarter
   │           └── copyDir(starters/<kit>/, outputDir) + applySubstitutions()
   └── 'clone'    → git clone <repoUrl> <projectPath>
3. On success, Studio opens the new project
```

## Related files

| File                                                      | Purpose                                                |
| --------------------------------------------------------- | ------------------------------------------------------ |
| `libs/templates/src/scaffold.ts`                          | Scaffold functions and file I/O                        |
| `libs/templates/src/types.ts`                             | `StarterKitType`, `ScaffoldOptions`, and related types |
| `libs/templates/starters/`                                | Source files for each local scaffold kit               |
| `apps/server/src/routes/setup/routes/scaffold-starter.ts` | HTTP endpoint                                          |
| `apps/ui/src/lib/templates.ts`                            | UI template registry                                   |
| `apps/ui/src/components/dialogs/new-project-modal.tsx`    | New Project dialog                                     |
