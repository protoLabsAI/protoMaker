# Add a new starter kit

This guide explains how to add a new local scaffold template to the protoLabs starter kit system. Follow these steps when you want a new kit type to appear in the New Project dialog and be available via `npx create-protolab`.

This guide covers adding a **scaffold** kit (files copied from a local directory). For a **clone** kit (provisioned via `git clone`), see [Register a clone-based kit](#register-a-clone-based-kit) at the end.

## Prerequisites

- Access to the `automaker` monorepo
- Basic familiarity with the [template system architecture](./architecture)

## Steps

### 1. Create the starter source directory

Add a new directory under `libs/templates/starters/` with your kit name:

```bash
mkdir -p libs/templates/starters/my-kit
```

Put the project files you want to ship inside it. The entire directory will be copied verbatim to the user's output path, except `node_modules/` and `package-lock.json` (those are always skipped).

**Required files:**

- `package.json` — the `name` field will be replaced with the user's project name at scaffold time

**Recommended files:**

- `.automaker/CONTEXT.md` — agent context file loaded into every prompt for this project
- `.automaker/coding-rules.md` — stack-specific conventions for the agent
- `.github/workflows/ci.yml` — CI pipeline for the project

**Example structure:**

```
libs/templates/starters/my-kit/
├── .automaker/
│   ├── CONTEXT.md
│   └── coding-rules.md
├── .github/
│   └── workflows/
│       └── ci.yml
├── src/
│   └── index.ts
├── package.json
└── tsconfig.json
```

### 2. Add the scaffold function

Open `libs/templates/src/scaffold.ts` and add a new exported function following the existing pattern:

```typescript
/**
 * Scaffold a new **my-kit** starter at `options.outputDir`.
 *
 * Copies `starters/my-kit/` to the output directory, substituting
 * `projectName` into package.json.
 */
export async function scaffoldMyKitStarter(options: ScaffoldOptions): Promise<ScaffoldResult> {
  const { projectName, outputDir } = options;
  const filesCreated: string[] = [];

  try {
    const starterDir = resolveStarterDir('my-kit');
    await copyDir(starterDir, outputDir);
    await applySubstitutions(outputDir, projectName);

    const entries = await fs.readdir(outputDir);
    filesCreated.push(...entries.map((e) => path.join(outputDir, e)));

    return { success: true, outputDir, filesCreated };
  } catch (error) {
    return {
      success: false,
      outputDir,
      filesCreated,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
```

Update `resolveStarterDir` to accept your new kit name by adding it to the union type:

```typescript
function resolveStarterDir(kitName: 'docs' | 'portfolio' | 'general' | 'my-kit'): string {
```

### 3. Add the kit type to `StarterKitType`

Open `libs/templates/src/types.ts` and add your kit name to the union:

```typescript
export type StarterKitType = 'docs' | 'portfolio' | 'extension' | 'general' | 'my-kit';
```

### 4. Register the kit in the server route

Open `apps/server/src/routes/setup/routes/scaffold-starter.ts`.

Add `'my-kit'` to the validation check and the scaffolders map:

```typescript
// Validation
if (!kitType || !['docs', 'portfolio', 'general', 'my-kit'].includes(kitType)) {
  // ...
}

// Scaffolders map
const scaffolders = {
  docs: scaffoldDocsStarter,
  portfolio: scaffoldPortfolioStarter,
  general: scaffoldGeneralStarter,
  'my-kit': scaffoldMyKitStarter, // add this
};
```

Update the import at the top:

```typescript
import {
  scaffoldDocsStarter,
  scaffoldPortfolioStarter,
  scaffoldGeneralStarter,
  scaffoldMyKitStarter, // add this
} from '@protolabsai/templates';
```

Also update the `ScaffoldStarterRequest` type in the same file:

```typescript
interface ScaffoldStarterRequest {
  projectPath: string;
  kitType: 'docs' | 'portfolio' | 'general' | 'my-kit'; // add your kit
  projectName?: string;
}
```

### 5. Register the template in the UI

Open `apps/ui/src/lib/templates.ts` and add an entry to `starterTemplates`:

```typescript
{
  id: 'my-kit',
  name: 'My Kit',
  description: 'Short description shown in the New Project dialog.',
  source: 'scaffold',
  kitType: 'my-kit',
  techStack: ['TypeScript', 'Node.js'],
  features: [
    'Feature one',
    'Feature two',
  ],
  category: 'backend',  // 'fullstack' | 'frontend' | 'backend' | 'ai' | 'other'
  author: 'protoLabs',
},
```

### 6. Build and verify

```bash
# Rebuild the templates package
npm run build --workspace=libs/templates

# Rebuild the server
npm run build:server

# Run typecheck
npm run typecheck
```

Test the scaffold via the server route:

```bash
curl -X POST http://localhost:3000/api/setup/scaffold-starter \
  -H 'Content-Type: application/json' \
  -d '{"projectPath": "/tmp/my-kit-test", "kitType": "my-kit", "projectName": "test-project"}'
```

Verify the output directory contains your starter files with the project name substituted.

### 7. Add documentation

Add a page at `docs/templates/my-kit-starter.md` documenting the kit. Follow the pattern of [docs-starter.md](./docs-starter) and [portfolio-starter.md](./portfolio-starter).

Update `docs/templates/index.md` to include the new kit in the available kits table.

---

## Register a clone-based kit

If your kit requires native build scripts or toolchain setup that makes local file copying impractical, register it as a clone-based template instead.

Clone-based templates are provisioned via `git clone` and do not require changes to the server route or the `@protolabsai/templates` package. You only need to:

1. Push the template repository to GitHub (e.g., `https://github.com/protoLabsAI/my-kit-template`)
2. Add the entry to `apps/ui/src/lib/templates.ts` with `source: 'clone'` and `repoUrl`:

```typescript
{
  id: 'my-kit',
  name: 'My Kit',
  description: 'Short description.',
  source: 'clone',
  repoUrl: 'https://github.com/protoLabsAI/my-kit-template',
  techStack: ['WXT', 'TypeScript'],
  features: ['Feature one', 'Feature two'],
  category: 'frontend',
  author: 'protoLabs',
},
```

The UI handles the rest. No `kitType` field is needed for clone-based templates.

## Related pages

- [Architecture: how the template system works](./architecture)
- [Starter Kits overview](./index)
