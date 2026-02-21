# Design System

The visual identity of protoLabs. Extracted from the landing page at `protolabs.studio` — the gold standard that all properties (docs site, joshmabry.dev, future marketing) must match.

See `brand.md` for voice, naming, and team identity.

## Color Palette

### Surface Scale (backgrounds)

Dark-first. Four tiers of near-black zinc, each subtly lighter than the last:

| Token       | Hex       | Usage                                      |
| ----------- | --------- | ------------------------------------------ |
| `surface-0` | `#09090b` | Page background, body                      |
| `surface-1` | `#111113` | Cards, panels, mockups, elevated surfaces  |
| `surface-2` | `#18181b` | Inputs, nested cards, architecture diagram |
| `surface-3` | `#222225` | Score bar tracks, tertiary backgrounds     |

### Accent

Single brand color — violet. Used sparingly for emphasis, never as background fills:

| Token        | Hex       | Usage                                       |
| ------------ | --------- | ------------------------------------------- |
| `accent`     | `#a78bfa` | Links, labels, section headers, focus rings |
| `accent-dim` | `#7c5cbf` | Hover state for accent buttons              |

### Text

| Role      | Hex       | Tailwind   | Usage                          |
| --------- | --------- | ---------- | ------------------------------ |
| Primary   | `#fafafa` | `zinc-50`  | Headings, emphasis             |
| Secondary | `#e4e4e7` | `zinc-200` | Subheadings, mockup commands   |
| Body      | `#a1a1aa` | `zinc-400` | Paragraphs, descriptions       |
| Muted     | `#71717a` | `zinc-500` | Nav links, labels, metadata    |
| Dim       | `#52525b` | `zinc-600` | Disabled, timestamps, tertiary |

### Semantic Colors

Used in badges, status indicators, and mockup content:

| Role    | Hex       | Tailwind     | Badge BG opacity |
| ------- | --------- | ------------ | ---------------- |
| Success | `#4ade80` | `green-400`  | 15%              |
| Warning | `#facc15` | `yellow-400` | 15%              |
| Info    | `#60a5fa` | `blue-400`   | 15%              |
| Error   | `#f87171` | `red-400`    | 15%              |

### Borders

Ultra-subtle white borders. Never harsh:

| Usage         | Value                                           |
| ------------- | ----------------------------------------------- |
| Section break | `rgba(255, 255, 255, 0.05)` — `border-white/5`  |
| Card/panel    | `rgba(255, 255, 255, 0.06)`                     |
| Input field   | `rgba(255, 255, 255, 0.10)` — `border-white/10` |
| Accent border | `rgba(167, 139, 250, 0.3)` — accent at 30%      |

### Gradient

One gradient for emphasized text:

```css
background: linear-gradient(135deg, #a78bfa 0%, #818cf8 50%, #6366f1 100%);
-webkit-background-clip: text;
-webkit-text-fill-color: transparent;
```

### Glow

Subtle box shadow on elevated panels. Never garish:

```css
box-shadow: 0 0 80px rgba(167, 139, 250, 0.08);
```

## Typography

### Font Stack

| Role | Font       | Weights  | Usage                                       |
| ---- | ---------- | -------- | ------------------------------------------- |
| Sans | Geist      | 300-700  | Headings, body text, UI labels              |
| Mono | Geist Mono | 400, 500 | Code, mockup content, section labels, stats |

Loaded from Google Fonts with `display=swap`:

```
https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&family=Geist+Mono:wght@400;500&display=swap
```

### Type Scale

| Element       | Size                     | Weight     | Color      | Extra                                 |
| ------------- | ------------------------ | ---------- | ---------- | ------------------------------------- |
| h1            | `text-3xl` to `text-5xl` | `bold`     | white      | `leading-[1.1] tracking-tight`        |
| h2            | `text-2xl` to `text-3xl` | `semibold` | white      |                                       |
| h3            | `text-xl` to `text-2xl`  | `semibold` | white      |                                       |
| Body          | `text-base`              | `normal`   | `zinc-400` | `leading-relaxed`                     |
| Lead          | `text-lg` to `text-xl`   | `normal`   | `zinc-400` | `leading-relaxed`                     |
| Section label | `text-sm`                | `normal`   | accent     | `font-mono uppercase tracking-widest` |
| Nav           | `text-sm`                | `normal`   | muted      |                                       |
| Stat number   | `text-3xl` to `text-4xl` | `bold`     | white      | `font-mono`                           |
| Badge         | `11px` / `9px`           | `500`      | semantic   | `uppercase tracking-[0.05em]`         |

### Section Label Pattern

Every major section uses this heading hierarchy:

```html
<p class="text-accent text-sm font-mono uppercase tracking-widest">Section Label</p>
<h2 class="mt-4 text-2xl md:text-3xl font-semibold text-white">Section Heading</h2>
```

The mono uppercase label in accent color is a signature protoLabs pattern.

## Layout

### Container

- Max width: `max-w-5xl` (1024px)
- Horizontal padding: `px-6`
- Centered: `mx-auto`

### Grid

- Two-column on desktop: `lg:grid-cols-2`
- Single column on mobile: `grid-cols-1`
- Gap: `gap-10 lg:gap-16`
- Alignment: `items-center`

### Alternating Sections

Feature walkthrough sections alternate mockup placement:

- Odd sections: mockup left, text right
- Even sections: text left, mockup right (use `order-2 lg:order-1` / `order-1 lg:order-2`)

### Vertical Rhythm

| Context        | Padding                         |
| -------------- | ------------------------------- |
| Hero           | `pt-28 md:pt-44 pb-16 md:pb-24` |
| Section        | `py-12 md:py-20`                |
| Major section  | `py-16 md:py-24`                |
| Stats bar      | `py-10`                         |
| Newsletter CTA | `py-20 md:py-28`                |
| Footer         | `py-10`                         |

### Nav

- Fixed top: `fixed top-0 w-full z-50`
- Height: `h-14`
- Background: `bg-surface-0/80 backdrop-blur-xl`
- Border: `border-b border-white/5`

## Components

### Mockup Panel

The signature component. A terminal/UI mockup with traffic light dots:

```css
.mockup-panel {
  background: #111113; /* surface-1 */
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  overflow: hidden;
  font-family: 'Geist Mono', monospace;
  font-size: 13px;
  line-height: 1.6;
}
```

**Title bar** — Traffic light dots (macOS style):

- Close: `#ff5f57`
- Minimize: `#febc2e`
- Maximize: `#28c840`
- Label: `text-xs text-zinc-600 font-mono`

**Body** — Monospace content with semantic color classes:

- `.prompt` — accent purple
- `.cmd` — zinc-200
- `.success` — green-400
- `.warn` — yellow-400
- `.info` — blue-400
- `.dim` — zinc-600

**Separator** — `border-top: 1px solid rgba(255, 255, 255, 0.04)`

### Badge

Tinted background at 15% opacity + full color text:

```css
.badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
```

Variants: `badge-purple`, `badge-green`, `badge-yellow`, `badge-blue`, `badge-red`

### Check Icon

Small circular success indicator:

```css
.check-icon {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: rgba(74, 222, 128, 0.2);
  color: #4ade80;
  font-size: 10px;
}
```

### Score Bar

Thin horizontal progress indicator:

```css
.score-bar {
  height: 4px;
  border-radius: 2px;
  background: #222225; /* surface-3 */
}
.score-fill {
  height: 100%;
  border-radius: 2px;
  /* color via Tailwind: bg-green-500, bg-blue-500, etc. */
}
```

### Architecture Box

Flow diagram node:

```css
.arch-box {
  background: #18181b; /* surface-2 */
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  padding: 10px 16px;
  font-size: 13px;
  font-family: 'Geist Mono', monospace;
  color: #e4e4e7;
}
/* Accent variant for key nodes */
.arch-box-accent {
  border-color: rgba(167, 139, 250, 0.3);
  background: rgba(167, 139, 250, 0.08);
}
```

Flow arrows: accent purple, 18px, `&rarr;` / `&darr;` HTML entities.

### Buttons

**Primary (filled):**

```
bg-accent hover:bg-accent-dim text-white text-sm font-medium rounded-lg
px-5 py-2.5 (standard) or px-6 py-3 (large)
```

**Secondary (outline):**

```
border border-white/10 hover:border-white/20 text-zinc-300 hover:text-white text-sm font-medium rounded-lg
```

### Input

```
bg-surface-2 border border-white/10 rounded-lg text-white placeholder:text-zinc-500 text-sm
focus:outline-none focus:border-accent/50
```

Focus glow: `box-shadow: 0 0 0 2px rgba(167, 139, 250, 0.3)`

## Animations

### Hero Entrance

Staggered fade-up on page load:

```css
@keyframes fade-up {
  from {
    opacity: 0;
    transform: translateY(24px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.animate-fade-up {
  animation: fade-up 0.8s ease-out forwards;
}
/* Delays: 0.15s, 0.3s, 0.45s, 0.6s for staggered elements */
```

### Scroll-Triggered Fade

Sections below the fold use IntersectionObserver:

```css
.fade-section {
  opacity: 0;
  transform: translateY(24px);
  transition:
    opacity 0.7s ease-out,
    transform 0.7s ease-out;
}
.fade-section.visible {
  opacity: 1;
  transform: translateY(0);
}
```

Observer config: `{ threshold: 0.15, rootMargin: '0px 0px -40px 0px' }`

### Cursor Blink

Terminal cursor animation:

```css
@keyframes blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0;
  }
}
.cursor {
  animation: blink 1.2s step-end infinite;
}
```

## Accessibility

- Skip-to-content link (hidden until focused)
- `focus-visible` ring: `outline: 2px solid #a78bfa; outline-offset: 2px`
- `role="img"` + `aria-label` on all mockup panels
- Semantic HTML: `<nav>`, `<main>`, `<section>`, `<footer>`
- Color is never the sole indicator — text labels accompany all status colors

## Applying to Other Properties

### VitePress Docs Site

Override VitePress CSS custom properties to match the surface/accent palette. Key variables:

- `--vp-c-bg` → `surface-0`
- `--vp-c-bg-soft` → `surface-1`
- `--vp-c-bg-mute` → `surface-2`
- `--vp-c-brand-1` → `accent`
- `--vp-c-text-1` → `#fafafa`
- `--vp-c-text-2` → `#a1a1aa`
- `--vp-c-divider` → `rgba(255, 255, 255, 0.06)`

Load Geist fonts and override `--vp-font-family-base` and `--vp-font-family-mono`.

### Personal Sites (joshmabry.dev, etc.)

Map to the shadcn/ui CSS variable system:

- `--background` → `surface-0` in OKLch
- `--foreground` → `#fafafa`
- `--primary` → accent (`#a78bfa`)
- `--card` → `surface-1`
- `--border` → `rgba(255, 255, 255, 0.06)`
- `--muted` → `surface-2`
- `--accent` → `surface-2`

Replace fonts with Geist. Keep shadcn/ui component architecture — just update the tokens.

### protoLabs UI App (OKLch)

The UI app uses OKLch (perceptually uniform) rather than hex. Same brand identity, different color space for precision across 41 themes. The `studio-dark` theme in `apps/ui/src/styles/themes/studio-dark.css` is the canonical mapping:

| Brand Token (hex)      | UI Token (OKLch)        | CSS Variable             |
| ---------------------- | ----------------------- | ------------------------ |
| `surface-0` `#09090b`  | `oklch(0.13 0.005 260)` | `--background`           |
| `surface-1` `#111113`  | `oklch(0.16 0.005 260)` | `--card`                 |
| `surface-2` `#18181b`  | `oklch(0.2 0.005 260)`  | `--muted`                |
| `accent` `#a78bfa`     | `oklch(0.68 0.153 275)` | `--brand-400`            |
| `accent-dim` `#7c5cbf` | `oklch(0.45 0.171 275)` | `--brand-600`            |
| `#fafafa`              | `oklch(0.93 0 0)`       | `--foreground`           |
| `#a1a1aa`              | `oklch(0.65 0.005 260)` | `--foreground-secondary` |
| `#71717a`              | `oklch(0.5 0.005 260)`  | `--foreground-muted`     |

The hue 275 (violet) and hue 260 (zinc) carry through identically. See [`frontend-philosophy.md`](../dev/frontend-philosophy.md) for the full OKLch token system and implementation details.
