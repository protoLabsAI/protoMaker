# UI standards enforcement

How we ensure AI agents and human contributors follow the design system. This page covers the shared component library, forbidden patterns, and enforcement mechanisms.

> **Related docs:** [Design Philosophy](./design-philosophy) for visual decisions, [Frontend Philosophy](./frontend-philosophy) for implementation architecture, [Design System](../internal/design-system) for brand identity.

## The problem

AI agents don't instinctively know about our component library. Without explicit guidance, they default to bare HTML elements and hardcoded Tailwind colors — the path of least resistance. This produces code that:

- Breaks across 6+ themes (hardcoded `bg-gray-800` is invisible on light themes)
- Duplicates solved problems (re-implementing buttons, inputs, modals from scratch)
- Misses accessibility (no aria labels, no keyboard navigation, no focus management)
- Creates visual inconsistency (different border radii, spacing, typography per view)

## Enforcement strategy

Four layers of defense, ordered by impact:

```
Layer 1: Context injection (highest leverage)
  └── .automaker/context/ui-standards.md → injected into every agent prompt
  └── .automaker/context/CLAUDE.md → cross-references ui-standards.md

Layer 2: ESLint rules (planned)
  └── Ban bare HTML elements in application chrome
  └── Ban hardcoded color classes (bg-gray-*, text-blue-*, etc.)

Layer 3: Post-agent verification (planned)
  └── Automated grep for forbidden patterns after agent completes
  └── Fail-fast before PR creation if violations detected

Layer 4: Code review (CodeRabbit + human)
  └── Catches what automation misses
```

Layer 1 is active today. Layers 2-3 are planned future work.

## Shared component library

All interactive UI elements must come from `@protolabs-ai/ui`. The package lives at `libs/ui/` and exports through two entry points:

```typescript
import { Button, Card, Input, Badge } from '@protolabs-ai/ui/atoms';
import { ConfirmDialog, Autocomplete, Markdown } from '@protolabs-ai/ui/molecules';
```

### Atoms (26+ components)

Primitive building blocks. Each wraps a Radix UI headless component with Tailwind styling and CVA variants.

| Component                                                                                                                                       | Notes                                                                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`                                                                                                                                        | Variants: default, destructive, outline, secondary, ghost, link, animated-outline. Sizes: default, sm, lg, icon, icon-sm, icon-lg. Props: `loading`, `asChild`. |
| `Badge`                                                                                                                                         | Semantic variants: success, warning, error, info, muted, brand                                                                                                  |
| `Card`, `CardHeader`, `CardContent`, `CardFooter`, `CardTitle`, `CardAction`, `CardDescription`                                                 | Composable card system                                                                                                                                          |
| `Input`                                                                                                                                         | Standard text input with theme tokens                                                                                                                           |
| `Label`                                                                                                                                         | Paired with inputs via `htmlFor`/`id`                                                                                                                           |
| `Checkbox`                                                                                                                                      | Radix-based checkbox                                                                                                                                            |
| `RadioGroup`, `RadioGroupItem`                                                                                                                  | Radix-based radio group                                                                                                                                         |
| `Select`, `SelectTrigger`, `SelectContent`, `SelectItem`, `SelectValue`                                                                         | Full select system (also: `SelectGroup`, `SelectLabel`, `SelectSeparator`)                                                                                      |
| `Switch`                                                                                                                                        | Toggle switch                                                                                                                                                   |
| `Slider`                                                                                                                                        | Range input                                                                                                                                                     |
| `Textarea`                                                                                                                                      | Multi-line text input                                                                                                                                           |
| `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`                                                                                                | Tab navigation                                                                                                                                                  |
| `Accordion`, `AccordionItem`, `AccordionTrigger`, `AccordionContent`                                                                            | Collapsible sections                                                                                                                                            |
| `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter`, `DialogTrigger`, `DialogClose`                   | Modal dialogs                                                                                                                                                   |
| `DropdownMenu`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuTrigger`                                                                | Full dropdown system (also: Separator, Label, Group, Sub, SubTrigger, SubContent, CheckboxItem, RadioGroup, RadioItem, Shortcut)                                |
| `Popover`, `PopoverContent`, `PopoverTrigger`                                                                                                   | Floating content                                                                                                                                                |
| `Sheet`, `SheetContent`, `SheetHeader`, `SheetTitle`, `SheetDescription`, `SheetFooter`, `SheetTrigger`, `SheetClose`                           | Slide-out panels                                                                                                                                                |
| `Tooltip`, `TooltipContent`, `TooltipProvider`, `TooltipTrigger`                                                                                | Hover tooltips                                                                                                                                                  |
| `Command`, `CommandDialog`, `CommandInput`, `CommandList`, `CommandEmpty`, `CommandGroup`, `CommandItem`, `CommandSeparator`, `CommandShortcut` | Command palette                                                                                                                                                 |
| `Breadcrumb`, `BreadcrumbList`, `BreadcrumbItem`, `BreadcrumbLink`, `BreadcrumbPage`, `BreadcrumbSeparator`, `BreadcrumbEllipsis`               | Navigation breadcrumbs                                                                                                                                          |
| `Collapsible`, `CollapsibleTrigger`, `CollapsibleContent`                                                                                       | Simple collapsible                                                                                                                                              |
| `Kbd`, `KbdGroup`                                                                                                                               | Keyboard shortcut display                                                                                                                                       |
| `ScrollArea`, `ScrollBar`                                                                                                                       | Custom scrollbars                                                                                                                                               |
| `SkeletonPulse`                                                                                                                                 | Loading placeholder                                                                                                                                             |
| `Spinner`                                                                                                                                       | Loading spinner (sizes: sm, md, lg, xl)                                                                                                                         |

### Molecules (6+ components)

Composed patterns that combine atoms with behavior:

| Component       | Purpose                                          |
| --------------- | ------------------------------------------------ |
| `HotkeyButton`  | Button with keyboard shortcut support            |
| `ConfirmDialog` | Pre-built confirmation modal with hotkey confirm |
| `Autocomplete`  | Searchable combobox with create-new support      |
| `LoadingState`  | Centered spinner with optional message           |
| `ErrorState`    | Error display with optional retry button         |
| `Markdown`      | Theme-aware markdown renderer                    |

## Forbidden patterns

### Bare HTML elements

Application chrome (toolbars, panels, sidebars, inspectors, settings, modals) must never use bare HTML for interactive elements:

| Never use                 | Always use instead                                                  |
| ------------------------- | ------------------------------------------------------------------- |
| `<button>`                | `<Button>` from `@protolabs-ai/ui/atoms`                            |
| `<input>`                 | `<Input>` from `@protolabs-ai/ui/atoms`                             |
| `<select>`                | `<Select>` + `<SelectTrigger>` + `<SelectContent>` + `<SelectItem>` |
| `<textarea>`              | `<Textarea>` from `@protolabs-ai/ui/atoms`                          |
| `<input type="checkbox">` | `<Checkbox>` from `@protolabs-ai/ui/atoms`                          |
| `<label>`                 | `<Label>` from `@protolabs-ai/ui/atoms`                             |

**Exemption:** Canvas/renderer internals (code editor buffers, terminal emulators, design canvas) are exempt because they render user content, not application chrome.

### Hardcoded colors

Never use raw Tailwind color classes. Always use semantic tokens:

| Never                                               | Always                                 |
| --------------------------------------------------- | -------------------------------------- |
| `bg-white`, `bg-gray-900`                           | `bg-background`                        |
| `bg-white` (card surface)                           | `bg-card`                              |
| `bg-gray-50`, `bg-gray-800`                         | `bg-muted`                             |
| `bg-gray-100`, `bg-gray-700`                        | `bg-accent` or `bg-secondary`          |
| `hover:bg-gray-100`                                 | `hover:bg-accent`                      |
| `bg-blue-500`, `bg-indigo-600`                      | `bg-primary`                           |
| `bg-red-500`                                        | `bg-destructive`                       |
| `text-black`, `text-white`, `text-gray-900`         | `text-foreground`                      |
| `text-gray-600`, `text-gray-700`                    | `text-foreground-secondary`            |
| `text-gray-400`, `text-gray-500`                    | `text-muted-foreground`                |
| `text-blue-600`                                     | `text-primary`                         |
| `text-red-500`                                      | `text-destructive`                     |
| `border-gray-200`, `border-gray-700`                | `border-border`                        |
| `border-gray-300`                                   | `border-input`                         |
| `ring-blue-500`                                     | `ring-ring`                            |
| <span v-pre>`style={{ background: '#...' }}`</span> | Tailwind token class or `var(--token)` |

### Status colors

Use semantic status tokens, not raw colors:

| Status  | Background             | Text                  | Badge variant               |
| ------- | ---------------------- | --------------------- | --------------------------- |
| Success | `bg-status-success-bg` | `text-status-success` | `<Badge variant="success">` |
| Warning | `bg-status-warning-bg` | `text-status-warning` | `<Badge variant="warning">` |
| Error   | `bg-status-error-bg`   | `text-status-error`   | `<Badge variant="error">`   |
| Info    | `bg-status-info-bg`    | `text-status-info`    | `<Badge variant="info">`    |

## Text hierarchy

Three tiers only. No exceptions:

| Tier      | Token                       | Usage                               |
| --------- | --------------------------- | ----------------------------------- |
| Primary   | `text-foreground`           | Headings, labels, important content |
| Secondary | `text-foreground-secondary` | Body text, descriptions             |
| Muted     | `text-muted-foreground`     | Hints, timestamps, tertiary info    |

## Accessibility requirements

- Icon-only buttons must have `aria-label`: `<Button size="icon" aria-label="Delete item"><Trash2 /></Button>`
- Every `<Input>`, `<Textarea>`, `<Select>` must have a paired `<Label>` with matching `htmlFor`/`id`
- Keyboard navigation is handled by shared components. Do not override `onKeyDown` unless adding new shortcuts.
- Color must never be the sole indicator of state. Use icons or text labels alongside colors.

## Context file system

The enforcement mechanism works through the `.automaker/context/` directory. Files placed here are automatically injected into every agent's system prompt via `loadContextFiles()` from `@protolabs-ai/utils`.

**Active context files for UI standards:**

| File                                 | Purpose                                                                             |
| ------------------------------------ | ----------------------------------------------------------------------------------- |
| `.automaker/context/CLAUDE.md`       | References `ui-standards.md`, lists `libs/ui/` in monorepo structure                |
| `.automaker/context/ui-standards.md` | Complete component inventory, forbidden patterns, theme tokens, accessibility rules |

The `ui-standards.md` context file is kept under 200 lines to fit within agent context budgets. It contains the actionable rules — the tables above are extracted from it.

**How it works:**

```
Agent starts
  → loadContextFiles({ projectPath })
  → Reads ALL files from .automaker/context/
  → Injects as system prompt section
  → Agent sees: "ALWAYS use <Button> from @protolabs-ai/ui/atoms, NEVER use <button>"
  → Agent follows the rules in generated code
```

This is the highest-leverage enforcement point because it reaches every agent on every execution without any code changes or CI pipeline modifications.

## Reference views

When building new UI, study these implementations as the gold standard:

- **Board view** (Kanban): `apps/ui/src/components/views/board-view/` — layout, cards, drag-and-drop
- **Settings view** (forms): `apps/ui/src/components/views/settings-view/` — form patterns, input groups, sections

## Adding new standards

To add a new UI standard:

1. **Update the context file** (`.automaker/context/ui-standards.md`) — agents see this immediately
2. **Update this doc** (`docs/dev/ui-standards.md`) — humans reference this
3. **Add ESLint rule** (when available) — automated enforcement
4. **Update reference views** if the new standard affects existing patterns

Keep the context file and this doc in sync. The context file is the agent-facing version (concise, actionable). This doc is the human-facing version (explains the why, includes context).
