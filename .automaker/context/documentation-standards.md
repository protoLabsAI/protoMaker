# Documentation Standards

Rules for writing and updating documentation in this project. Applies to both VitePress site docs (`docs/`) and in-app project docs.

## Diataxis — Know Your Content Type

Before writing, identify which type your page is. Never mix types.

| Type | Test | If you catch yourself... |
|------|------|--------------------------|
| **Tutorial** | "Follow along and build X" | ...explaining architecture → split to Explanation page |
| **How-to** | "Do X in 5 steps" | ...teaching concepts → split to Tutorial or Explanation |
| **Reference** | "Here are all the options for X" | ...writing narrative → you're in Explanation territory |
| **Explanation** | "Here's why X works this way" | ...writing steps → you're in How-to territory |

## Writing Rules

1. **Code first, prose second.** Every section that involves code shows the snippet before the explanation.
2. **Outcome-focused headings.** Use verb phrases: "Configure webhooks", "Set up GitHub integration". Not "Webhook Configuration" or "The Webhook System".
3. **One paragraph orientation at the top.** Every page starts with: what it covers, who it's for, what you'll have after reading.
4. **Short sentences, active voice, second person.** "You create a feature" not "A feature is created by the user".
5. **No marketing language.** Zero adjectives like "powerful", "seamless", "robust". State what it does, not how impressive it is.
6. **Realistic examples.** Use plausible names: `featureId: "auth-login-flow"` not `id: "foo"`. Use `projectPath: "/home/dev/my-app"` not `path: "/x"`.
7. **Progressive disclosure.** Simple case first. Advanced config, edge cases, and options come after the happy path.
8. **Tables for structured data.** Parameters, config options, env vars, status codes — always tables, never prose lists.
9. **No duplicate content.** If it's documented elsewhere, link to it. One canonical source per concept.

## Page Structure

```markdown
# [Outcome-Focused Title]

[One paragraph: what this covers, who it's for, what you'll have after reading]

## Prerequisites (only if non-trivial — skip for simple pages)

## [Verb-phrase heading]

[Code block]

[1-3 sentences explaining what the code does]

## [Next verb-phrase heading]

...

## Next steps (optional — 1-2 links to where to go next)
```

## File Conventions

- Filenames: `kebab-case.md` always
- Headings: Sentence case ("Getting started" not "Getting Started")
- Max 800 lines per page — split if longer
- Cross-section links: root-relative (`/agents/architecture`)
- Same-section links: relative (`./architecture`)
- Code blocks: always specify language (` ```typescript `, ` ```bash `)

## Two Documentation Surfaces

| Surface | Location | Audience | When to Write Here |
|---------|----------|----------|-------------------|
| **Public docs** | `docs/` | End users, developers adopting protoLabs | Tutorials, how-to guides, API reference, getting started |
| **Internal docs** | `docs/internal/` | Automaker team, contributors, operators | Architecture decisions, runbooks, internal APIs, team processes |

The in-app docs viewer is the interface for internal docs — its `docsPath` points to `docs/internal/`. Internal docs are browsable and editable directly within protoLabs Studio.

**Rule of thumb:** If the audience is someone using protoLabs, it's public (`docs/`). If the audience is someone building protoLabs, it's internal (`docs/internal/`).

## When Updating Docs

- New service → add a page in `server/` (public) or `docs/internal/` (if internal-only)
- New config option → add to the relevant env var table
- New API route → add to server reference
- Changed behavior → update the existing page, don't create a new one
- Removed feature → delete the page, update `docs/README.md`
- Architecture decision → `docs/internal/` (viewable in-app)
- Operational runbook → `docs/internal/` (viewable in-app)

## Common Mistakes

- Writing a tutorial that's actually a reference page (wall of config options with no guided path)
- Writing a how-to that teaches concepts instead of giving steps
- Using `foo`/`bar`/`baz` in examples instead of realistic values
- Forgetting the orientation paragraph at the top
- Putting explanation prose in a reference table's description column
