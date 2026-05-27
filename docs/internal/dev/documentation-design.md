# Documentation Design

Documentation follows the [Diataxis framework](https://diataxis.fr/) — four content types, each serving a distinct user need. Never mix types on a single page.

| Type             | User Goal          | Where It Lives                           | Key Rule                                           |
| ---------------- | ------------------ | ---------------------------------------- | -------------------------------------------------- |
| **Tutorial**     | Learn by doing     | `getting-started/`                       | Linear, guided, guaranteed success. No choices.    |
| **How-to Guide** | Accomplish a task  | `agents/`, `integrations/`, `protolabs/` | Steps only. Assumes knowledge. No explanation.     |
| **Reference**    | Look something up  | `server/`, env var tables, API docs      | Complete, accurate, terse. Organized for scanning. |
| **Explanation**  | Understand the why | `authority/`, `dev/`                     | Conceptual, narrative. No instructions.            |

**If a page tries to be two types at once, it fails at both.** A tutorial that stops to explain architecture loses the learner. A reference page with tutorial narrative wastes the expert's time. Split mixed pages.

### Content Principles

1. **Code before prose.** Show the snippet first, explain it second. Developers pattern-match on code faster than they read paragraphs.
2. **Outcome-focused headings.** "Accept a payment" not "PaymentIntent API". Lead with what the user accomplishes, not what the component is named.
3. **One idea per sentence.** Short sentences. Active verbs. Second person ("you").
4. **Every page opens with orientation.** One paragraph: what this page covers, who it's for, what they'll have after reading it.
5. **Progressive disclosure.** Show the simplest case first. Advanced options, edge cases, and configuration come after.
6. **Realistic examples.** Use plausible variable names and data shapes. `featureId: "auth-login-flow"` not `id: "abc"`.
7. **No marketing language.** Any sentence that could appear in a sales deck does not belong in technical documentation.

### Page Template

Every documentation page follows this structure:

```markdown
# [Outcome-Focused Title]

[One paragraph: what this covers, who it's for, what you'll have after reading]

## Prerequisites (only if non-trivial)

## [Verb-phrase section heading: "Configure X", "Set up Y"]

[Code first, then explanation]

## Next steps (optional)

- **[Related Page](./related)** — Why they should read it next
```

### Key Metric: Time to First Hello World (TTFHW)

The single most important documentation metric. Measures: time from a new user's first contact with docs to their first successful result (agent running, feature created, etc.). Every quickstart decision should minimize this number. Target: under 5 minutes.

### Two Documentation Surfaces

1. **External VitePress site** (`docs/`) — Public-facing product documentation. Deployed statically. See `docs/dev/docs-standard.md` for the full standard (naming, IA, maintenance procedures, VitePress config).
2. **Internal docs via in-app viewer** (`docs/internal/`) — Internal development documentation for the automaker team, viewed and edited through the in-app docs viewer. Architecture decisions, operational runbooks, internal APIs, team processes. NOT included in the public VitePress build. The in-app docs viewer's `docsPath` setting points here (`docs/internal`), making internal docs browsable and editable directly within protoLabs Studio.

### Documentation Surfaces Are Not the Same

| Surface       | Audience                                 | Location            | Content Type                                 |
| ------------- | ---------------------------------------- | ------------------- | -------------------------------------------- |
| Public docs   | End users, developers adopting protoLabs | `docs/` (VitePress) | Tutorials, how-to guides, API reference      |
| Internal docs | Automaker team, contributors, operators  | `docs/internal/`    | Architecture, runbooks, decisions, processes |

The in-app docs viewer is the interface for internal docs. A page about "how to deploy to staging" is internal. A page about "how to set up auto-mode" is public.
