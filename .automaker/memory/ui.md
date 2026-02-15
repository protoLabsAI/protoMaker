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

#### [Pattern] Map store features to lightweight summary format {id, title, status, complexity, milestone} instead of passing full feature objects. Reduces context payload, avoids serialization issues with complex objects. (2026-02-15)
- **Problem solved:** App store features contain nested objects, circular refs, or non-serializable properties. Sending raw features to agents bloats context and may cause serialization errors.
- **Why this works:** Agents only need enough info to reference features, not internal implementation details. Summary format is JSON-serializable, reduces token usage, improves agent decision-making by hiding implementation noise.
- **Trade-offs:** Minimal data loss (agents get what they need), smaller context window usage, guaranteed serializability. Cost is mapping logic.

#### [Gotcha] CKProvider does not automatically react to header prop changes. Passing new headers via prop alone does not update active connections (2026-02-15)
- **Situation:** Initial attempt to update headers reactively via CKProvider props failed - selected model changed but requests still used old model
- **Root cause:** CopilotKit initializes connection handlers at mount time using headers snapshot. Prop updates don't trigger reconnection or header refresh. Root cause is that CopilotKit SDK initialization is one-shot, not reactive to prop changes
- **How to avoid:** Solution uses React key prop to force CKProvider remount on model change. Gained reliable header updates but lost connection continuity (brief reconnection lag when model changes). WebSocket-based message passing would preserve connection but requires modifying CopilotKit runtime itself

### All interrupt payload types route to GenericApprovalDialog as a working baseline, with specialized UIs (PRD editor modal) marked as TODOs. (2026-02-15)
- **Context:** Four interrupt types (prd-review, entity-review, phase-approval, generic) need to be routed to UI components. Only generic dialog exists and is fully available.
- **Why:** Pragmatic approach: implement discriminated union routing infrastructure now, defer specialized UI integration until those components are ready. Unblocks testing of interrupt flow with working baseline.
- **Rejected:** Blocking implementation on PRD editor modal availability. Would delay entire feature.
- **Trade-offs:** Gains: Feature ships with working interrupt routing. Loses: Type-specific UIs are not realized yet. Risk: developers may forget to update router when specialized UIs land.
- **Breaking if changed:** When prd-review modal is integrated, the router switch case must be updated to use it instead of GenericApprovalDialog. If not updated, all PRD reviews will show wrong UI.

#### [Gotcha] CopilotKit's CopilotSidebar component uses uncontrolled state pattern (defaultOpen prop only), not controlled state (open/onOpenChange props). Cannot directly manage sidebar visibility from parent component. (2026-02-15)
- **Situation:** Attempted to toggle sidebar via state passed to CopilotSidebar component, but discovered component doesn't expose controlled state API
- **Root cause:** CopilotKit's sidebar implementation is internally managed. This is a library limitation, not a configuration option.
- **How to avoid:** Using key-based re-mounting forces component reset on each toggle (loses internal sidebar state like scroll position), but ensures clean open/closed state transitions without stale internal state

#### [Pattern] Use React component key prop to force full re-mount and re-initialization when a child component doesn't support controlled state. Pair with defaultOpen/defaultValue props to set initial state on each mount. (2026-02-15)
- **Problem solved:** Need to toggle CopilotSidebar open/closed from parent, but component only accepts defaultOpen (uncontrolled)
- **Why this works:** React's key prop is the documented way to reset component state without managing internal state from parent. Changing key unmounts and remounts component, running all initialization logic again.
- **Trade-offs:** Cost: component remounts on every toggle (slightly higher CPU). Benefit: zero coupling to CopilotSidebar's internal implementation, automatically compatible with library updates

### Keyboard shortcut uses metaKey (macOS) OR ctrlKey (Windows/Linux), not AND. Single condition checks both platforms in one listener. (2026-02-15)
- **Context:** Cmd+K on macOS, Ctrl+K on Windows/Linux - two different modifier keys, same logical intent
- **Why:** JavaScript KeyboardEvent.metaKey is true only on macOS (Cmd), ctrlKey is true only on Windows/Linux (Ctrl). Using OR means one listener handles both platforms without branching or multiple listeners.
- **Rejected:** Separate listeners for metaKey and ctrlKey (code duplication), user-agent detection (fragile), checking platform at listener registration time (doesn't adapt if user remaps keys)
- **Trade-offs:** Single listener is simpler but relies on browser consistency. If a user remaps Ctrl→Cmd on Windows, it won't work (acceptable since remapping is intentional user config)
- **Breaking if changed:** If event.metaKey or event.ctrlKey API changes (extremely unlikely), listener stops working. If browser stops sending these properties, shortcut breaks silently.

#### [Gotcha] preventDefault() must be called immediately on keyboard event to prevent browser default behavior (Cmd+K opens browser search). Late or conditional preventDefault() doesn't work due to event propagation timing. (2026-02-15)
- **Situation:** Without preventDefault(), browser's native Cmd+K handler (URL bar focus) runs alongside sidebar toggle, causing UI interference
- **Root cause:** Browser's KeyboardEvent default handlers are registered at the capturing/bubbling phases. preventDefault() only works when called synchronously during event dispatch, before default handlers execute.
- **How to avoid:** Must call preventDefault() at the start of the listener. If future code adds async validation before toggle, must move preventDefault() outside the async path.

#### [Pattern] Error display component wraps CopilotKit context usage in try-catch to prevent crashes when context unavailable, following existing AgentStateDisplay pattern (2026-02-15)
- **Problem solved:** CopilotKit provider context may not be available in all render contexts; component must gracefully degrade rather than crash
- **Why this works:** CopilotKit agents are optional/conditional features. Wrapping prevents entire UI from breaking if agent context is missing or uninitialized
- **Trade-offs:** Graceful degradation means error display silently doesn't render if context missing (good for resilience, harder to debug if context should exist)

### Retry button attempts agent.restart() first, falls back to window.location.reload() if method unavailable (2026-02-15)
- **Context:** Uncertain whether CopilotKit agent instance has a restart() method for checkpoint resumption vs requiring full page reload
- **Why:** Two-tier fallback allows graceful degradation: attempt smart restart if available, fall back to crude full reload rather than fail silently
- **Rejected:** Hard-coding single approach (either restart or reload) would break if method availability differs from assumption
- **Trade-offs:** Page reload loses in-memory state but guarantees recovery; smart restart preserves state but may not exist in all CopilotKit versions
- **Breaking if changed:** Removing fallback chain means retry fails silently if agent.restart() doesn't exist; page becomes unresponsive to user retry attempts

#### [Pattern] Stack trace visibility toggled via local component state with ChevronUp/ChevronDown icons, hidden by default (2026-02-15)
- **Problem solved:** Long stack traces clutter UI; most users don't need them until debugging; need to balance visibility with UI cleanliness
- **Why this works:** Default-hidden pattern reduces cognitive load for normal operation; users can opt-in to debug details when needed. Chevron icons provide clear affordance
- **Trade-offs:** Extra click to see stack trace (worse for rapid debugging) but cleaner default UX for non-technical users

### EntityWizard uses local Map<entityId, EntityDecision> to accumulate decisions across steps rather than submitting individually (2026-02-15)
- **Context:** Multi-step wizard needs to collect user decisions on many entities before sending back to graph
- **Why:** Batch submission prevents partial state on graph. Individual submissions would require complex recovery if user cancels mid-wizard. Map structure allows decision override (user can change decision on later review).
- **Rejected:** Submit-on-step pattern (loses decisions if user cancels), Redux/Context state (overkill for component scope), array accumulation (can't override previous decisions easily)
- **Trade-offs:** Map-based approach uses more memory but prevents bad UX states. Could add 'undo' feature easily with this structure.
- **Breaking if changed:** Changing to submit-on-step breaks cancellation semantics. Graph expects single batch of decisions.

### EntityWizard decision actions (approve, reject, correct, merge) are defined as discriminated union type (action + optional mergeWith/newName fields) (2026-02-15)
- **Context:** Wizard supports 4 different decision types with different required fields
- **Why:** Discriminated union (action: 'merge' + mergeWith field) provides type safety. Compiler verifies mergeWith exists only for merge actions. Prevents invalid states like reject-with-correction.
- **Rejected:** Four separate decision types (verbose), open string+object (no type safety), boolean flags (unclear semantics)
- **Trade-offs:** Slightly more verbose type definition but eliminates entire class of runtime bugs. Graph validation becomes simpler.
- **Breaking if changed:** Adding new action type requires updating EntityDecision union AND all places that pattern-match on action field.