# Streaming Text Rendering — SPARC PRD

**Project:** Ava Chat Surface — Streaming Render Pipeline  
**Status:** Approved  
**Scope:** Frontend-only · Ava chat UI surface  
**Stack:** React 19 · Vite 7 · TanStack Router · Zustand 5 · Tailwind CSS 4 · `@protolabsai/ui`

---

## Situation

The Ava chat UI streams assistant responses token-by-token into a message list. The render pipeline was built for completeness-first rendering and has not been hardened for high-frequency streaming updates. Six distinct failure modes have been identified:

1. **Plugin array remount** — `plugins` prop is constructed inline, creating a new array reference on every render. Any renderer keying off prop identity fully unmounts and remounts on each token, producing visible flicker.
2. **Unsafe incremental markdown** — partial tokens at message boundaries are passed directly to the sanitizer, causing layout thrash as the DOM oscillates between error-recovery states.
3. **Syntax highlighting during streaming** — runs on every token append, invoking expensive AST traversal at 10–30 Hz. Causes measurable jank on mid-tier hardware.
4. **Scroll behavior** — message list does not maintain scroll lock during streaming. New tokens cause layout shifts without compensating scroll.
5. **No streaming cursor** — no visual affordance that the assistant is still typing.
6. **Full re-render on every token** — long messages re-render every segment from scratch on each new token because segment identity is not preserved.

---

## Problem

**User-facing:** Chat responses flicker, scroll jumps unexpectedly, long messages visibly lag, and there is no "typing" cue.

**Technical:**
- Plugin array instability causes O(n) unmount/remount work per token
- Unsafe markdown parsing triggers fallback rendering that produces DOM churn
- Highlight-on-token makes GPU/CPU budget proportional to code block length
- Missing scroll compensation means viewport drifts during active streaming
- No segment memoization means render cost is O(total message length) per token

---

## Approach

Contained, layered hardening of the existing streaming render path. No new abstractions beyond what is necessary.

```
Token stream (Zustand store)
        │
        ▼
 useStreamMessage hook          ← scroll lock lives here (useLayoutEffect)
        │
        ▼
 MessageBubble component        ← streaming cursor rendered here
        │
        ▼
 StreamingMarkdown component    ← owns sanitization, segmentation, memoization
        │                          gates syntax highlight on isComplete
        ▼
 <Markdown> molecule            ← stable plugins ref, never remounts
   (@protolabsai/ui)
```

---

## Results

- ✅ No flicker during streaming — plugin remount eliminated
- ✅ Smooth scroll that tracks the message tail during streaming
- ✅ Animated cursor communicates "assistant is still typing"
- ✅ No jank on long code blocks during streaming — highlighting deferred
- ✅ Long messages render at constant cost per new token (O(1) segment re-render)

| Metric | Current | Target |
|--------|---------|--------|
| Plugin remounts per streamed message | ~200–500 | 0 |
| Visible flicker during streaming | Yes | No |
| Scroll drift on 1000-token message | Yes | No |
| Syntax highlight invocations during stream | ~10–30 Hz | 0 |
| Re-rendered segments per new token | All | 1 (tail) |

---

## Constraints

- React 19 concurrent mode — mutations must be safe under concurrent rendering
- All rendered elements use `@protolabsai/ui` primitives — no bare HTML, no hardcoded colors
- Tailwind CSS 4 only — no inline styles, no CSS-in-JS
- `<Markdown>` molecule is the renderer — extend via props/plugins only, do not fork
- No changes to streaming data layer (Zustand store, WebSocket/SSE protocol)
- No new shared library packages except additive prop additions to `@protolabsai/ui`

---

## Milestones & Phases

### Milestone 1 — Foundation: Stability & Correctness

#### Phase 1.1 — Fix Plugin Array Remount Bug
**Complexity:** small

Replace all inline plugin array constructions with module-level constants or `useMemo(() => [...], [])`. Verify no plugin array is reconstructed as a side effect of a state update during streaming.

**Files:** `packages/ui/src/molecules/Markdown/Markdown.tsx`, `apps/ava/src/components/chat/MessageBubble.tsx`, `apps/ava/src/hooks/useMarkdownPlugins.ts`

**Acceptance Criteria:**
- 0 `<Markdown>` unmount/remount events during a streamed message of ≥100 tokens
- Unit test: 10 token appends → Markdown component never unmounts

#### Phase 1.2 — Streaming-Safe Markdown Sanitization
**Complexity:** medium

Create `sanitizeStreaming` utility with a pre-pass that closes dangling markdown tokens (unclosed inline code, fenced blocks, bold, italic, link syntax) before sanitization.

**Files:** `apps/ava/src/utils/sanitizeStreaming.ts`, `apps/ava/src/utils/sanitizeStreaming.test.ts`, `apps/ava/src/components/chat/StreamingMessage.tsx`

**Acceptance Criteria:**
- Unit tests cover all dangling token patterns
- No layout thrash during streamed messages containing code blocks
- Sanitized output parses to valid markdown AST

---

### Milestone 2 — Performance: Eliminate Streaming Jank

#### Phase 2.1 — Gate Syntax Highlighting Behind `isComplete`
**Complexity:** medium

Add `syntaxHighlight?: boolean` prop to `<Markdown>` molecule. When `false`, code blocks render in plain monospace. When `true` (`isComplete === true`), full highlight pipeline runs once.

**Files:** `packages/ui/src/molecules/Markdown/Markdown.tsx`, `packages/ui/src/molecules/Markdown/CodeBlock.tsx`, `apps/ava/src/components/chat/MessageBubble.tsx`

**Acceptance Criteria:**
- 0 highlight-related long tasks (>16ms) during streaming
- Full highlighting renders within 100ms after `isComplete` fires
- Backward compatible — existing `<Markdown>` usages default to `syntaxHighlight={true}`

#### Phase 2.2 — Segment Memoization for Long Messages
**Complexity:** large

Introduce `SegmentedMessage` component that splits content at structural boundaries (paragraph breaks, headings, horizontal rules). Each segment is a memoized component keyed by `${segmentIndex}-${contentHash}`. Only the tail segment re-renders per token.

**Files:** `apps/ava/src/components/chat/SegmentedMessage.tsx`, `apps/ava/src/utils/segmentMarkdown.ts`, `apps/ava/src/utils/hashString.ts`, `apps/ava/src/components/chat/MessageBubble.tsx`

**Acceptance Criteria:**
- Only 1 segment re-renders per token append (profiler verified)
- Output identical to non-segmented rendering (snapshot test)
- Messages under 500 chars use existing path

---

### Milestone 3 — Polish: Scroll Lock & Streaming Cursor

#### Phase 3.1 — Scroll Lock with `useLayoutEffect`
**Complexity:** medium

Create `useScrollLock` hook. Lock acquired on new stream start, active via `useLayoutEffect` scroll compensation, released on user scroll-up (>50px from bottom), re-acquired on next message.

**Files:** `apps/ava/src/hooks/useScrollLock.ts`, `apps/ava/src/components/chat/MessageList.tsx`, `apps/ava/src/components/chat/ChatPane.tsx`

**Acceptance Criteria:**
- Viewport stays pinned to bottom throughout 500-token stream
- User scroll-up releases lock; new message re-acquires
- `useLayoutEffect` used (not `useEffect`)

#### Phase 3.2 — CSS Streaming Cursor
**Complexity:** small

`StreamingCursor` component renders inline after tail segment. CSS keyframe animation (`opacity: 1 → 0 → 1` at ~1Hz) via Tailwind config. Unmounted (not hidden) when `isComplete` flips.

**Files:** `apps/ava/src/components/chat/StreamingCursor.tsx`, `apps/ava/src/components/chat/SegmentedMessage.tsx`, `apps/ava/tailwind.config.ts`

**Acceptance Criteria:**
- Cursor blinks at ~1Hz via CSS only
- Fully unmounted on `isComplete` (not just hidden)
- No reflow when cursor appears/disappears

---

## Execution Order

1.1 → 1.2 → 2.1 (parallel with 3.1) → 2.2 → 3.2

Dependencies:
- 1.1 must complete before 1.2, 2.1, 3.2
- 1.2 must complete before 2.2
- 2.1 and 3.1 are independent (parallel)
- 2.2 must complete before 3.2
