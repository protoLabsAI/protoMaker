# Dependency Reuse — Check Before You Add

Before adding ANY new npm dependency, you MUST search the existing codebase for an equivalent solution already in use.

## Rule

**Never add a new dependency when the codebase already has a library that solves the same problem.**

## Process

1. **Identify the need.** What capability do you need? (e.g., markdown rendering, date formatting, state management)
2. **Search `package.json` files.** Check root and all workspace `package.json` files for existing packages that cover the same domain.
3. **Search the codebase for usage.** Look for how the existing solution is used — grep for imports, check component patterns.
4. **Reuse what exists.** Adapt the existing library/component to your needs rather than adding a parallel solution.

## Common Existing Solutions

| Need | Existing Solution | Do NOT Add |
|------|------------------|------------|
| Rich text editor | TipTap (`@tiptap/*`) — see `apps/ui/src/components/views/notes-view/` | `react-markdown`, `remark-gfm`, `marked`, `markdown-it` |
| Markdown rendering | TipTap in read-only mode (`editable: false`) | `react-markdown`, `remark-*` plugins |
| Date formatting | Native `Intl.DateTimeFormat` or existing utils | `moment`, `dayjs` (unless already present) |
| HTTP client | `getHttpApiClient()` from `@/lib/http-api-client` | `axios`, `got`, `node-fetch` |
| State management | Zustand (`apps/ui/src/store/`) | `redux`, `mobx`, `jotai` |
| Form handling | Native React state + controlled components | `react-hook-form`, `formik` |
| CSS | Tailwind CSS 4 | `styled-components`, `emotion` |
| Icons | `lucide-react` | `react-icons`, `heroicons` |
| Logging | `createLogger()` from `@protolabsai/utils` | `winston`, `pino`, `bunyan` |
| Testing | Vitest (unit), Playwright (E2E) | `jest`, `mocha`, `cypress` |

## Why This Matters

- Every new dependency is a maintenance burden, security surface, and bundle size cost
- Parallel solutions for the same problem create inconsistency and confusion
- The codebase is greenfield — we pick ONE tool per job and use it everywhere
