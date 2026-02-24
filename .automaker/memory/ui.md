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

### Dark theme hardcoded in stream-overlay-view.tsx with no theme switching capability, despite app having Zustand-based theme store (2026-02-17)
- **Context:** OBS overlay must present consistent appearance across all streaming scenarios. User-facing app themes can vary, but stream overlay appearance must be predictable and broadcast-quality
- **Why:** Hardcoded dark theme eliminates runtime theme selection issues, ensures streamer cannot accidentally switch to light theme mid-broadcast (destroying overlay appearance), and simplifies component — no theme provider logic needed
- **Rejected:** Respect app theme store (useThemeStore) — creates risk that theme changes in main app affect stream appearance during live broadcast
- **Trade-offs:** Reduced flexibility vs guaranteed visual stability. Overlay cannot adopt user's theme preference, but that's acceptable because overlay is not for user's personal use, it's a broadcast artifact
- **Breaking if changed:** If theme is made dynamic via theme store, a user accidentally switching themes in the app will change the stream overlay mid-broadcast, potentially during an important moment

#### [Pattern] CVA (class-variance-authority) used for multi-variant node styling with status-based visual hierarchy (2026-02-18)
- **Problem solved:** PipelineStepNode needs 5 distinct visual treatments (pending, active, completed, skipped, error) with consistent styling approach
- **Why this works:** CVA provides type-safe variant composition that scales better than conditional classNames. Prevents style duplication and ensures all combinations are explicitly defined. Easier to audit coverage of all states.
- **Trade-offs:** Slightly more upfront code but eliminates runtime style conflicts and makes adding new variants explicit. Harder to debug if variant logic is complex.

### Breathing glow animation on active state renders as separate motion.div overlay rather than animating the node itself (2026-02-18)
- **Context:** Active state needs visible breathing glow effect without performance cost of animating the main node container
- **Why:** Separating the glow into its own animated element prevents the entire node from re-rendering during animation. This allows React Flow to keep the node geometry stable while only the overlay updates. Matches orchestrator-node pattern which proved performant.
- **Rejected:** Animating the main node container directly - would cause unnecessary re-renders and geometry changes that React Flow needs to track
- **Trade-offs:** Adds one extra DOM element per active node, but animation performance is smooth. Would need profiling if thousands of active nodes exist simultaneously.
- **Breaking if changed:** Removing the overlay pattern requires moving animation to main node, which would cause jank when graph interaction updates geometry

#### [Gotcha] Duration badge requires BOTH startTime AND endTime present - formatting function doesn't gracefully degrade if only one exists (2026-02-18)
- **Situation:** Completed state should show elapsed time, but timing data might be incomplete during transitions
- **Root cause:** Prevents displaying 'Invalid Date' or NaN in the UI. Guards against timing race conditions where endTime hasn't been set yet or data loads partially.
- **How to avoid:** Badge won't show until both timestamps exist, making partially-completed states invisible. But this is actually correct - prevents false 'completed' indication.

### Handle colors coded by status rather than fixed neutral color (2026-02-18)
- **Context:** React Flow nodes need target/source handles that visually communicate the node's current state
- **Why:** Status-coded handles provide visual continuity - users immediately see which node is active/errored when tracing connections. Reduces cognitive load compared to neutral handles with separate node states. Matches React Flow best practices for connected node graphs.
- **Rejected:** Fixed neutral handle colors - loses important state information in dense graphs
- **Trade-offs:** Makes handle color CSS more complex (status-dependent classNames), but improves UX significantly in complex graphs
- **Breaking if changed:** If handles are changed to fixed colors, users can't visually scan connections to identify problem areas (e.g., which error node is this connected from?)

### Event propagation blocking implemented via stopPropagation() + nopan CSS class combination for canvas drag prevention (2026-02-18)
- **Context:** Inline action buttons (Approve/Reject) within ReactFlow nodes would trigger canvas pan/drag on click without explicit isolation
- **Why:** ReactFlow's canvas event handling captures all pointer events by default. Single stopPropagation() is insufficient because ReactFlow has its own event system. The nopan class signals to ReactFlow's internal handlers to skip pan logic for this element.
- **Rejected:** Using event.preventDefault() alone - doesn't work with ReactFlow's event delegation. Using pointer-events: none - would break button interactivity entirely.
- **Trade-offs:** Requires knowledge of both React event system AND ReactFlow's specific event handling architecture. More verbose than typical React patterns, but necessary for correct canvas behavior.
- **Breaking if changed:** Removing either stopPropagation() or nopan class causes clicks to pan/drag canvas instead of triggering button handlers, making buttons unusable.

#### [Pattern] Countdown timer implemented as SVG animated ring with real-time millisecond updates via requestAnimationFrame, rather than setInterval (2026-02-18)
- **Problem solved:** Need to show remaining time with smooth visual feedback without visual stuttering or skipped frames
- **Why this works:** setInterval has variable execution timing (browser throttling, event loop blocking). requestAnimationFrame is synchronized to browser refresh rate (60/120fps), providing smooth animation. SVG ring provides more precise visual representation than text countdown.
- **Trade-offs:** requestAnimationFrame approach is more complex and requires continuous component re-renders, but delivers superior visual quality. Trade CPU cycles for UX smoothness.

### State machine approach (approved: null | true | false) used instead of string enum or combined 'state' + 'status' fields (2026-02-18)
- **Context:** Component needs three distinct states: awaiting approval, approved, rejected - each with different UI and behavior
- **Why:** Boolean null-state pattern maps naturally to approval workflow: null = pending decision, true = approved, false = rejected. Eliminates need for separate enum or multiple fields. Matches common backend API pattern (nullable boolean) reducing transformation logic.
- **Rejected:** String enum like 'pending'|'approved'|'rejected' - more verbose, requires mapping. Separate isApproved + isRejected booleans - creates invalid state combinations (both true simultaneously).
- **Trade-offs:** Implicit state machine (null is meaningful, not just absence) requires developers to understand this convention. More concise than alternatives but less self-documenting.
- **Breaking if changed:** Changing to enum forces all approval data transformations across codebase. Changing to separate booleans creates need for validation logic to prevent invalid states.

### Empty state display ('No idea sessions yet') instead of rendering empty canvas (2026-02-18)
- **Context:** Analytics view with no idea flow data to display initially
- **Why:** User feedback clarity - shows feature is working but has no data; prevents confusion with loading/error states; aligns with empty state pattern seen elsewhere
- **Rejected:** Always rendering empty canvas - would be confusing when no data exists
- **Trade-offs:** Requires conditional rendering and empty state component; clearer UX but adds slight complexity to view logic
- **Breaking if changed:** Removing conditional breaks the feedback loop when transitioning from system graph tab with data to empty ideas tab

#### [Gotcha] ReactFlow EdgeProps type assertion required for custom data access - cannot pass custom data type directly to EdgeProps generic (2026-02-18)
- **Situation:** Initial implementation attempted to use EdgeProps<{ status?: StepStatus }> but @xyflow/react expects base EdgeProps type with type assertion on data prop
- **Root cause:** ReactFlow's EdgeProps is designed for the framework's internal typing contract, not user data. Custom data must be extracted at runtime via type assertion (data as { status?: StepStatus })?.status
- **How to avoid:** Requires runtime type assertion which is less type-safe than generic approach, but maintains compatibility with ReactFlow's type system and allows flexible data passing

#### [Pattern] SVG gradient definitions scoped per edge using useId() to prevent ID conflicts in DOM (2026-02-18)
- **Problem solved:** Multiple edges rendered simultaneously each with their own gradient animations; global IDs would cause conflicts
- **Why this works:** SVG requires unique IDs for gradient/animation definitions. useId() generates unique identifiers per component instance ensuring no collisions when multiple edges render
- **Trade-offs:** Adds React hook dependency and slight runtime overhead for ID generation, but eliminates a class of subtle rendering bugs and is the React-idiomatic solution

#### [Pattern] SVG animateMotion with mpath follows WorkflowEdge pattern for particle effects - animation targets path element via mpath reference (2026-02-18)
- **Problem solved:** Need for smooth animated particles flowing along curved edges similar to existing WorkflowEdge component
- **Why this works:** mpath allows animation to follow arbitrary SVG path shapes. Using the same pattern as WorkflowEdge ensures consistency and leverages proven animation approach
- **Trade-offs:** SVG animateMotion is declarative and lightweight but requires SVG-specific knowledge; animation performance depends on browser's SVG rendering capabilities

### Five visual states (active, completed, pending, skipped, error) with asymmetric animation strategies - only active/completed have particles (2026-02-18)
- **Context:** Need to visually distinguish pipeline step completion statuses while maintaining visual clarity for non-executing states
- **Why:** Particle animations are attention-grabbing and should indicate dynamic activity. Only active (in-progress) and completed states warrant motion. Pending shows intent, skipped/error are terminal non-completion states
- **Rejected:** All states with particles (creates visual noise), or no states with particles (loses visual feedback of completion)
- **Trade-offs:** Animation complexity trades off against visual clarity - selective animation prevents cognitive overload while maintaining status differentiation
- **Breaking if changed:** Removing animation from completed state removes celebration/completion feedback; removing from active state removes in-progress indication

### Asymmetric animation durations: fast particles for active (2.5s), slow for completed (5s) (2026-02-18)
- **Context:** Visual distinction needed between active (currently processing) vs completed (finished) states using same particle mechanism
- **Why:** Speed conveys urgency/activity level - faster animation suggests active work, slower suggests calm completion. Different durations prevent visual confusion between states
- **Rejected:** Same duration (loses state differentiation), or no animation for completed (loses completion feedback)
- **Trade-offs:** Additional duration constants add cognitive load but provide clear visual feedback; users must learn association between speed and state
- **Breaking if changed:** Using same duration makes active/completed visually identical; removing completed animation removes completion feedback mechanism

#### [Pattern] OKLCH color space used for consistent theming across status states - emerald (completed), red (error), with L/C/H components (2026-02-18)
- **Problem solved:** Need colors that match app design system and maintain perceptual consistency across different backgrounds
- **Why this works:** OKLCH provides perceptually uniform color space - adjusting lightness/chroma produces consistent perceived color shifts across app. Matches existing app theme infrastructure
- **Trade-offs:** OKLCH requires modern browser support and understanding of L/C/H parameters, but guarantees consistent color appearance

#### [Pattern] Grouped sessions into four status buckets (processing, awaiting, completed, failed) rather than displaying flat list (2026-02-18)
- **Problem solved:** IdeaListPanel needed to organize potentially hundreds of sessions for scanability
- **Why this works:** Cognitive grouping reduces decision fatigue. Mirrors typical workflow states users mentally categorize. Parallels existing patterns in flow-graph panels.
- **Trade-offs:** More code for grouping logic, but dramatically improved UX. Users can quickly find sessions by status without scrolling.

#### [Gotcha] Used `formatDistanceToNow` from date-fns for timestamps instead of absolute times or ISO strings (2026-02-18)
- **Situation:** Panel displays relative timestamps like '2 minutes ago' for better UX than machine-readable times
- **Root cause:** Relative times are immediately understood by users without mental math. Matches common patterns in chat/feed interfaces.
- **How to avoid:** Timestamps become stale without re-rendering. Component needs update mechanism to refresh timings periodically (or parent handles via prop updates).

### PipelineToolbar uses data-driven approach with icon/label/state mappings instead of individual button components (2026-02-18)
- **Context:** Toolbar has three identical toggle buttons (List, Detail, Legend) with different labels and callbacks
- **Why:** Reduces code duplication, makes adding new toggles trivial, scales better than copy-paste button components
- **Rejected:** Three separate button components - leads to maintenance burden and inconsistency drift
- **Trade-offs:** Slight indirection in reading code, but gained extensibility. Button definitions could move to constants/config if this expands.
- **Breaking if changed:** If button structure changes (e.g., new required prop), array element schema must be updated everywhere it's defined.

#### [Gotcha] Fixed panel dimensions (264px width, 400px height) instead of responsive/flexible sizing (2026-02-18)
- **Situation:** IdeaListPanel has hardcoded w-66 and h-100 (Tailwind units)
- **Root cause:** ReactFlow canvas context requires predictable floating panel sizing to avoid layout thrashing. Fixed sizing allows canvas to reserve space.
- **How to avoid:** Works great in 1024px+ viewports, but may overflow on mobile. Panel doesn't adapt to content. Need responsive breakpoints for smaller screens.

#### [Pattern] Dialog components export both default component and typed Props interface for consumer flexibility (2026-02-18)
- **Problem solved:** Building reusable dialog components that need to be integrated into multiple parts of the idea flow pipeline
- **Why this works:** Allows consumers to reference the exact props type without needing to import from implementation files, enables better IDE autocomplete and type safety at call sites
- **Trade-offs:** Adds boilerplate in component definition but dramatically improves ergonomics for consumers - prevents prop type guessing and runtime errors

### Langfuse URL generation uses process.env.LANGFUSE_BASE_URL with cloud.langfuse.com fallback (2026-02-18)
- **Context:** Need to link step details to Langfuse tracing platform spans from dialog component
- **Why:** Allows deployment-time configuration for self-hosted Langfuse instances while defaulting to SaaS version, keeps credentials/URLs out of code
- **Rejected:** Hardcoding cloud.langfuse.com URL directly in component, or storing base URL in app config
- **Trade-offs:** Requires env var setup but enables multi-environment deployments; fallback ensures component works even if env not set
- **Breaking if changed:** If env var name changes, all Langfuse links will point to wrong domain; if fallback is removed, deployments without env var will break

#### [Gotcha] Countdown timer needs careful useEffect cleanup to prevent memory leaks and race conditions (2026-02-18)
- **Situation:** ApprovalDialog implements auto-approval countdown that updates UI every second
- **Root cause:** setInterval persists across renders; if not cleaned up on unmount or when countdown completes, multiple intervals stack up and trigger callbacks after dialog closes
- **How to avoid:** Proper cleanup prevents subtle bugs but adds complexity - must track interval ID and clean on unmount/completion

#### [Pattern] Color-coded badge system abstracted to getBadgeColor() utility function (2026-02-18)
- **Problem solved:** Multiple fields (impact, effort) need visual status indicators with consistent styling
- **Why this works:** Centralizes color mapping logic so color scheme changes only happen in one place; prevents inconsistent styling across component
- **Trade-offs:** Adds function call overhead but massively improves maintainability - single source of truth for color logic

### Step detail dialog displays JSON with disabled textarea instead of formatted code block (2026-02-18)
- **Context:** Need to show complex nested input/output data structures from pipeline steps
- **Why:** Textarea preserves formatting and structure readability while disabled state prevents accidental edits; simpler than implementing syntax highlighting
- **Rejected:** Using <pre> tags with syntax highlighting library, or collapsible tree view for JSON navigation
- **Trade-offs:** Less visually polished than syntax highlighting but significantly simpler to implement; loses ability to navigate large JSON structures interactively
- **Breaking if changed:** If textarea is replaced with other display method, must ensure JSON formatting/readability is preserved or users lose visibility into data structure

#### [Gotcha] Duration calculation from timestamps must handle missing startTime/endTime gracefully (2026-02-18)
- **Situation:** Some pipeline steps may not have complete timing information logged
- **Root cause:** Not all steps may finish executing or may fail before timing data is captured; attempting duration calculation on null/undefined causes NaN display
- **How to avoid:** Adds null checks but prevents broken UI when timing data missing

### Pipeline step node status rendered as visual indicator (color-coded border) rather than text label or icon badge (2026-02-18)
- **Context:** Need to show pipeline step status (pending/active/completed/skipped/error) at a glance in flow visualization
- **Why:** Border-based status indicator takes minimal space in node, maintains readability at zoom levels, color coding is universally understood (green=success, red=error, yellow=pending), doesn't require hover for information. Aligns with existing flow-graph patterns in codebase.
- **Rejected:** Icon badges (would add visual clutter); text labels (would exceed node size); status inside detail panel only (requires click to discover state)
- **Trade-offs:** Gained spatial efficiency and immediate visual recognition; required consistent color mapping across all statuses; limited to ~5 statuses before color confusion; breaks if colorblind accessibility not considered
- **Breaking if changed:** If border styling removed or made subtle, status visibility lost entirely. If color palette changed without maintaining contrast, accessibility fails. If node is zoomed far out, border status becomes imperceptible.

### Detail panel positioned as floating overlay rather than sidebar drawer, with fixed positioning and explicit z-index layering (2026-02-18)
- **Context:** Need to display session state without consuming horizontal canvas space in flow visualization
- **Why:** Floating overlay allows canvas to remain full-width for React Flow nodes. Fixed positioning works across scroll contexts. Explicit z-index stack (detail=50, menu=50, backdrop=40) prevents accidental overlap issues. Backdrop click handler provides clear close affordance.
- **Rejected:** Sidebar drawer (loses canvas space); modal dialog (blocks canvas interaction); inline detail in node (exceeds node size)
- **Trade-offs:** Gained: preserves full canvas space, can hover over canvas while panel open; Lost: panel can occlude other nodes (mitigated by close affordance), positioning sometimes breaks on small screens (responsive breakpoints needed)
- **Breaking if changed:** If z-index values changed without coordination, panel disappears behind canvas. If close handler removed, users can't dismiss panel. If fixed positioning removed, scrolling breaks panel visibility.

#### [Gotcha] Removing the tab bar from analytics required also removing the useSearch hook and Zod schema, not just the UI component (2026-02-18)
- **Situation:** Initial refactor might have only removed the tab UI buttons while leaving the schema and search hook intact, leaving dead code
- **Root cause:** The Zod schema validates the 'tab' parameter at the route level. If left in place, it would either silently fail to validate or would allow an unused parameter to be passed to /analytics, creating confusion about the route's actual interface
- **How to avoid:** Requires touching the route definition in addition to the view component. Makes the change slightly larger but cleaner and more correct

### Removed tab bar UI state management entirely rather than adding conditional logic to hide tabs - cleaner separation of concerns (2026-02-18)
- **Context:** Idea Pipeline moved from analytics tab to own sidebar item, leaving only System Graph in analytics
- **Why:** Eliminates unused state (`analyticsSearchSchema`, `useSearch` hook) and 40+ lines of conditional rendering. Each route now has single responsibility
- **Rejected:** Keep tab bar but conditionally hide/show based on route - would create hidden complexity and make future maintenance harder
- **Trade-offs:** Simpler components but requires new route file; easier to reason about but slightly more routing boilerplate
- **Breaking if changed:** If future features need tab selection in analytics, would need to rebuild the state management pattern

#### [Gotcha] Storybook stories.array config with multiple globs must maintain order: local app stories BEFORE library stories, otherwise type discovery or import resolution can fail (2026-02-18)
- **Situation:** Added '../../../libs/ui/src/**/*.stories' to stories array that already had '../src/**/*.stories'. Configuration order matters for module resolution.
- **Root cause:** Storybook processes stories array in sequence. If library path comes first and apps/ui stories import from libs/ui, the library stories may be processed before @protolabs-ai/ui module symlink is fully resolved by the monorepo.
- **How to avoid:** Correct ordering ensures reliable builds but requires discipline—new maintainers may accidentally reorder and break CI silently (build succeeds, stories fail to load at runtime).

#### [Gotcha] Interactive Storybook controls (argTypes) enable dark/light theme switching without explicit story variants - Storybook's theme addon handles this automatically (2026-02-18)
- **Situation:** Requirement stated 'dark/light comparison possible' but implementation doesn't have separate Dark/Light variant stories. Instead, argTypes + Storybook theme switcher UI achieves this
- **Root cause:** Storybook's built-in theme switching (via toolbar) applies CSS class/theme context globally. Components using CSS variables for theming (shadcn pattern) automatically render in both themes without duplicate stories. This is more maintainable than duplicating every story
- **How to avoid:** Fewer stories (193 total) with automatic theme switching vs 2x stories with explicit variants. First approach scales better - adding a new component doesn't double story count

### Theme system documentation should enumerate all available themes with their characteristics (light/dark mode, color palette, use cases) rather than generic 'how to switch themes' (2026-02-18)
- **Context:** Writing theme setup section of README had to balance between technical 'how to' and discovery 'which theme fits my project'
- **Why:** Users evaluating the package need to know what visual options exist before writing code. Listing 6 specific themes (studio-light, studio-dark, nord, catppuccin, dracula, monokai) with their characteristics (perceptual uniformity via OKLch, design intent) lets them make informed choice upfront rather than trying themes trial-and-error.
- **Rejected:** Alternative: Generic 'import theme and apply' without listing options. Would force users to browse source code to discover available themes.
- **Trade-offs:** Longer documentation initially, but reduces friction for new users and showcases package variety. Small maintenance burden if new themes added (must update enumeration).
- **Breaking if changed:** If theme enumeration becomes stale (new theme added but not documented), users miss it and may not use it. Creates false sense that only documented themes exist.

#### [Pattern] Dual-handle architecture for decision nodes: Target handle at top, dual source handles (bottom + left/right) to support multi-branch flows (2026-02-19)
- **Problem solved:** Decision nodes in flow graphs need to route to multiple downstream paths based on conditions
- **Why this works:** Allows edges from decision node to visually branch in different directions (left/right) while maintaining top-target/bottom-source convention for linear flow. Root handle on bottom for direct next, left/right for conditional branches
- **Trade-offs:** More complex handle configuration but enables cleaner visual layout. Requires edge routing logic to interpret handle positions

### Using OKLCh color space (oklch) for edge colors instead of Tailwind semantic names (2026-02-19)
- **Context:** Edge component needed consistent, non-theme-dependent colors that remain readable regardless of context
- **Why:** OKLCh provides perceptually uniform color space and allows precise control of conditional vs standard edge differentiation. Semantic Tailwind colors can drift with theme changes
- **Rejected:** Direct Tailwind classes (e.g., 'stroke-orange-500') would require className props and dynamic Tailwind generation, or hardcoded color extraction
- **Trade-offs:** More precise color control and theme-independent, but harder to audit colors visually. OKLCh values are not human-readable
- **Breaking if changed:** Switching to Tailwind classes requires refactoring edge styling logic and may expose theme dependency issues in production

#### [Gotcha] EdgeLabelRenderer requires absolute positioning with translate to center labels on edge paths, plus 'nodrag nopan' classes to prevent interaction conflicts (2026-02-19)
- **Situation:** Edge labels need to render at calculated midpoints on bezier curves without interfering with pan/zoom behavior
- **Root cause:** EdgeLabelRenderer renders into a separate portal layer (not React Flow canvas). Absolute positioning with translate(-50%, -50%) centers the label, then translate(labelX, labelY) positions it. nodrag/nopan classes prevent the label from being dragged/panned unintentionally
- **How to avoid:** Portal-based labels are interactive and styleable but require careful coordinate calculation and DOM event handling

### Using OKLCh colors directly in style objects instead of CSS variables, despite having Tailwind classes for labels (2026-02-19)
- **Context:** Edge stroke colors need to be dynamic (conditional vs standard) but not themeable
- **Why:** Inline OKLCh values in style prop are evaluated at render time based on edge data. Keeps color logic colocated with the conditional check. CSS variables would require theme context or SCSS generation
- **Rejected:** Using className with ternary operator for Tailwind color classes requires mapping conditional states to class names, losing precision
- **Trade-offs:** Inline styles are not extracted to CSS/theme config but remain simple and data-driven. Consistent with how label badge styling handles conditional theming via className
- **Breaking if changed:** Extracting stroke colors to Tailwind requires either CSS variable architecture or dynamic class generation, increasing complexity

#### [Gotcha] React Flow Handle placement is position-relative to node bounds, not absolute canvas coordinates. Top/bottom positions place handles at horizontal center (2026-02-19)
- **Situation:** Creating node components with specific handle positions for top-target and bottom-source pattern
- **Root cause:** React Flow internally manages handle positions within node bounds using CSS positioning. 'top' position centers horizontally and aligns to node top edge. This is framework convention, not implemented in component
- **How to avoid:** No manual position control but integrates cleanly with React Flow's drag/zoom system

#### [Pattern] Dagre hierarchical layout with specific tuning (TB orientation, ranksep=80, nodesep=40) for LangGraph visualization (2026-02-19)
- **Problem solved:** React Flow canvas needed automatic layout for complex flow graphs without manual positioning
- **Why this works:** Dagre provides deterministic hierarchical layout suitable for directed acyclic graphs (typical LangGraph structure). Tuned spacing prevents node overlap and makes execution flow visually clear top-to-bottom.
- **Trade-offs:** Easier: automatic consistent layouts. Harder: layout is deterministic but may not be optimal for all graph shapes. Large graphs may overflow viewport.

#### [Pattern] Dynamic statusLine text changes based on active state (e.g., 'Monitoring sources' vs 'Linear, GitHub, Discord, MCP') (2026-02-19)
- **Problem solved:** Need to distinguish between placeholder descriptions and actual activity states in flow graph UI
- **Why this works:** Tells user whether node is actively processing data vs showing static description. Improves perceived liveness of the system without backend metrics
- **Trade-offs:** Adds complexity to switch logic and increases text maintenance burden, but significantly improves UX clarity

#### [Pattern] Using framework-provided CSS classes (.react-flow__node, .react-flow__controls) for test selectors instead of custom test IDs (2026-02-21)
- **Problem solved:** Testing React Flow components without modifying the library
- **Why this works:** Avoids adding test IDs to third-party library code. Framework CSS classes are part of public API contract and stable across versions. Reduces friction of testing external components.
- **Trade-offs:** Test coupling to CSS class names (lower stability than test IDs) vs avoiding library modification

### Phase timeline fit into existing node footprint using extreme constraint design (7-9px fonts, 2.5px icons, zero padding) rather than expanding node dimensions (2026-02-23)
- **Context:** Phase timeline visualization added to agent nodes. Could expand node height or compress layout. Chose compression to avoid cascading layout changes across canvas.
- **Why:** Agent node is compound unit for React Flow layout calculations. Expanding any node triggers boundary recalculations for all edges and parent containers. Maintaining fixed dimensions preserves canvas stability and readability density with multiple concurrent agents.
- **Rejected:** Expanding node height to accommodate phase timeline with readable font sizes (11-14px)
- **Trade-offs:** Very small text requires zoom/accessibility accommodations; tight spacing reduces click targets and uses hover tooltips for discovery. Benefit: canvas remains layout-stable across phase updates. Loss: readability at normal zoom.
- **Breaking if changed:** If additional real-time indicators added to nodes (error badges, status lights, resource gauges), the 7-9px baseline becomes unsustainable. Any expansion breaks the cascading layout assumption.

### Tool executions are matched to phases via a `phase` field on the tool execution object, not by array index or timestamp. (2026-02-23)
- **Context:** TimelineVisualization receives both `phaseDurations` (phases) and `toolExecutions` (array of tools with execution data). Component iterates phaseDurations and then maps toolExecutions by reading their `phase` field.
- **Why:** Tools are often async and may complete out-of-order. Field-based matching is resilient to reordering. Index-based matching would fail if a tool completes before an earlier phase finishes, or if phases/tools are sparse.
- **Rejected:** Using array indices: `toolExecutions[phaseIndex]` would assume 1:1 correspondence and strict ordering. Rejected because it breaks with concurrent tool execution.
- **Trade-offs:** Gains: handles out-of-order completions, flexible data structure. Loses: silent failure if a tool's `phase` field is missing or mismatched (tool appears unassigned to any phase).
- **Breaking if changed:** If callers stop populating the `phase` field on tool execution objects, all tools vanish from the timeline UI. No error is raised; the visualization silently becomes incomplete.

#### [Pattern] Proportional bar width visualization uses the longest phase duration as the 100% reference, allowing relative duration comparison at a glance. (2026-02-23)
- **Problem solved:** TimelineVisualization renders each phase as a bar with width proportional to its duration, divided by the max duration in the timeline.
- **Why this works:** Enables rapid visual scanning: long bars = slow phases, short bars = quick phases. Avoids fixed widths which would require scrolling for long timelines or waste space for short ones.
- **Trade-offs:** Gains: instant visual bottleneck identification. Loses: absolute timing is harder to read—user must infer from labels.

#### [Pattern] Graceful degradation rendering: timeline displays correctly with undefined phaseDurations, undefined currentPhase, and null activeTool (2026-02-23)
- **Problem solved:** WebSocket events may arrive out-of-order or be delayed, leaving fields undefined when component first renders
- **Why this works:** Robust UX under unreliable network conditions. Incomplete but correct UI is better than waiting for all data (which would cause jarring transitions and flickering). Aligns with eventual consistency model.
- **Trade-offs:** Shows incomplete timeline (pending phases as circles) vs complete timeline. This is deliberate - better to show work-in-progress than block rendering.

### Fixed 160x70px node dimensions constraint forced micro-typography (7-9px labels, 8px tool badge, 2.5px icons) and drove all spacing decisions (2026-02-23)
- **Context:** Flow graph readability and density requirements conflict with adding 4-phase timeline visualization
- **Why:** Extreme constraints breed creative solutions. The proportional visual hierarchy (current phase 5px icon, label 9px, spacing 2px) only works within this constraint. Scaling linearly breaks it.
- **Rejected:** Increasing node size to 200x100px - this would reduce graph density and make the visualization less valuable for monitoring many agents.
- **Trade-offs:** Very small text requires careful font selection and color contrast. Gained: preserved visual density and node readability.
- **Breaking if changed:** Removing the 160x70px constraint would break the proportional design - fonts would need to scale non-linearly, spacing would collapse, the hierarchy falls apart.

#### [Pattern] Pulsing animation (framer-motion infinite repeat) for active phase indicator vs static color changes for state feedback (2026-02-23)
- **Problem solved:** Communicating 'currently running' state for the active phase to the user scanning multiple agent nodes
- **Why this works:** Motion is more effective than color alone at capturing attention and indicating liveness. User's eye is drawn to motion first, allowing quick status assessment without reading labels.
- **Trade-offs:** Animation costs minor GPU cycles but provides significantly better UX feedback. Pulsing is less distracting than faster animations.

#### [Gotcha] Tool badge fade-out delay (2-second timeout after tool completion) prevents jarring UI updates from quick tool executions (2026-02-23)
- **Situation:** Tools that complete in milliseconds (grep, quick API calls) would otherwise cause immediate badge disappearance, creating visual flicker
- **Root cause:** Micro-timing UX pattern. Humans perceive <250ms transitions as jarring. 2s delay gives the badge time to feel intentional, not buggy. Smooth fade prevents distraction.
- **How to avoid:** 2s delay increases perceived latency of tool completion feedback vs snappy immediate hide. Tradeoff worth it for perceived smoothness.

#### [Pattern] Visual state detection via Tailwind CSS class inspection ('text-violet-400') rather than computed styles. Button highlight state is encoded in source-controlled class names. (2026-02-23)
- **Problem solved:** Verifying panel open/close state by checking icon CSS classes
- **Why this works:** CSS classes are deterministic, git-tracked, and survive minification. Computed styles vary by browser rendering engine.
- **Trade-offs:** Class-based assertions are fragile to theme changes but reliable across environments. Computed style checks are resilient but slow and environment-dependent.

#### [Pattern] Analytics panel uses aria-label='Close analytics panel' for close button. Semantic labeling required even when visible button has visual affordance. (2026-02-23)
- **Problem solved:** Ensuring accessibility for screen reader users
- **Why this works:** Visual affordance (X icon) is not sufficient for assistive technology users. aria-label bridges semantic gap.
- **Trade-offs:** Additional attribute cost is minimal. Requires discipline to maintain aria-label consistency as UI evolves.

#### [Gotcha] Status row rendering depends on compound condition: settings.enabled && status?.data exists (2026-02-24)
- **Situation:** Status section only appears when ceremonies enabled AND status API response succeeds
- **Root cause:** Avoids showing broken UI if query fails; prevents showing stale data when ceremonies disabled. Keeps related data together
- **How to avoid:** Simple logic but creates hidden dependency: if status query fails, entire status display vanishes without indication. Users may miss Discord failures due to query failure

### Warning banner reuses existing visual pattern (yellow border/bg, AlertTriangle icon) rather than creating new design (2026-02-24)
- **Context:** Needed to warn about missing Discord integration in ceremony settings
- **Why:** Maintains visual consistency across codebase. Users recognize yellow warning pattern from other features. Reduces design debt and cognitive load
- **Rejected:** New custom design, red alert pattern, different icon
- **Trade-offs:** Yellow warning is slightly less urgent-looking than red; maintains consistency at cost of visual differentiation. Prevents design system fragmentation
- **Breaking if changed:** If codebase refactors warning pattern without updating all uses (like this banner), visual inconsistency breaks design intent. Requires tracking all uses

### Added prominent 'Get launch-day access' CTA in hero despite existing 'Get Notified' link in navigation. (2026-02-24)
- **Context:** Landing page with existing waitlist nav link but low conversion on email capture
- **Why:** Hero section receives immediate visual focus before scrolling; navigation links have lower engagement. Primary CTA placement increases discoverability.
- **Rejected:** Rely only on nav link (low conversion), or replace nav link entirely (breaks existing UX patterns)
- **Trade-offs:** Increased visual hierarchy and conversion vs. UI redundancy and scrolling friction
- **Breaking if changed:** Removing hero CTA would hide the primary conversion path behind scroll/nav discovery

#### [Pattern] Button state progression: disabled button + loading spinner + text change ('Submit' → 'Submitting...') all applied together as a single atomic state change during form submission. (2026-02-24)
- **Problem solved:** Preventing duplicate submissions and providing user feedback during async operation
- **Why this works:** Individual state changes (just disabling button) leave UI ambiguous - user doesn't know if click registered or if form is processing. Combined state makes intent clear.
- **Trade-offs:** More JavaScript complexity but significantly better perceived responsiveness; requires careful state management to avoid partial state

### Hero section has THREE CTAs with distinct styling (primary 'Get launch-day access' → form, secondary 'See how it works', tertiary 'Read docs') rather than single primary button. (2026-02-24)
- **Context:** Maximizing conversion while accommodating different user intents
- **Why:** Different users have different motivations - some want to reserve early access, some want to learn first, some want full documentation. Multiple CTAs serve each intent.
- **Rejected:** Single primary CTA - would force all users through one path, losing conversions from users who want alternative entry points
- **Trade-offs:** More visual clutter and potential distraction from primary goal, but captures broader audience and improves overall conversion rate
- **Breaking if changed:** If you remove secondary/tertiary CTAs, users primarily interested in learning or docs would have no clear next step.