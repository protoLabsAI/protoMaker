# Documentation philosophy

This page explains why we write documentation the way we do. It covers the Diataxis framework we follow, the information architecture principles behind our doc structure, and the content guidelines every page should meet. Use this as a reference when deciding how to write something new or restructure something existing.

## Why Diataxis

We structure documentation using the [Diataxis framework](https://github.com/evildmp/diataxis-documentation-framework) — a principled approach to technical documentation that recognizes four distinct user needs, each requiring a different kind of writing.

Most documentation problems come from mixing these needs on a single page. A tutorial that stops to explain architecture loses the learner mid-flow. A reference page with tutorial narrative wastes the expert's time. A how-to guide that teaches concepts instead of giving steps fails both the teacher and the reader. Diataxis gives us language for diagnosing that problem and fixing it.

The framework divides all documentation into four types:

| Type             | User goal          | Characteristic                                                  |
| ---------------- | ------------------ | --------------------------------------------------------------- |
| **Tutorial**     | Learn by doing     | Linear, guided, guaranteed success. The learner has no choices. |
| **How-to guide** | Accomplish a task  | Steps only. Assumes knowledge. No detours into explanation.     |
| **Reference**    | Look something up  | Complete, accurate, terse. Organized for scanning, not reading. |
| **Explanation**  | Understand the why | Conceptual, narrative. No instructions. This page is one.       |

The test for each type is simple: if you can describe what a user is trying to accomplish when they read the page, and that description matches one of the four above, the page is well-typed. If it matches two or more, split it.

## How we map Diataxis to our site

Our information architecture corresponds to Diataxis types:

| Diataxis type | Where it lives                                           |
| ------------- | -------------------------------------------------------- |
| Tutorials     | `getting-started/` — learning-oriented, first-time setup |
| How-to guides | `agents/`, `integrations/`, `protolabs/` — task-focused  |
| Reference     | `server/`, env var tables, API docs                      |
| Explanation   | `authority/`, `dev/` — conceptual, including this page   |

We apply this mapping loosely. The point is not to enforce perfect type purity in every case — it's to avoid mixing types. If a page in `agents/` drifts toward explaining architecture instead of giving steps, that's a problem to fix, not a philosophical question to debate.

## Information architecture principles

These principles were established during the 2026-02-12 docs restructuring and define the shape of our documentation site.

**Zero orphan pages.** Every `.md` file must appear in the sidebar for its section. The `generateSidebar()` function auto-discovers files from directories, so placing a file in the right section is sufficient — but every file needs to be in a section.

**Task-oriented sections, not code-mirror sections.** Sections are organized by what users need to do, not by how the codebase is structured. The exception is `server/`, which is intentionally reference-oriented.

**5–7 top-level nav items.** Currently five in the main nav bar plus five in "More". Adding more top-level sections requires consolidating existing ones first.

**Two levels of nesting max.** The standard is `section/page.md`. We do not use `section/subsection/page.md`. Use flat directories with descriptive filenames instead.

**Every section has an `index.md`.** This is the landing page for the section. It overviews what the section covers and links to the key pages within it.

**`archived/` is a graveyard, not staging.** Move docs there only when fully superseded. The build excludes archived pages via `srcExclude: ['archived/**']`.

## Two documentation surfaces

We have two completely separate documentation surfaces with different audiences and purposes:

**External VitePress site** (`docs/`) — Public-facing product documentation. Deployed statically. Audience: developers and operators adopting protoLabs. Content: tutorials, how-to guides, API reference, getting-started material. The full standard for this surface is in `./docs-standard.md`.

**Internal docs via in-app viewer** (`docs/internal/`) — Internal development documentation for the automaker team, browsed and edited through the in-app docs viewer. Audience: contributors, operators, the automaker team. Content: architecture decisions, runbooks, internal APIs, processes. This page lives here.

The rule for deciding where something belongs: if the audience is someone _using_ protoLabs, it goes in `docs/`. If the audience is someone _building_ protoLabs, it goes in `docs/internal/`.

## Content principles

These seven principles govern how individual pages are written. They apply to all types and both surfaces.

**Code before prose.** Show the snippet first, explain it second. Developers pattern-match on code faster than they parse paragraphs. If you find yourself writing two paragraphs before the first code block, the order is wrong.

**Outcome-focused headings.** Headings are verb phrases that say what the user will accomplish: "Configure webhooks", "Set up GitHub integration". Not "Webhook Configuration" or "The Webhook System". The heading describes an action the reader is about to take, not a component the system contains.

**One idea per sentence.** Short sentences. Active verbs. Second person ("you configure", not "the user configures"). If a sentence has more than one clause, it can usually be two sentences.

**Orientation at the top of every page.** One paragraph, before any sections: what this page covers, who it's for, what they'll have when they're done. The opening of this page is an example.

**Progressive disclosure.** Show the simplest case first. Edge cases, advanced options, and configuration variations come after the happy path works. Readers who only need the basics finish fast; readers who need more can keep going.

**Realistic examples.** Use plausible names and values. `featureId: "auth-login-flow"` not `id: "foo"`. `projectPath: "/home/dev/my-app"` not `path: "/x"`. Realistic examples build intuition; toy examples build confusion.

**No marketing language.** Any sentence that could appear in a product deck — "powerful", "seamless", "game-changing" — does not belong in documentation. State what the system does. Let readers draw their own conclusions.

## Page structure

Every page follows this template:

```markdown
# [Outcome-focused title]

[One paragraph: what this covers, who it's for, what they'll have after reading]

## Prerequisites (only if non-trivial — omit for simple pages)

## [Verb-phrase heading]

[Code first, then brief explanation]

## Next steps (optional)

- **[Related page](./related)** — Why they should read it
```

Page length targets:

| Type      | Target        | Notes                             |
| --------- | ------------- | --------------------------------- |
| Landing   | 20–50 lines   | Overview and links                |
| Guide     | 100–400 lines | Complete walkthrough of one topic |
| Reference | 200–600 lines | Comprehensive but scannable       |
| Maximum   | 800 lines     | Split into sub-pages beyond this  |

## Voice in practice

Our documentation voice follows the brand: technical, direct, pragmatic, and opinionated. In practice this means:

- **Technical, not approachable.** We write for builders. Assume the reader knows what a CRDT is, what a webhook does, what TypeScript generics are. When in doubt, assume knowledge.
- **Direct, not hedged.** "Do X" not "You might want to consider doing X". "This works best when..." not "In some cases, depending on your situation..."
- **Specific, not vague.** "Runs every 15 minutes" not "runs periodically". "Returns `null`" not "may return a falsy value".
- **Opinionated.** When there's a right way to do something, say so. When a trade-off exists, explain both sides and state which we prefer and why. Neutrality is rarely helpful.

What we never write:

- Generic capability lists ("it supports X, Y, and Z") without showing what X, Y, and Z actually do
- Warnings that don't say what will go wrong or how to avoid it
- Instructions that depend on state ("first, ensure that...") without explaining how to create that state
- `foo`/`bar`/`baz` in examples

## Related

- **[Documentation standard](./docs-standard.md)** — Naming conventions, IA rules, VitePress config reference, and maintenance procedures
- **[Diataxis framework](https://github.com/evildmp/diataxis-documentation-framework)** — The upstream framework our approach is based on
