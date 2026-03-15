# Documentation philosophy

This page explains how this starter kit approaches documentation structure and writing. It covers the Diataxis framework, the protoLabs writing principles built on top of it, and the single metric that tells you if your docs are working.

## The Diataxis framework

[Diataxis](https://diataxis.fr) divides documentation into four distinct content types. Each type serves a different user need. Mixing them in a single page produces content that serves none of them well.

| Type | Question it answers | Structure |
|------|---------------------|-----------|
| **Tutorial** | "Can you show me how to do this for the first time?" | Narrative walkthrough — the reader follows along and builds something |
| **How-to guide** | "How do I accomplish X?" | Numbered steps — assumes competence, delivers a result |
| **Reference** | "What are all the options?" | Structured facts — complete, accurate, terse |
| **Explanation** | "Why does it work this way?" | Discursive prose — context, reasoning, trade-offs |

### Recognising the wrong type

The most common mistake is blending types. Use these tests:

- If you are explaining concepts inside a how-to guide, extract the explanation to a separate page and link to it.
- If your tutorial contains a table of every configuration option, move the table to reference and link to it.
- If your reference page has a narrative section at the top, it should be its own explanation page.

### How protoLabs implements Diataxis

The canonical example is [docs.protolabs.studio](https://docs.protolabs.studio). The sidebar mirrors the four quadrants:

- **Tutorials** → `Getting started` section (build something real in under 10 minutes)
- **How-to guides** → `Guides` section (task-focused, numbered steps)
- **Reference** → `Reference` section (API, config options, event types)
- **Explanation** → `Concepts` section (architecture decisions, design rationale)

For a portfolio site, the Diataxis lens applies to any project case studies, blog posts, or README files you write. A case study is an explanation — it answers "why did you make these decisions?" A setup guide is a how-to — it answers "how do I configure X?"

---

## Writing principles

### Code before prose

Show the code first. Explain it after, in one to three sentences. Readers scan for code blocks first — if the code is buried in a paragraph, they miss it.

```bash
# Add a new project entry
touch src/content/projects/my-project.md
```

Populate the frontmatter, then add the body content. The project appears on the `/projects` page automatically.

### One idea per sentence

Long sentences with multiple clauses slow readers down and make translation harder. Each sentence should carry one idea.

**Avoid:**
> Content Collections enforce frontmatter schemas at build time using Zod, which means you get type errors in your editor when you omit required fields like `title` or `pubDate`.

**Prefer:**
> Content Collections validate frontmatter at build time using Zod. Omit a required field like `title` or `pubDate` and Astro reports a type error before the build completes.

### Progressive disclosure

Lead with the simplest, most common case. Put advanced options, edge cases, and caveats at the bottom of the page or on a separate page.

Readers who want to add a blog post should be unblocked by the first code block. Readers who want to customise the collection schema can keep reading.

### Outcome-focused headings

Headings are navigation aids, not labels. Use verb phrases that describe what the reader will achieve.

| Avoid | Prefer |
|-------|--------|
| Blog posts | Add a blog post |
| Project data | Update your project list |
| Testimonials | Add a testimonial |

### Every page opens with orientation

The first paragraph of every page answers three questions:

1. What does this page cover?
2. Who is it for?
3. What will the reader have or know after reading it?

One paragraph is enough. Skip it and readers don't know if they're in the right place.

### No marketing language

Describe what something does, not how impressive it is. Readers are engineers. They will notice and distrust adjectives like "powerful", "seamless", and "robust".

**Avoid:** "The powerful Content Collections system provides a seamless, type-safe content authoring experience."

**Prefer:** "Content Collections validate frontmatter at build time. Add a field to the Zod schema and Astro enforces it across every file in the collection."

---

## Time to First Hello World (TTFHW)

TTFHW is the single number that tells you if your getting-started docs are working. It measures the elapsed time from "I found this project" to "I have something running on my machine."

A good TTFHW is under five minutes. For a portfolio starter, the target is:

1. `npm install` — under 60 seconds
2. `npm run dev` — under 10 seconds
3. See the personalised site with your name — under 2 minutes total

**What kills TTFHW:**

- Prerequisites buried halfway through the page
- Requiring users to set up external accounts (CMS, database) before the dev server starts
- Placeholder values that look like real values (e.g., `SITE_URL=https://yoursite.com`)
- Missing a step like "update `main.json` with your name before you'll see real content"

**What helps TTFHW:**

- A single `npm install && npm run dev` that shows a working site immediately
- Placeholder content that looks intentionally placeholder (clear it before you ship)
- A checklist at the top of the README: "Before you publish, do these three things"

Run through your own setup from scratch, in an empty directory, with a timer. That number is your TTFHW. Optimise it before anything else.
