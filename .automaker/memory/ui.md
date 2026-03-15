---
tags: [ui]
summary: ui implementation decisions and patterns
relevantTo: [ui]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 1
  referenced: 0
  successfulFeatures: 0
---

# ui

#### [Gotcha] selectedIndex initialized to -1 (not 0), representing explicit 'no selection' state (2026-03-11)

- **Situation:** Hook needs to communicate whether a command is pre-selected in the dropdown
- **Root cause:** -1 is semantically clearer than 0; 0 would auto-select first item on activation, causing unexpected behavior
- **How to avoid:** Downstream UI components must handle -1 specially; can't directly use `commands[selectedIndex]` without bounds check

#### [Pattern] Deduped recent server URLs array (max 10) prevents duplicate entries from repeated 'set server' clicks (2026-03-11)

- **Problem solved:** Users switching between servers frequently (dev/staging/prod workflows) benefit from quick-access list
- **Why this works:** Deduplication indicates expected user behavior (clicking 'set server' multiple times with same URL). Size limit (10) balances UX density with memory.
- **Trade-offs:** Gained: clean recent list UX; lost: ability to see frequency of server usage

#### [Gotcha] selectedIndex normalized from −1 (hook state) to 0 (view state) when dropdown active. Normalization happens in the slashCommands prop object, not in hook state. (2026-03-11)

- **Situation:** Hook uses −1 as sentinel for 'closed/not selected' state, but when dropdown opens, rendering with −1 selected looks broken (nothing highlighted)
- **Root cause:** Avoids mutating hook state for view concerns. Hook can keep −1 meaning 'closed', view can normalize to 0 for rendering without the hook knowing. Separates state management from presentation.
- **How to avoid:** Simple normalization logic in wrapper keeps concerns clean, but adds implicit contract: ChatInput must handle 0-indexed selection

### Command selection inserts '/{cmd.name} ' with trailing space into input. User can immediately type arguments without manually adding space. (2026-03-11)

- **Context:** User selects '/ava' command; needs to be able to type arguments like '/ava help me debug' seamlessly
- **Why:** Frontend handles UI insertion only. Server handles actual command expansion/parsing. Trailing space is a UX convention—reduces friction for common case (command + args) while keeping parsing flexible on backend.
- **Rejected:** Insert without space '/ava'; insert full expanded command like '/ava [args placeholder]'; leave it to user to add space
- **Trade-offs:** Single-space assumption simplifies frontend but assumes backend can parse any command+space+args pattern. More sophisticated arg handling (multiple flags, etc.) stays on server.
- **Breaking if changed:** Removing trailing space requires users to manually add space—breaks smooth argument typing UX

#### [Pattern] Wrap-around navigation using modulo arithmetic: (index − 1 + count) % count for up, (index + 1) % count for down (2026-03-11)

- **Problem solved:** User navigates with ArrowUp/Down through command list; at bottom of list, expect Up to cycle to top
- **Why this works:** Standard UI expectation for lists: reaching the end cycles back instead of stopping dead. Modulo math handles both boundaries with single formula. Makes navigation feel predictable and continuous.
- **Trade-offs:** Slightly more complex math, but significantly smoother UX. Requires count > 0 validation (guarded by early return in navigate function)

#### [Gotcha] Keyboard interception (ArrowUp/Down/Tab/Enter/Escape) happens in ChatInput, not in SlashCommandDropdown. ChatInput must re-emit as handler calls to parent wrapper. (2026-03-11)

- **Situation:** Multiple keyboard handlers (navigation, selection, closing) need to coordinate between textarea and dropdown. Interception can't happen in dropdown alone.
- **Root cause:** Textarea is the focus target, so keyboard events bubble from there. ChatInput owns the keyboard context and must intercept first. Handlers then call hookResult methods (select, navigate) back through the interface.
- **How to avoid:** Keyboard logic lives in ChatInput even though it's for dropdown—couples them slightly. Alternative (dropdown owned state) would require ChatInput to be uncontrolled dropdown parent. Current approach simpler.

#### [Pattern] Graceful degradation: Badge shows `ceremonyLabel` when present, falls back to `config.label` for events without ceremony-specific labeling. (2026-03-13)

- **Problem solved:** Not all ceremony events might have ceremony-specific labels; some might be generic config labels.
- **Why this works:** Handles incomplete data gracefully. Allows gradual adoption of ceremony labeling without requiring migration of all events.
- **Trade-offs:** UI logic simpler with optional data; badge always has a label even if not ceremony-specific.

### Use config object (ARTIFACT_CONFIG) to map artifact type → icon, color, label; enable per-type customization without conditional branches (2026-03-13)

- **Context:** Five artifact types (Standup, Ceremony Report, Changelog, Escalation, Research Report) each need distinct icon, visual color, and display label. Risk: adding new types requires code changes in multiple places.
- **Why:** Centralized configuration reduces conditional logic in components. Adding a new type requires only one change (ARTIFACT_CONFIG). Config lookup is O(1), scales without performance impact.
- **Rejected:** Inline icon selection with switch/if statements in ArtifactGroup (scatters type logic across components); hardcoded styling (loses visual hierarchy)
- **Trade-offs:** More indirection (lookup table vs inline), but significantly cleaner component code. Requires discipline to update config when adding types.
- **Breaking if changed:** Removing config fallback (DEFAULT_ARTIFACT_CONFIG) breaks graceful handling of unknown types

#### [Pattern] Implement feature with graceful degradation: download button works with real content or metadata fallback, not blocked by upstream enrichment (2026-03-13)

- **Problem solved:** Download-as-markdown feature is valuable immediately even though parent hasn't fetched real ceremony report content yet. Without fallback, feature would be useless until parent implements enrichment.
- **Why this works:** Keeps feature partially useful during development of parent enrichment. Reduces coordination friction: artifact viewer can ship standalone; parent can add content enrichment independently.
- **Trade-offs:** Download provides metadata instead of full report initially (lower value), but unblocks user-facing feature. Creates technical debt: metadata-based downloads become harder to remove later if UX wants them deprecated.

### Starter kit selection is optional (no default) and uses toggle pattern (click to select, click again to deselect), preserving blank-project flow (2026-03-15)

- **Context:** Could default to 'docs' kit, or use radio buttons, or require selection. Instead made optional with toggle.
- **Why:** Explicit opt-in preserves backward compatibility—existing users expecting blank projects unchanged. Toggle UX is lightweight; no dedicated deselect button needed. Reduces cognitive load for users who want blank project.
- **Rejected:** Defaulting to 'docs' would increase template adoption but breaks expectation for blank projects. Required radio selection increases friction for blank-project path.
- **Trade-offs:** Simpler UX (toggle) vs. clearer multi-select semantics (checkboxes). Optional path vs. higher template adoption. Fewer clicks to skip templates vs. explicit mutual exclusivity.
- **Breaking if changed:** If logic later assumes a starter kit is always present, optional starterKit field becomes a problem. Schema migrations needed if making selection required.

#### [Pattern] Design 6 CSS custom properties (--background, --surface, --border, --primary, --primary-foreground, --foreground) as universal rebrand mechanism (2026-03-15)

- **Problem solved:** Need to define theming system that allows entire starter kit to be recolored by changing only a few values, matching existing landing-page pattern.
- **Why this works:** Minimal surface area for theme customization. 6 values directly map to all UI needs (containers, surfaces, borders, brand color, text on brand, text). Mirrors landing-page `global.css` convention in codebase.
- **Trade-offs:** Simplicity and discoverability for theme authors vs granularity. New colors beyond the 6 require additional CSS variables. Enforces design discipline.

### Target React 19 directly in starter kit (@types/react@^19) and drop ForwardRefExoticComponent workaround used in monorepo atoms (2026-03-15)

- **Context:** Monorepo main package supports React 18+19 and needs compatibility layer. Starter kit is greenfield, can choose single version.
- **Why:** React 19 is the current version. Dropping the ForwardRefExoticComponent type cast simplifies code and removes legacy compatibility overhead. Starter kit teaches modern React patterns.
- **Rejected:** Support React 18 in starter kit (unnecessary complexity for learning template); keep compatibility cast (teaches outdated workarounds)
- **Trade-offs:** Simpler, cleaner code vs losing React 18 support. Anyone using starter kit with React 18 would hit type errors.
- **Breaking if changed:** Users trying to use starter kit atoms with React 18 lose type safety. Changing to React 18 support requires re-adding ForwardRefExoticComponent cast to Popover.

### Two-word chunking chosen over per-word or sentence-level chunking for streaming animation (2026-03-15)

- **Context:** Balancing animation frequency with text readability during streaming responses
- **Why:** Per-word animation is perceptually too fast and jarring; sentence-level loses the fade-in effect over long text; 2-word provides consistent visual rhythm without overwhelming the reader
- **Rejected:** Per-word chunking (overwhelming visual flicker); sentence-level (animation effect too sparse); variable-length intelligent chunking (complexity vs marginal UX gain)
- **Trade-offs:** Simple, predictable animation pacing; sacrifices ability to respect semantic boundaries (punctuation, clause structure); any chunk size change dramatically alters perceived animation speed
- **Breaking if changed:** Changing chunk size from 2 to 1 or 3+ words fundamentally changes the visual effect — too small becomes jarring, too large feels choppy and less responsive

#### [Gotcha] Citations and markdown features are completely disabled during streaming; only plain text chunks animate (2026-03-15)

- **Situation:** StreamingTextChunks component accepts citations but ignores them; only ChatMessageMarkdown handles them after streaming completes
- **Root cause:** Bypassing the full markdown renderer during streaming reduces overhead and complexity of animated rendering; markdown processing happens in a second pass after streaming ends
- **How to avoid:** Faster streaming render with pure CSS animation; users don't see citations or markdown formatting until the final prose pass completes

#### [Gotcha] Trailing space injected into every chunk via `+ ' '` could create unexpected whitespace at text end (2026-03-15)

- **Situation:** chunkString function adds space to each chunk so words don't run together when rendered as adjacent spans
- **Root cause:** Prevents 'HelloworldTest' by ensuring 'Hello world ' and 'Test ' render with internal spacing
- **How to avoid:** Simple, guaranteed spacing; creates extra space at the very end of prose (after last chunk) which might differ visually from non-streamed text

#### [Gotcha] Animation duration (750ms) is hardcoded in CSS @keyframes and cannot be adjusted per-chunk based on content length (2026-03-15)

- **Situation:** All chunks fade in over fixed 750ms regardless of word count or text complexity
- **Root cause:** CSS @keyframes requires static duration; decoupled from JavaScript chunking logic which could compute ideal duration per chunk
- **How to avoid:** Simple CSS; predictable animation across all messages; cannot create 'reading pace' that adapts to text length or complexity

### Root layout (\_\_root.tsx) uses inline styles `style={{}}` for sidebar instead of Tailwind classes, despite Tailwind being configured in Vite. (2026-03-15)

- **Context:** Root layout with navigation is foundational; must render correctly before any CSS framework code loads
- **Why:** Root layout renders before Tailwind CSS bundle loads in dev/prod. Using Tailwind classes creates bootstrap dependency: if CSS fails to load, sidebar nav breaks. Inline styles guarantee rendering regardless of CSS loading state. Once child routes mount, they use Tailwind normally.
- **Rejected:** Tailwind classes at root level create invisible failure mode; CSS-in-JS utilities (styled-components, etc.) add unnecessary bundle size for static root layout
- **Trade-offs:** Root layout less maintainable long-term (inline styles vs classes); small performance cost for static inline styles; decouples foundational UI from CSS framework; child routes keep full Tailwind access
- **Breaking if changed:** Switching root to Tailwind classes introduces CSS loading race condition; if Tailwind CSS chunk fails or is slow, entire app appears broken on first load

#### [Gotcha] WeatherCard renderer registration via side-effect import to global toolResultRegistry creates implicit coupling (2026-03-15)

- **Situation:** Custom tool result renderers are registered dynamically. WeatherCard imports and registers itself on module load.
- **Root cause:** Dynamic registry approach allows clean composition without explicit mapping file. Renderers declare their own existence.
- **How to avoid:** Gains: clean separation, new renderers added without touching core. Loses: implicit dependency, if import is removed the renderer silently vanishes with no error or warning.

#### [Pattern] Use a sidebar mode toggle (palette ↔ property inspector) instead of two fixed panels to conserve canvas width (2026-03-15)

- **Problem solved:** The builder needs both a node palette for drag-drop and a property inspector for editing. Two simultaneous panels halve available canvas width.
- **Why this works:** The palette and inspector are mutually exclusive by workflow: palette is for 'what to add', inspector is for 'what's selected'. A toggle keeps the UI compact. Users rarely need both visible simultaneously.
- **Trade-offs:** Compact layout vs. higher interaction cost — users must learn to deselect nodes to return to palette mode. Discovery of available node types is less obvious.

#### [Pattern] Three-zone split layout: sidebar (template list) + top editor + bottom streaming test chat in single view (2026-03-15)

- **Problem solved:** Prompt development requires quickly iterating between editing and testing without tab switching
- **Why this works:** Collocates input (editor), validation (streaming test), and discovery (sidebar) to minimize context switching during iterative prompt refinement
- **Trade-offs:** Gained: tight feedback loop for prompt development. Cost: vertical space contention on smaller screens; test area state not persistent across navigation

### Include token count estimate in editor toolbar; requires LLM awareness in UI (2026-03-15)

- **Context:** Prompt developers need to know token usage before sending to model API
- **Why:** Token limits are hard constraints in LLM systems. Inline estimation prevents user frustration from silent truncation or rejection.
- **Rejected:** Show token count only after sending to API (too late for iteration); no token count (user discovers limit via error)
- **Trade-offs:** Gained: early feedback, prevents wasted API calls. Cost: toolbar needs token estimation logic; estimate may drift from actual tokenizer
- **Breaking if changed:** Removing token count removes ability to pre-validate prompt size; increases failed API calls from oversized prompts

#### [Pattern] Starter templates are classified by category ('docs', 'portfolio', 'landing-page', 'ai') to organize them in the UI picker. Category is metadata on each template entry. (2026-03-15)

- **Problem solved:** AI Agent App template added with category: 'ai' to group it with other AI/ML focused starters.
- **Why this works:** Allows UI to cluster related templates and help users discover templates by use case/domain. 'ai' category signals this is for AI applications.
- **Trade-offs:** Adds metadata field to every template definition, but enables discovery; forces template owners to make explicit category choice

#### [Pattern] HTML generator selects semantic elements (`<button>`, `<nav>`, `<h1>–<h6>`, `<label>`, `<article>`) via name + type heuristics, not explicit element annotation in design doc. (2026-03-15)

- **Problem solved:** Generating accessible, semantic HTML without requiring designers to specify element types
- **Why this works:** Reduces design document complexity while producing valid semantic HTML. Reasonable defaults improve usability; heuristics can be refined without changing design format.
- **Trade-offs:** Heuristics can mis-classify (e.g., 'Header' might be a container, not `<h1>`), but sensible defaults outweigh configuration burden for most use cases

#### [Pattern] Zero-config story discovery via import.meta.glob + glob parsing at runtime, rather than static story registry or manifest file (2026-03-15)

- **Problem solved:** Ladle and similar tools auto-discover stories. For a self-contained template, needed a discovery mechanism that requires no configuration and survives copy-paste into different projects.
- **Why this works:** Dynamic discovery via glob pattern means adding a new .stories.tsx file automatically makes it visible in the sidebar without touching config, tsconfig, or any build script. Maximizes developer velocity for rapidly prototyping components.
- **Trade-offs:** Easier: drop-and-go file creation, zero config changes. Harder: relies on naming convention (\*.stories.tsx) being enforced by team discipline; glob pattern is tightly coupled to file structure.

#### [Pattern] Search results include 80-character context excerpts extracted from body text around match location (2026-03-15)

- **Problem solved:** Search results across multiple content sections need to show relevance/match reason to user
- **Why this works:** Helps users quickly understand why result matched without opening full content. Standard pattern in documentation search (Algolia, etc.). 80-char limit balances readability with context window.
- **Trade-offs:** Gains: better UX, users see match context before clicking. Loses: extraction logic adds complexity, might cut off important context.

### Explicit TypeScript type casts (as const on style objects, as React.CSSProperties on inline styles) with no any types (2026-03-15)

- **Context:** Building inline styles in TypeScript strict mode
- **Why:** Maintains type safety for CSS properties. Catches typos/invalid properties at compile time. Documents intent via explicit casts.
- **Rejected:** Using any type would bypass checks. CSS modules would require build step.
- **Trade-offs:** Gains: type safety, compile-time validation. Loses: more verbose style definitions.
- **Breaking if changed:** If type safety is removed (any types allowed), catch typos in style properties later at runtime.
