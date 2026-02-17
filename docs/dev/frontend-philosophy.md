# Frontend philosophy

Gold standard decisions for frontend engineering across protoLabs projects. These guidelines apply to automaker and serve as the template for all future proto lab setups.

> **Brand visual identity** — For the canonical color palette, typography, and component specs as they appear on the landing page and marketing properties, see [`design-system.md`](../protolabs/design-system.md). This document covers the _implementation_ of those design decisions in the UI app's OKLch token system.

## Design tokens

### Color space: OKLch

All color tokens use OKLch (Oklch Lightness Chroma Hue). This is the most perceptually uniform color space available in CSS, meaning equal numeric steps produce equal visual steps.

```css
--primary: oklch(0.55 0.25 265);
--destructive: oklch(0.6 0.25 25);
```

**Why OKLch over HSL/hex:**

- Perceptually uniform — adjusting lightness by 0.1 always looks the same
- Better interpolation for gradients and animations
- Native CSS support (`oklch()` function)
- Chroma channel maps directly to saturation intent

**Rules:**

- All new color tokens must use OKLch
- Existing HSL/hex tokens should be migrated to OKLch when touched
- Use alpha via slash syntax: `oklch(0.55 0.25 265 / 0.5)`

### Token taxonomy

Follow a two-tier token system: **primitive** (raw values) and **semantic** (intent-based).

```css
/* Primitive — never reference these directly in components */
--blue-500: oklch(0.55 0.25 265);

/* Semantic — these are what components consume */
--primary: var(--blue-500);
--ring: var(--primary);
```

**Semantic token categories** (mapped via `@theme inline` in global.css):

| Category    | Tokens                                                   | Purpose               |
| ----------- | -------------------------------------------------------- | --------------------- |
| Surface     | `background`, `card`, `popover`, `sidebar`               | Container backgrounds |
| Content     | `foreground`, `foreground-secondary`, `foreground-muted` | Text hierarchy        |
| Interactive | `primary`, `secondary`, `accent`, `destructive`          | Actions and states    |
| Borders     | `border`, `border-glass`, `input`, `ring`                | Edges and focus       |
| Data viz    | `chart-1` through `chart-5`                              | Charts and graphs     |

### Token delivery

Tokens live as CSS custom properties in per-theme CSS files (`styles/themes/*.css`). The `@theme inline` block in `global.css` bridges these to Tailwind utilities.

**Current state:** 6 curated theme CSS files (`studio-dark`, `studio-light`, `nord`, `catppuccin`, `dracula`, `monokai`).

**Target state:** Generate theme CSS from a TypeScript config object. This enables:

- Programmatic theme creation (white-label)
- Theme validation (contrast checks, completeness)
- Single source of truth for design decisions

**Migration path:** Keep static CSS files working. Add a `theme.config.ts` that generates equivalent CSS. Once validated, replace static files with generated output.

## Component architecture

### Pattern: shadcn/ui + CVA

All UI primitives follow the shadcn/ui pattern: Radix UI headless components styled with Tailwind and managed with CVA (class-variance-authority).

```tsx
// Standard component pattern
const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-md text-sm font-medium',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground',
        destructive: 'bg-destructive text-white',
        outline: 'border bg-background',
        ghost: 'hover:bg-accent',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 px-3',
        lg: 'h-10 px-6',
        icon: 'size-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
);
```

**Rules:**

- UI primitives go in `components/ui/` — presentational only, zero business logic
- Use `cn()` (clsx + tailwind-merge) for className composition
- Use Radix `Slot` + `asChild` for polymorphic rendering
- Export both the component and its variants (`Button`, `buttonVariants`)
- Use `data-slot` attributes for styling hooks
- Accept `React.ComponentProps<'element'>` for full HTML prop forwarding

### Component organization

```
components/
  ui/              # Primitives (button, card, dialog, input, etc.)
  icons/           # Icon components and registries
  shared/          # Cross-view utilities (font-selector, etc.)
  layout/          # App shell (sidebar, project-switcher)
  dialogs/         # App-level modals (workspace picker, etc.)
  views/           # Feature views (board-view/, agent-view/, etc.)
    {view-name}/
      {view-name}.tsx        # Main view component
      components/            # View-specific components
      dialogs/               # View-specific modals
```

**Rules:**

- UI primitives are **never view-specific** — if a component only serves one view, it belongs in `views/{view}/components/`
- Views own their dialogs — `views/board-view/dialogs/` not `dialogs/board-*`
- Shared components used by 2+ views go in `components/shared/`
- Keep nesting to 3 levels max: `views/board-view/components/kanban-card/`

### Composition over inheritance

React's composition model is the only abstraction pattern we use. No class inheritance, no HOCs, no render props (unless wrapping a third-party API).

```tsx
// Correct: composition via children
<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
  </CardHeader>
  <CardContent>{children}</CardContent>
</Card>;

// Correct: composition via specialized wrapper
function FeatureCard({ feature }: { feature: Feature }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{feature.title}</CardTitle>
      </CardHeader>
      <CardContent>
        <StatusBadge status={feature.status} />
      </CardContent>
    </Card>
  );
}
```

### Presentational purity

UI primitives must be pure: same props = same output, no side effects.

**What goes in UI primitives:**

- Styling, layout, animation
- Accessibility attributes (aria-\*, role)
- Event forwarding (onClick, onChange)
- Variant logic (CVA)

**What stays OUT of UI primitives:**

- API calls or data fetching
- Business logic or validation
- Store access (useAppStore)
- WebSocket subscriptions
- Route navigation

## State management

### Zustand 5 with slices

Global state lives in Zustand stores. Each store represents a domain slice.

| Store                 | Purpose                              | Persistence              |
| --------------------- | ------------------------------------ | ------------------------ |
| `app-store`           | Board state, view state, preferences | API sync (settings-sync) |
| `setup-store`         | Onboarding flow state                | Ephemeral                |
| `auth-store`          | Authentication state, API keys       | API sync                 |
| `settings-store`      | User settings and preferences        | API sync                 |
| `chat-store`          | Chat/conversation state              | API sync                 |
| `ai-models-store`     | AI model configuration               | API sync                 |
| `terminal-store`      | Terminal session state               | Ephemeral                |
| `worktree-store`      | Git worktree state                   | Ephemeral                |
| `notifications-store` | Notification queue                   | Ephemeral                |

**Rules:**

- Colocate state as close to its consumer as possible — prefer local `useState` over global store
- Only lift to Zustand when 2+ unrelated components need the same data
- Use selectors to prevent unnecessary re-renders: `useAppStore(s => s.theme)`
- Never put ephemeral state (loading, form inputs) in the global store

### Server state: TanStack Query 5

All server data (features, settings, agent output) is managed by TanStack Query, not Zustand.

**Rules:**

- Use `useQuery` for reads, `useMutation` for writes
- Set appropriate `staleTime` per resource type
- Use query invalidation after mutations, not manual state updates
- WebSocket events should trigger query invalidation, not direct state mutation

### Real-time: WebSocket events

The server pushes events over WebSocket. The UI subscribes to these events to trigger query invalidation and UI updates.

**Pattern:** WebSocket event → invalidate relevant TanStack Query → UI re-renders with fresh data.

## Styling

### Tailwind CSS 4

Tailwind is the only styling system. No CSS modules, no styled-components, no inline styles (except dynamic values that can't be expressed as utilities).

**Key conventions:**

- Use `@theme inline` to bridge CSS custom properties to Tailwind utilities
- Use `@custom-variant` for theme-specific overrides (dark, nord, dracula, etc.)
- Prefer semantic color utilities (`bg-primary`, `text-foreground`) over raw values
- Use `tw-animate-css` for animation utilities
- Keep responsive design mobile-first (default styles = smallest screen)

### Class ordering

Follow this order in className strings:

1. Layout (display, position, flex/grid)
2. Sizing (width, height, padding, margin)
3. Typography (font, text, leading)
4. Visual (background, border, shadow, opacity)
5. Interactive (hover, focus, active, transition)

### Dark mode

Dark mode uses class-based switching via `@custom-variant`. The root element gets a theme class (`.studio-dark`, `.nord`, `.dracula`, etc.) and theme-specific CSS variables override the defaults.

## Theming

### 6 themes, class-based switching

Themes are activated by setting a class on the root HTML element. Each theme defines the full set of semantic CSS variables.

**Architecture:**

```
:root              → light theme defaults (studio-light)
:root.studio-dark  → dark theme
:root.nord         → nord theme
:root.catppuccin   → catppuccin theme
:root.dracula      → dracula theme
:root.monokai      → monokai theme
```

**Runtime switching:** The app store persists the active theme. A `ThemeProvider` (or equivalent) applies the class. System preference detection (`prefers-color-scheme`) provides the initial default.

### Font system

20+ font families available via `@fontsource/*` packages. Default: Geist (sans) and Geist Mono. Fonts are runtime-switchable through the font selector component.

## Storybook

Storybook is configured at `apps/ui/.storybook/` with theme integration and accessibility auditing.

### Setup

- Framework: `@storybook/react-vite`
- Config: `apps/ui/.storybook/main.ts` + `preview.tsx`
- Addons: essentials, `@storybook/addon-a11y`, Chromatic (visual regression)
- Theme switcher: Toolbar cycles through all 6 curated themes

### Story conventions

Use CSF3 format with autodocs:

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { Button } from './button';

const meta: Meta<typeof Button> = {
  title: 'ui/Button',
  component: Button,
  tags: ['autodocs'],
};
export default meta;

type Story = StoryObj<typeof Button>;

export const Default: Story = { args: { children: 'Click me' } };
export const Destructive: Story = { args: { children: 'Delete', variant: 'destructive' } };
```

**Co-location:** Stories live next to their component: `button.tsx` + `button.stories.tsx`.

### Theme integration

The preview decorator applies theme classes to the document root. All theme CSS files are imported in `preview.tsx`, and the toolbar provides a theme switcher. This validates every component renders correctly across themes.

### Accessibility

`addon-a11y` runs axe-core checks on every story. Violations are warnings in dev, errors in CI.

## Extracted UI package

UI primitives are extracted to `@automaker/ui-components` at `libs/ui/`. The package uses an atoms/molecules/organisms structure with 26+ atom components (button, card, dialog, badge, etc.).

### Package structure

```
libs/ui/
  src/
    components/
      atoms/           # Primitive components (button, badge, card, etc.)
      molecules/       # Composed components
      organisms/       # Complex composed components
    lib/
      theme/           # Theme generator and utilities
      utils.ts         # cn() and helpers
    index.ts           # Barrel export
  package.json         # @automaker/ui-components
  tsconfig.json
```

`apps/ui/` depends on `@automaker/ui-components` via workspace linking. This enables sharing UI components across future apps (docs site, template repos, setupLab offerings).

## React 19 patterns

### Adopted

- **ref as prop:** No `forwardRef` wrapper needed. Components accept `ref` as a regular prop.
- **Composition via children:** Standard React pattern, enforced across all components.
- **State colocation:** Keep state as close to its consumer as possible.
- **`use()` hook:** For consuming promises and context in components.

### Available but use judiciously

- **Actions (`useActionState`, `useFormStatus`):** Use for form-heavy views where reducing boilerplate justifies the abstraction.
- **`useOptimistic`:** Use for operations where immediate UI feedback matters (drag-and-drop, status toggles).
- **Concurrent features (`startTransition`):** Use for expensive renders (board with 100+ cards, graph views).

### Not adopted

- **Server Components:** protoLabs is a Vite SPA (+ Electron), not Next.js. All components are client components. If/when we build Next.js apps (template repos, setupLab), Server Components become relevant there.

## Accessibility

### Baseline requirements

- All interactive elements must be keyboard accessible
- All images must have alt text (or `alt=""` for decorative)
- Color alone must not convey meaning (use icons, text, patterns)
- Focus indicators must be visible (Tailwind's `focus-visible:ring-*`)
- Use semantic HTML elements (`button`, `nav`, `main`, `article`)

### Radix handles most of it

Radix UI primitives (Dialog, Dropdown, Tooltip, etc.) provide correct ARIA attributes, focus management, and keyboard navigation out of the box. Don't override these behaviors.

### Testing

Storybook is configured with `addon-a11y` for automated a11y auditing via axe-core. Violations appear as warnings in dev.

## Icons

Lucide React is the standard icon library. It provides tree-shakeable, consistent SVG icons.

**Rules:**

- Import icons individually: `import { Plus } from 'lucide-react'`
- Never import the entire lucide-react package
- Custom icons go in `components/icons/` as React components
- Icon size defaults to `size-4` via button CVA; override with className when needed

## Testing strategy

| Layer             | Tool                        | What to test                                                        |
| ----------------- | --------------------------- | ------------------------------------------------------------------- |
| Unit              | Vitest                      | Utility functions, hooks, store logic                               |
| Component         | Storybook interaction tests | UI behavior, accessibility, visual states                           |
| Visual regression | Chromatic (target)          | Unintended UI changes between releases                              |
| E2E               | Playwright                  | Critical user flows (create feature, run agent, board interactions) |

## Build and tooling

| Tool         | Version | Purpose                         |
| ------------ | ------- | ------------------------------- |
| Vite         | 7       | Dev server and production build |
| Tailwind CSS | 4       | Utility-first CSS               |
| TypeScript   | 5.9     | Type safety                     |
| React        | 19      | UI framework                    |
| Electron     | 39      | Desktop app shell               |
| LightningCSS | 1.29    | CSS minification and transforms |

### Build pipeline

```
npm run build:packages   →  Build shared libs (@automaker/types, etc.)
npm run build            →  Vite builds apps/ui/ for web
npm run build:electron   →  Vite build + electron-builder for desktop
```

**Rule:** Always run `build:packages` before building the UI if any shared package changed. Stale `dist/` in shared packages causes type errors and runtime failures.

## Known technical debt

Current gaps between philosophy and implementation. These are tracked as future work — don't fix opportunistically, fix deliberately.

| Debt                       | Current                                                                        | Target                                                                 | Priority |
| -------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------- | -------- |
| God store                  | `app-store.ts` is 4,268 lines with all state                                   | Split into domain slices (board, agent, settings, theme)               | High     |
| Monolithic views           | `board-view.tsx` (1,908 lines), `terminal-view.tsx` (1,809 lines)              | Decompose into sub-components like `settings-view/` already has        | High     |
| Storybook coverage         | Config + 14 stories (5 ui primitives + 9 dashboard components)                 | Stories for all UI primitives, interaction tests, Chromatic CI         | High     |
| Domain components in `ui/` | `git-diff-panel`, `dependency-selector`, `log-viewer` etc. in `components/ui/` | Move to `components/shared/` or view-specific directories              | Medium   |
| UI package gaps            | 26 atoms extracted to `@automaker/ui-components`; molecules/organisms pending  | Full extraction of all primitives to `libs/ui/`                        | Medium   |
| Static theme files         | 6 hand-written CSS files                                                       | Generate from TypeScript config                                        | Medium   |
| No typography tokens       | Font sizes, line heights are ad-hoc Tailwind classes                           | Formalize as semantic tokens                                           | Low      |
| No spacing tokens          | Spacing uses Tailwind defaults only                                            | Define semantic spacing scale if needed                                | Low      |
| Minimal a11y               | Relies on Radix defaults, no linting or testing                                | `eslint-plugin-jsx-a11y`, Storybook `addon-a11y`, skip-to-content link | Medium   |
| Loose files                | 4 components at `src/components/` root level                                   | Move to `shared/` or `layout/`                                         | Low      |

## What we do NOT adopt

These patterns exist in the ecosystem but are explicitly not part of our standard:

| Pattern                                | Reason                                                 |
| -------------------------------------- | ------------------------------------------------------ |
| CSS-in-JS (styled-components, emotion) | Tailwind covers all needs; CSS-in-JS adds runtime cost |
| CSS Modules                            | Tailwind utility classes eliminate scoping concerns    |
| Sass/Less                              | Tailwind v4 `@theme` replaces preprocessor variables   |
| Redux / MobX                           | Zustand is simpler and sufficient                      |
| Higher-order components                | Use composition via children instead                   |
| Render props                           | Use hooks or composition instead                       |
| Class components                       | Function components only                               |
| `React.FC` type                        | Use function declarations with explicit props          |
| Default exports for components         | Use named exports for grep-ability                     |

## Next steps

- **[UI Architecture](./ui-architecture)** — Current component map and routing
- **[Clean Code](./clean-code)** — General code quality standards
- **[Shared Packages](./shared-packages)** — Monorepo package architecture
