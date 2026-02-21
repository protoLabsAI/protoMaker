# Documentation Standard

Rules and conventions for maintaining the protoLabs documentation site. This is the source of truth for how docs are structured, written, and maintained.

## Information Architecture

### Section Map

Every documentation page must belong to one of these 8 top-level sections:

| Section          | Path               | Purpose                                  | Audience         |
| ---------------- | ------------------ | ---------------------------------------- | ---------------- |
| Getting Started  | `getting-started/` | First-time setup, concepts, installation | New users        |
| Agents           | `agents/`          | Agent system guides and deep dives       | Users + devs     |
| Infrastructure   | `infra/`           | Deployment, Docker, CI/CD, monitoring    | DevOps           |
| Integrations     | `integrations/`    | External tool connections (MCP, Discord) | Users + devs     |
| Server Reference | `server/`          | Backend API reference and internals      | Developers       |
| Authority        | `authority/`       | Trust hierarchy, roles, team structure   | Team leads       |
| Development      | `dev/`             | Contributing, architecture, processes    | Contributors     |
| protoLabs        | `protolabs/`       | Agency setup pipeline and onboarding     | Agency operators |

**Special locations:**

| Path            | Purpose                                               |
| --------------- | ----------------------------------------------------- |
| `index.md`      | Homepage (VitePress `layout: home`)                   |
| `README.md`     | GitHub-rendered table of contents (all pages linked)  |
| `disclaimer.md` | Legal disclaimer (linked from footer)                 |
| `archived/`     | Superseded docs (excluded from sidebar, kept for SEO) |

### IA Principles

These decisions were made during the 2026-02-12 restructuring and should be maintained:

1. **Zero orphan pages.** Every `.md` file must appear in the sidebar for its section. The `generateSidebar()` function in `config.mts` auto-discovers files, so simply placing a file in a section directory is sufficient.

2. **Task-oriented sections, not code-mirror sections.** Organize by what users need to do, not by how the codebase is structured. Exception: `server/` is intentionally reference-oriented.

3. **5-7 top-level nav items.** Currently 5 in the main nav bar + 5 in "More" dropdown. Don't add more top-level sections without consolidating first.

4. **2 levels of nesting max.** `section/page.md` is the standard. No `section/subsection/page.md` — use flat directories with descriptive filenames instead.

5. **Every section has an `index.md`.** This is the landing page and appears when users click the section in the nav. It should overview the section and link to key pages.

6. **`README.md` is the GitHub TOC.** It mirrors the sidebar structure for GitHub readers. Update it whenever pages are added, moved, or deleted.

7. **`archived/` is a graveyard, not a staging area.** Move docs here only when they are fully superseded. Add a reason to the README table. `srcExclude: ['archived/**']` keeps them out of the build.

### Diataxis Mapping

The IA loosely follows the [Diataxis framework](https://diataxis.fr/) without being dogmatic about it:

| Diataxis Type | Where It Lives                            |
| ------------- | ----------------------------------------- |
| Tutorials     | `getting-started/` (learning-oriented)    |
| How-To Guides | `agents/`, `integrations/`, `protolabs/`  |
| Reference     | `server/`, env var tables, API docs       |
| Explanation   | `authority/`, `dev/docs-site-decision.md` |

## Content Guidelines

### Page Structure

Every page should follow this pattern:

```markdown
# Page Title

One-paragraph summary of what this page covers.

## First Section

Content...

## Next Steps (optional)

- **[Related Page](./related)** — Why they should read it
```

### Page Length

| Type      | Target        | Notes                                  |
| --------- | ------------- | -------------------------------------- |
| Landing   | 20-50 lines   | Overview + links to sub-pages          |
| Guide     | 100-400 lines | Complete walkthrough of one topic      |
| Reference | 200-600 lines | Comprehensive but scannable            |
| Maximum   | 800 lines     | Split into sub-pages if exceeding this |

If a page exceeds 800 lines, it should be split. The `claude-plugin.md` (1,400 lines) is grandfathered but should eventually be split into a guide and reference.

### Naming Conventions

- **Files:** `kebab-case.md` always. No SCREAMING_CASE, no camelCase.
- **Directories:** `kebab-case/` always.
- **H1 titles:** Sentence case ("Getting started" not "Getting Started"). Exception: proper nouns.
- **Links:** Use root-relative paths (`/agents/architecture`) for cross-section links, relative paths (`./architecture`) for same-section links.

### What Not to Put in Docs

- **Internal IPs or hostnames** — Use placeholders like `YOUR_STAGING_IP`
- **Real API keys or passwords** — Use `sk-ant-xxx` or `your-key-here` patterns
- **Session-specific data** — Point-in-time snapshots belong in `archived/` or nowhere
- **Duplicate content** — If two pages cover the same topic, delete one and link to the canonical version

### Markdown Conventions

- Use fenced code blocks with language identifiers (` ```typescript `, ` ```bash `, ` ```yaml `)
- Use tables for structured data (not nested lists)
- Use `**bold**` for UI elements and key terms
- Use backticks for code references, file paths, and commands
- No HTML except for the homepage layout (VitePress frontmatter handles it)
- No angle brackets in prose outside code fences (VitePress Vue compiler parses them as HTML)

## Maintenance Procedures

### Adding a New Page

1. Create `docs/{section}/my-page.md` with an H1 heading
2. It auto-appears in the sidebar (no config change needed)
3. Add it to `docs/README.md` in the appropriate section table

### Adding a New Section

1. Create `docs/{section}/index.md` with section overview
2. Add section to `config.mts`: nav entry + sidebar entry with `generateSidebar()`
3. Add section to `docs/README.md`
4. Verify it appears in the sidebar

### Moving a Page

1. `git mv docs/old-path.md docs/new-path.md`
2. Update all internal links pointing to the old path
3. Update `docs/README.md`
4. Check: `grep -r 'old-filename' docs/` to find stale references

### Archiving a Page

1. `git mv docs/{section}/page.md docs/archived/page.md`
2. Remove from `docs/README.md` main section
3. Add to the Archived table in `docs/README.md` with a reason
4. Remove any sidebar references (auto-generated, so just moving the file is enough)

### Checking for Orphans

Run this from the repo root:

```bash
# Find docs not in any section directory (potential orphans)
ls docs/*.md | grep -v index.md | grep -v README.md | grep -v disclaimer.md
```

Should return nothing. Any files found need to be moved into a section.

### Checking for Broken Links

```bash
# Check relative links resolve correctly
find docs -name '*.md' -not -path '*/archived/*' -not -path '*/.vitepress/*' | \
  while read -r file; do
    dir=$(dirname "$file")
    grep -oP '\[.*?\]\(\./[^)]*\.md[^)]*\)' "$file" 2>/dev/null | \
      grep -oP '\(\K\./[^)]*\.md[^)]*(?=\))' | \
      while read -r link; do
        target="$dir/${link%%#*}"
        [ ! -f "$target" ] && echo "BROKEN in $file: $link"
      done
  done
```

### VitePress Build Validation

The docs build runs automatically in Docker during staging deploys. If the build fails:

1. Check for angle brackets outside code fences (most common cause)
2. Check for missing frontmatter in `index.md` files
3. Run locally if needed: `docker build --target docs -t automaker-docs .`

Note: VitePress can't be installed as a root devDependency due to a vite version conflict (VitePress requires vite@^5, project uses vite@7). The Docker build stage installs it standalone.

## Config Reference

### `docs/.vitepress/config.mts`

Key settings:

| Setting           | Current Value     | Purpose                                              |
| ----------------- | ----------------- | ---------------------------------------------------- |
| `title`           | `protoLabs`       | Site title in browser tab                            |
| `srcExclude`      | `['archived/**']` | Hide archived docs from nav                          |
| `ignoreDeadLinks` | Regex patterns    | Allow links to files outside docs/ (CLAUDE.md, etc.) |
| `search.provider` | `local`           | Client-side full-text search (MiniSearch)            |

### `generateSidebar()` Function

Auto-generates sidebar items from directory contents:

- Reads all `.md` files in a directory
- Extracts the first H1 heading as the sidebar label
- Skips `index.md` and `README.md` (these are section landing pages)
- Sorts alphabetically

**Implication:** Page titles in the sidebar come from the H1, not the filename. To change a sidebar label, change the H1.

## Related

- [Docs Site](../internal/docs-site) — VitePress setup, deployment, and adding pages
- [Docs Site Decision](../internal/docs-site-decision) — ADR: Why VitePress was chosen
