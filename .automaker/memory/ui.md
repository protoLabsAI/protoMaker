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