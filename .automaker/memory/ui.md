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

#### [Pattern] Command-based popover pattern for agent selection uses Command/CommandInput/CommandList composition with Popover wrapper for consistent UI component selection across the codebase (2026-02-12)
- **Problem solved:** Building AgentSelector component that needed searchable dropdown of agents matching existing PhaseModelSelector pattern
- **Why this works:** Command component provides built-in search filtering via CommandInput, CommandList handles rendering with keyboard navigation, Popover provides trigger+content layout. This composition is reusable and matches established UI library patterns.
- **Trade-offs:** Easier: search built-in, keyboard nav automatic, consistent with existing UI. Harder: requires understanding Command component structure, nested CommandGroup/CommandItem hierarchy not immediately obvious.

#### [Pattern] Agent metadata display uses Badge component with size='sm' and variant='outline' for role indicators, keeping visual hierarchy lightweight (2026-02-12)
- **Problem solved:** Needed to display agent role (backend-engineer, pm, etc.) inline with agent name without overwhelming the dropdown list visually
- **Why this works:** Small outlined badges are low-visual-weight and don't compete with the primary agent name/description. This keeps the selector scannable while still categorizing agents by role.
- **Trade-offs:** Easier: clear role identification at a glance. Harder: small badges can be hard to read in dense lists if there are many agents.

#### [Gotcha] Default selection logic must check for 'backend-engineer' template existence before using it, then fall back to first template (2026-02-12)
- **Situation:** Discovered that not all API responses may include backend-engineer template, or templates could be filtered/reordered
- **Root cause:** Hardcoding 'backend-engineer' as default would crash if that template doesn't exist in the API response. Checking existence first prevents runtime errors and provides graceful fallback.
- **How to avoid:** Easier: sensible default for common case. Harder: adds conditional logic and requires knowledge of which template is 'expected' to exist.

#### [Gotcha] Error state display uses AlertCircle icon for consistency with other error states in the UI, but error message text must be explicitly provided by the hook (2026-02-12)
- **Situation:** Needed to display user-friendly error when agent templates fail to load
- **Root cause:** AlertCircle provides visual consistency with error states elsewhere in the app. But useAgentTemplates hook must return a proper error message - generic 'unknown error' doesn't help users.
- **How to avoid:** Easier: consistent error appearance. Harder: depends on hook providing good error messages; if hook returns null/undefined for error, display is blank.

#### [Pattern] Conditional component rendering based on selection state: AgentModelSelector only renders when selectedAgent is null (Custom Model mode). When a template is selected, the selector is hidden entirely rather than disabled. (2026-02-12)
- **Problem solved:** Need to support both agent template selection AND raw model selection, but only show one at a time in the same UI slot.
- **Why this works:** Conditional rendering (`{!selectedAgent && <AgentModelSelector />}`) is cleaner than prop-based disabling because it prevents the model selector from being interactive when a template is already chosen. Also reduces DOM complexity when not needed.
- **Trade-offs:** Simpler state management (selectedAgent is single source of truth), but requires two separate UI pathways. Easier to test and reason about, harder to add a simultaneous model override feature later.

#### [Gotcha] AgentSelector auto-sets the model via handleAgentSelect callback immediately when a template is selected, but the model value update is async (setState). UI may show stale model briefly if re-renders are not batched. (2026-02-12)
- **Situation:** Selecting an agent template should instantly update the displayed model to match that template's model field.
- **Root cause:** The pattern (select agent → call onAgentSelect → update modelSelection state in parent) relies on React's batching to avoid intermediate renders. Without explicit coordination, there's a flash where selectedAgent is updated but modelSelection lags.
- **How to avoid:** Simple and declarative, but fragile if React batching changes or if other state updates interleave. Works well now, but tight coupling to React internals.

#### [Pattern] Delegating welcome message customization to parent component (agent-view) rather than AgentHeader (2026-02-12)
- **Problem solved:** AgentHeader needed to display agent identity, but welcome message generation depends on template metadata that's contextual to the session
- **Why this works:** Separates concerns: AgentHeader is purely presentational (displays what it's given), agent-view owns session state and business logic. Avoids prop-drilling multiple template fields into AgentHeader. Makes testing simpler - can test greeting generation logic independently from UI component
- **Trade-offs:** Parent component (agent-view) now has more responsibility for string generation, but this is actually correct - session context owns this logic. Would be harder to test if buried in AgentHeader

#### [Pattern] React Query queries use WebSocket event subscriptions for immediate updates alongside 30s polling fallback. Pattern: poll for baseline freshness, WebSocket for real-time cache invalidation. (2026-02-12)
- **Problem solved:** ProjectHealthCard needs to stay current with auto-mode state changes. Polling alone would have 30s lag; WebSocket alone requires server to emit events reliably.
- **Why this works:** Hybrid approach is resilient: if WebSocket drops, polling catches up. If server is slow to emit, polling provides guaranteed refresh. Combined they eliminate both latency spikes and stale-data windows.
- **Trade-offs:** Hybrid uses more server resources (extra WebSocket subscriptions + polling queries) but eliminates complexity of deciding which is authoritative. Simpler mental model: both always work.

### Auto-mode status derived from TWO independent fields (isAutoLoopRunning flag + runningAgentsCount) rather than single server field. Three-state output (running/idle/stopped) requires logic: running=(loop on AND agents>0), idle=(loop on AND agents=0), stopped=(loop off). (2026-02-12)
- **Context:** Auto-mode can be 'on' while agents finish (loop running, no active agents = idle state). Single field would collapse this distinction.
- **Why:** Provides semantic distinction between 'auto-mode stopped' and 'auto-mode on but waiting'. UI/UX needs this for status messaging - 'Idle' tells user loop is alive but blocked, 'Stopped' means user disabled it.
- **Rejected:** Single server boolean field (isAutoLoopRunning). Would force UI to infer 'idle' from running agents count, leaking business logic into presentation layer.
- **Trade-offs:** Client-side state machine is now source of truth for UI state, not server. Requires correct implementation of the three-state logic in multiple places (any client that reads autoModeStatus must use same logic or states diverge).
- **Breaking if changed:** If either field (isAutoLoopRunning or runningAgentsCount) becomes unavailable, the state machine breaks and UI cannot determine correct status. Both fields are load-bearing.

#### [Gotcha] Card component system uses slot-based architecture (data-slot attributes) not standard className API. Must inspect existing Card implementations to discover API surface. (2026-02-12)
- **Situation:** Attempted to build ProjectHealthCard layout using standard CSS patterns. Discovered via review of metric-cards.tsx that Card uses data-slot for internal layout control.
- **Root cause:** Slot API decouples component structure from CSS, allows Card to control breakpoints/spacing/layout without consumers managing grid classes. More composable than className.
- **How to avoid:** Slot API is less discoverable (not obvious from props). Easier to get consistent styling across components once you know the API.

### Collapsible section with default-expanded state (showProjectActivity = true) for Project Activity rather than always-expanded or always-collapsed (2026-02-12)
- **Context:** Dashboard could be overwhelmed by activity feed; needed to respect screen real estate while keeping feature discoverable
- **Why:** Default-expanded makes the feature visible (discoverability) while allowing users to collapse if needed (content control). The chevron icon provides clear affordance.
- **Rejected:** Default-collapsed hides the feature from new users. Always-expanded wastes space on dashboards with multiple projects.
- **Trade-offs:** Expanded state takes more vertical space but improves discoverability. Users familiar with the dashboard can collapse to reclaim space.
- **Breaking if changed:** If UX research shows users immediately collapse the section, default should flip to closed. Conversely, if users never expand it when closed, the collapsible feature is unnecessary overhead.

### Used @clack/prompts spinner+multi-select for UX instead of simple console.log, with automatic pre-selection of all recommended phases (2026-02-13)
- **Context:** Gap analysis returns severity levels (critical/recommended/optional) but CLI needed to decide which phases to run without overwhelming users
- **Why:** @clack/prompts provides visual hierarchy (spinners for processing, color-coded severity, multi-select with defaults). Pre-selecting 'recommended' severity items matches ProtoLabs mental model—user sees what's advised and can customize. Spinner feedback prevents perception of hangs during 'research'
- **Rejected:** Alternative 1: Automatically run all phases without prompt. Breaks workflows where user wants selective setup. Alternative 2: Single-select radio buttons instead of multi-select. Rejected because users may want mixed critical+optional (skip recommended for speed)
- **Trade-offs:** Easier: User confidence (visual feedback, sensible defaults). Harder: CLI code complexity (+50 lines for prompt logic), interactive mode blocked for JSON/automation
- **Breaking if changed:** If default selection is removed (all phases deselected), users hit the prompt with nothing selected and must manually check boxes—UX regression. If spinner is removed during research phase, users assume CLI hung