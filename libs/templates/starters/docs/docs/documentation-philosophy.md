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

This starter kit ships with the same sidebar structure. Replace the placeholder pages with your own content and keep each page in the correct quadrant.

---

## Writing principles

### Code before prose

Show the code first. Explain it after, in one to three sentences. Readers scan for code blocks first — if the code is buried in a paragraph, they miss it.

```bash
# Start the dev server
npm run dev
```

Open [localhost:4321](http://localhost:4321) in your browser. The live-reload server rebuilds on every file save.

### One idea per sentence

Long sentences with multiple clauses slow readers down and make translation harder. Each sentence should carry one idea.

**Avoid:**
> The sidebar is generated automatically from the directory structure inside `src/content/docs/`, which means you never need to update a list by hand when adding new pages.

**Prefer:**
> The sidebar mirrors the directory structure inside `src/content/docs/`. Add a file and it appears automatically — no list to maintain.

### Progressive disclosure

Lead with the simplest, most common case. Put advanced options, edge cases, and caveats at the bottom of the page or on a separate page.

Readers who want the defaults should be unblocked by the first code block. Readers who want to customise can keep reading.

### Outcome-focused headings

Headings are navigation aids, not labels. Use verb phrases that describe what the reader will achieve.

| Avoid | Prefer |
|-------|--------|
| Sidebar configuration | Configure the sidebar |
| Authentication | Add GitHub OAuth |
| Environment variables | Set up your .env file |

### Every page opens with orientation

The first paragraph of every page answers three questions:

1. What does this page cover?
2. Who is it for?
3. What will the reader have or know after reading it?

One paragraph is enough. Skip it and readers don't know if they're in the right place.

### No marketing language

Describe what something does, not how impressive it is. Readers are engineers. They will notice and distrust adjectives like "powerful", "seamless", and "robust".

**Avoid:** "The powerful built-in search gives your users a seamless discovery experience."

**Prefer:** "Pagefind indexes your site at build time. Search results appear in under 50 ms with no server required."

---

## Time to First Hello World (TTFHW)

TTFHW is the single number that tells you if your getting-started docs are working. It measures the elapsed time from "I found this project" to "I have something running on my machine."

A good TTFHW is under five minutes. The getting-started tutorial in this starter kit targets three minutes.

**What kills TTFHW:**

- Prerequisites buried halfway through the page
- Steps that assume context the reader doesn't have
- A missing `npm install` between two other steps
- Placeholder values that look like real values (e.g., `API_KEY=abc123`)

**What helps TTFHW:**

- Prerequisites listed at the top, with version numbers
- One command per step, with expected output shown
- A checkpoint after each step ("You should see X in the terminal")
- A working demo at the end — not just a build, something the reader can interact with

Run through your own tutorial from scratch, in an empty directory, with a timer. That number is your TTFHW. Optimise it before anything else.
