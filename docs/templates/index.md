---
outline: deep
---

# Starter Kits

protoLabs ships two starter kits for common project types. Each kit includes a pre-configured project scaffold, a `.automaker/CONTEXT.md` agent context file, and a board pre-loaded with initial features.

## Available kits

| Kit                              | Stack                              | Use case                                             |
| -------------------------------- | ---------------------------------- | ---------------------------------------------------- |
| [Docs](./docs-starter)           | Astro + Starlight + Tailwind CSS 4 | Documentation sites, API references, knowledge bases |
| [Portfolio](./portfolio-starter) | Astro + React + Tailwind CSS 4     | Personal sites, marketing pages, project showcases   |

## Scaffold a starter

**Via CLI:**

```bash
npx create-protolab
```

Select a kit type when prompted. The CLI copies the starter into the current directory, substitutes your project name, and creates initial board features.

**Via UI:**

Open the New Project dialog in the protoLabs Studio board. Select a kit type from the template dropdown. The UI runs the same scaffold logic as the CLI.

## What the scaffold creates

Every kit scaffold produces:

- A ready-to-run project directory with all dependencies listed
- `.automaker/CONTEXT.md` — loaded into every agent prompt for that project
- `.automaker/coding-rules.md` — stack-specific coding conventions
- `.github/workflows/ci.yml` — CI pipeline targeting Cloudflare Pages
- A set of initial board features (configure CI, write README, add first content, etc.)

Run `npm install` inside the scaffolded directory before starting the dev server.

## Next steps

- [Create a documentation site](./docs-starter)
- [Create a portfolio site](./portfolio-starter)
