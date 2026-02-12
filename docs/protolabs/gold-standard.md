# ProtoLabs Gold Standard

The complete technical standard that every ProtoLabs-managed project is measured against. Derived from production codebases: Automaker, rabbit-hole.io, rogue-borg, rpg-mcp.

## Standard Matrix

| Layer                 | Standard                                                                   | Source                           | Severity             |
| --------------------- | -------------------------------------------------------------------------- | -------------------------------- | -------------------- |
| **Monorepo**          | pnpm + Turborepo, `apps/` + `packages/` (or `libs/`)                       | All repos                        | Critical             |
| **Frontend**          | React 19 + Next.js 15, app router                                          | rabbit-hole, rogue-borg, rpg-mcp | Recommended          |
| **UI**                | Tailwind CSS 4 + shadcn/ui + Radix primitives                              | rabbit-hole                      | Recommended          |
| **Components**        | Storybook 10+ (nextjs-vite adapter), subpath aliases                       | rabbit-hole, rpg-mcp             | Recommended          |
| **Testing**           | Vitest (unit/integration) + Playwright (E2E)                               | All repos                        | Critical             |
| **Linting**           | ESLint 9 flat config + typescript-eslint strict                            | All repos                        | Recommended          |
| **Formatting**        | Prettier                                                                   | Automaker                        | Recommended          |
| **Type Safety**       | TypeScript 5.5+ strict, composite tsconfig per package                     | All repos                        | Critical             |
| **CI/CD**             | GitHub Actions (build, test, format, audit, CodeRabbit), branch protection | Automaker                        | Critical             |
| **CMS/DB**            | Payload CMS 3.x + PostgreSQL (when DB needed)                              | rogue-borg                       | Optional             |
| **Agent**             | Claude Agent SDK or LangGraph, separate agent package/app                  | rpg-mcp, rogue-borg              | Optional             |
| **MCP**               | Domain-specific MCP servers in `packages/`                                 | rpg-mcp, rogue-borg              | Optional             |
| **Microservices**     | Python (FastAPI/Flask) for ML/AI services alongside Node monorepo          | rabbit-hole                      | Optional             |
| **Package namespace** | `@{project}/*` workspace prefix                                            | All repos                        | Critical             |
| **Automation**        | `.automaker/` + `.beads/` + Discord project channels                       | Automaker                        | Critical/Recommended |
| **Git workflow**      | Squash-only, branch protection, Graphite stacking                          | Automaker                        | Critical             |

## Severity Levels

- **Critical**: Agents can't work effectively without these. Must fix before delegation.
- **Recommended**: Needed for full ProtoLabs automation and quality guarantees.
- **Optional**: Nice to have, depends on project type and needs.

## Configuration Override

Projects can opt out of specific checks via `protolab.config`:

```json
{
  "standard": {
    "skip": ["storybook", "payload"],
    "additional": []
  }
}
```

## Future Enhancements

### Semantic Versioning

We need to decide on a versioning strategy for both Automaker itself and for projects managed by ProtoLabs. The two leading candidates:

**Option A: Changesets**

- `@changesets/cli` for automated version management
- Each PR includes a changeset file describing the change and its semver impact
- `changeset version` bumps all affected packages
- `changeset publish` publishes to npm (if applicable)
- Best for: monorepos publishing multiple packages to npm

**Option B: Semantic Release**

- `semantic-release` with conventional commits
- Commit messages drive versioning (`feat:` = minor, `fix:` = patch, `BREAKING CHANGE:` = major)
- Fully automated — no manual changeset files
- Best for: single-package repos or monorepos with a single release cadence

**Current thinking**: Changesets for Automaker (multiple published packages), semantic-release for client projects (simpler, fewer packages). This will be evaluated and standardized as part of the gold standard.

**Status**: Future enhancement. Not blocking current setup pipeline. Will be added as a gap check once the strategy is finalized.
