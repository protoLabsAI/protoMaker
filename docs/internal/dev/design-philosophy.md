# Design philosophy

Design decisions for protoLabs's UI, informed by Linear, Vercel, and shadcn/ui. This document is the source of truth for visual direction — agents and humans should reference it when making UI decisions.

## Inspirations and what we take from each

### Linear

Linear is the north star. Their UI communicates competence through restraint.

**What makes it work:**

- **Near-monochrome palette** — The app is almost entirely gray. Color exists only for status and the single brand accent (indigo `#5E6AD2`). This makes the content the hero, not the chrome.
- **Dark mode first** — Background is a warm charcoal (`#222326` / Woodsmoke), not pure black. Cards and surfaces differ by just 2-4% lightness. The eye reads hierarchy through subtle elevation, not color contrast.
- **Tight density** — Rows are 32-36px tall. Padding is 8-12px. Everything feels packed but never cramped because typography does the spacing work.
- **Borders over shadows** — 1px borders at ~10% white opacity. No drop shadows on cards. Shadows reserved for popovers and command palette only.
- **LCH color space** — Linear switched to LCH for theme generation because it's perceptually uniform. We use OKLCH for the same reason.
- **Minimal status colors** — Green, yellow, orange, red. Low chroma (~0.12-0.15), never neon. Status is information, not decoration.
- **Keyboard-first, animation-restrained** — Transitions are 150ms or less. Nothing bounces. Focus rings are subtle 2px outlines. The UI never draws attention to itself.

### Vercel

Vercel's dashboard is the cleanest light+dark mode implementation in production.

**What makes it work:**

- **Geist font family** — Inter-based, designed for UI density. We use Geist Sans + Geist Mono for the same reason.
- **Binary color system** — Almost entirely black/white with a single accent. Status dots are tiny (6-8px) with muted colors. The dashboard works in monochrome.
- **Border radius: 6px** — Not 0 (harsh), not 12px (bubbly). 6px reads as "engineered." Buttons, cards, inputs all share one radius.
- **Focus states** — 2px blue ring with 2px offset. Visible but not loud.
- **Spacing scale** — Based on 4px grid. Everything snaps. 4, 8, 12, 16, 24, 32, 48.
- **Transitions: 200ms ease** — One timing function for everything. No spring animations. No overshoot.
- **White space as luxury** — Generous padding around containers. The more whitespace, the more premium it feels.

### shadcn/ui

shadcn isn't a design system — it's a component collection with excellent defaults.

**What makes it work:**

- **CSS custom properties for everything** — `--radius`, `--background`, `--foreground`. One source of truth, swapped by theme class.
- **Two-tier tokens** — Primitive values (`oklch(0.55 0.25 265)`) mapped to semantic names (`--primary`). Components never reference raw values.
- **`@theme inline` bridge** — Maps CSS variables to Tailwind's token system so you can write `bg-background` instead of `bg-[var(--background)]`.
- **Consistent component API** — Every component accepts `className`, supports `asChild`, uses `data-slot` for styling hooks.
- **Focus ring pattern** — `outline-ring/50` as the default, overridden per-component only when needed.

## Our design decisions

### Color philosophy

**One accent, maximum restraint.**

The UI is neutral gray. The brand accent (violet, hue 265) appears only for:

- Primary actions (buttons, links)
- Active/selected states
- Running indicator
- Brand elements (logo, gradients)

Status colors (success/warning/error/info) use low chroma (~0.12-0.15). They communicate state, not emotion. Status backgrounds use the status color at 15-20% opacity.

Everything else is gray scale. Gray does the heavy lifting — surface hierarchy, text hierarchy, borders, disabled states.

### Color space: OKLCH

All colors use `oklch(lightness chroma hue)`. See [frontend-philosophy.md](./frontend-philosophy.md) for the rationale. Key principles:

- **Lightness** creates surface hierarchy (background 0.13, card 0.16, popover 0.19 in dark mode)
- **Chroma** at 0.005-0.01 for neutrals gives a subtle cool undertone without looking colored
- **Chroma** above 0.15 reserved for interactive elements and status
- Alpha via slash: `oklch(0.55 0.25 265 / 0.2)` for transparent variants

### Dark mode first

Dark mode is the default. Light mode is a fully-designed alternative, not an afterthought.

**Dark mode surfaces (Studio Dark):**

| Surface    | Lightness | Purpose                             |
| ---------- | --------- | ----------------------------------- |
| Background | 0.13      | Canvas — warm charcoal, not black   |
| Sidebar    | 0.11      | Recessed, solid — no glass morphism |
| Card       | 0.16      | Slight lift above background        |
| Popover    | 0.19      | Floating, clear separation          |
| Input      | 0.14      | Inset, slightly darker than card    |
| Muted      | 0.20      | Subtle backgrounds, badges          |

**Why not pure black (`oklch(0 0 0)`):**
Pure black creates harsh contrast with white text, causes OLED "smearing" on mobile, and makes surface hierarchy invisible. A lightness of 0.13 with a slight cool chroma (0.005, hue 260) reads as dark without the problems.

**Why not glass morphism:**
`backdrop-filter: blur()` is a GPU-intensive effect that drops frames on lower-end hardware and makes text harder to read. Solid surfaces with 1px borders are faster, more accessible, and look more professional. Glass effects are removed from the Studio themes.

### Typography

| Property    | Value                                        |
| ----------- | -------------------------------------------- |
| Sans font   | Geist Sans (variable, `--font-geist-sans`)   |
| Mono font   | Geist Mono (variable, `--font-geist-mono`)   |
| Base size   | 14px (0.875rem)                              |
| Line height | 1.5 for body, 1.25 for headings              |
| Weights     | 400 (body), 500 (labels/nav), 600 (headings) |

**Text hierarchy (dark mode):**

| Level     | Token                    | Lightness | Usage                       |
| --------- | ------------------------ | --------- | --------------------------- |
| Primary   | `--foreground`           | 0.93      | Body text, headings         |
| Secondary | `--foreground-secondary` | 0.65      | Labels, descriptions        |
| Muted     | `--foreground-muted`     | 0.50      | Placeholders, disabled text |

Primary foreground is `oklch(0.93 0 0)`, not pure white. Pure white (`oklch(1 0 0)`) on dark backgrounds causes eye strain at prolonged use. 0.93 is indistinguishable from white at a glance but measurably easier on the eyes.

### Spacing and density

Follow a 4px base grid:

```
4px   — inner padding, icon-to-text gaps
8px   — standard padding, gap between related items
12px  — comfortable padding, section gaps
16px  — container padding, card padding
24px  — section spacing
32px  — major section breaks
48px  — page-level spacing
```

**Density target:** Compact. More information visible per screen. Rows 32-36px. Card padding 12-16px. We build tools for power users — density respects their time.

### Border radius

```css
--radius: 0.375rem; /* 6px — the base */
--radius-sm: calc(var(--radius) - 2px); /* 4px — small badges, chips */
--radius-md: var(--radius); /* 6px — inputs, small cards */
--radius-lg: calc(var(--radius) + 2px); /* 8px — cards, dialogs */
--radius-xl: calc(var(--radius) + 6px); /* 12px — large containers */
```

6px is the base — closer to Vercel's engineering precision than Notion's friendly roundness. Professional, subtle, and consistent across the system.

### Borders

**1px solid borders, not shadows.**

```css
--border: oklch(0.22 0.005 260); /* Subtle, visible */
--border-glass: oklch(0.93 0 0 / 0.08); /* For overlapping surfaces */
```

Borders at low contrast (~8-10% above background) create structure without visual noise. Shadows are reserved for:

- Popovers and dropdowns (elevated, floating)
- Command palette (modal overlay)
- Toast notifications

Everything else uses borders only.

### Focus and interactive states

**Focus ring:**

```css
outline: 2px solid var(--ring);
outline-offset: 2px;
```

Ring color matches the brand accent at a readable opacity. Always visible on keyboard focus, hidden on mouse click (`:focus-visible` only).

**Hover states:**

- Buttons: Background shifts 1-2 lightness steps darker
- List items: Background appears at `oklch(... / 0.05)` — barely perceptible
- Links: Underline appears or color shifts slightly
- Duration: 150ms ease

**Active states:**

- Buttons: `scale(0.98)` — subtle press
- Duration: 100ms

**Selected states:**

- Background: brand accent at 10-15% opacity
- Left border or bottom border: 2px solid brand accent
- Text color: shifts to primary foreground

### Animations and transitions

| What               | Duration | Easing      | When                 |
| ------------------ | -------- | ----------- | -------------------- |
| Hover effects      | 150ms    | ease        | Background, color    |
| Focus rings        | 0ms      | —           | Immediate            |
| Dropdowns/popovers | 150ms    | ease-out    | Scale + fade         |
| Page transitions   | 200ms    | ease        | Route changes        |
| Theme switch       | 400ms    | ease        | View Transitions API |
| Loading spinners   | 1000ms   | linear      | Continuous rotation  |
| Status pulses      | 2000ms   | ease-in-out | Ambient status only  |

**Rules:**

- Nothing bounces. No spring physics. No overshoot.
- `prefers-reduced-motion: reduce` disables all non-essential animation
- Loading indicators are the only continuous animations
- Transitions are for feedback, not decoration

### Status colors

Low-chroma, clearly distinguishable. Same hues in light and dark mode, lightness adjusted.

| Status  | Hue | Dark chroma | Dark lightness | Usage                   |
| ------- | --- | ----------- | -------------- | ----------------------- |
| Success | 145 | 0.14        | 0.65           | Done, passed, connected |
| Warning | 75  | 0.12        | 0.75           | In progress, attention  |
| Error   | 25  | 0.16        | 0.65           | Failed, blocked, danger |
| Info    | 230 | 0.14        | 0.65           | Review, informational   |

**Status backgrounds** use the status color at 15% opacity in light mode, 20% in dark mode. Never use status colors for decoration — they always mean something.

### Shadow system

Shadows are minimal and exist only for elevation.

```css
/* Dark mode — deeper shadows */
--shadow-xs: 0 1px 2px rgba(0, 0, 0, 0.3);
--shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.4), 0 1px 2px rgba(0, 0, 0, 0.3);
--shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.4), 0 2px 4px -1px rgba(0, 0, 0, 0.3);
--shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.4), 0 4px 6px -2px rgba(0, 0, 0, 0.2);

/* Light mode — softer shadows */
--shadow-xs: 0 1px 2px rgba(0, 0, 0, 0.05);
--shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.06);
--shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
--shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
```

### Mobile considerations

Desktop-first, mobile-accommodating. The app is a power tool — it lives on desktop. But when the viewport shrinks:

- Sidebar collapses to icon-only at `< 768px`
- Cards stack vertically
- Touch targets minimum 44x44px
- Text remains 14px minimum — never scale down for mobile
- Horizontal scrolling for tables/boards rather than truncation

### What we do NOT do

- **No gradients on surfaces** — Gradients are for brand moments (logo, landing page), not UI chrome
- **No glass morphism in Studio themes** — Solid backgrounds, always
- **No high-chroma neutrals** — Gray means gray. Chroma stays under 0.01
- **No bounce/spring animations** — Professional tools don't bounce
- **No decorative shadows on flat content** — Borders handle structure
- **No color for color's sake** — Every non-gray pixel must communicate meaning
- **No rounded-full on rectangles** — Pill shapes are for badges and avatars only

## Applying this in code

Components consume semantic tokens via Tailwind: `bg-background`, `text-foreground`, `border-border`. Never reference raw OKLCH values in component code.

Theme files define the token values. The `generateThemeCSS()` function in `apps/ui/src/lib/theme/` produces CSS from a `ThemeConfig` object, ensuring consistency.

When adding new UI:

1. Check if an existing token covers your need
2. If not, add a semantic token to the theme config type
3. Wire it through `@theme inline` in `global.css`
4. Use the Tailwind class in your component

When in doubt, make it grayer and smaller.
