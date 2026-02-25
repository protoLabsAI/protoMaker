# UI Standards

All frontend code MUST follow these rules. Violations break theming across 6+ themes.

## 1. Shared Component Library

ALWAYS import from `@protolabs-ai/ui`. NEVER use bare HTML elements for interactive UI.

### Atoms (`@protolabs-ai/ui/atoms`)

| Component | Notes |
|-----------|-------|
| `Button` | Supports `variant`, `size`, `loading`, `asChild` props |
| `Badge` | Semantic variants: success, warning, error, info, muted, brand |
| `Card, CardHeader, CardContent, CardFooter, CardTitle, CardAction, CardDescription` | |
| `Input` | |
| `Label` | |
| `Checkbox` | |
| `RadioGroup, RadioGroupItem` | |
| `Select, SelectTrigger, SelectContent, SelectItem, SelectValue, SelectGroup, SelectLabel, SelectSeparator` | |
| `Switch` | |
| `Slider` | |
| `Textarea` | |
| `Accordion, AccordionItem, AccordionTrigger, AccordionContent` | |
| `Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator, BreadcrumbEllipsis` | |
| `Collapsible, CollapsibleTrigger, CollapsibleContent` | |
| `Kbd, KbdGroup` | Keyboard shortcut display |
| `ScrollArea, ScrollBar` | |
| `SkeletonPulse` | Loading placeholder |
| `Spinner` | `size` prop: sm, md, lg, xl |
| `Tabs, TabsList, TabsTrigger, TabsContent` | |
| `Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger, DialogClose` | |
| `DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel, DropdownMenuGroup, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuCheckboxItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuShortcut` | |
| `Popover, PopoverContent, PopoverTrigger` | |
| `Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter, SheetTrigger, SheetClose` | |
| `Tooltip, TooltipContent, TooltipProvider, TooltipTrigger` | |
| `Command, CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandSeparator, CommandShortcut` | |

### Molecules (`@protolabs-ai/ui/molecules`)

| Component | Purpose |
|-----------|---------|
| `HotkeyButton` | Button with keyboard shortcut support |
| `ConfirmDialog` | Pre-built confirmation modal with hotkey confirm |
| `Autocomplete` | Searchable combobox with create-new support |
| `LoadingState` | Centered spinner with optional message |
| `ErrorState` | Error display with optional retry button |
| `Markdown` | Theme-aware markdown renderer |

## 2. Forbidden HTML Elements

| NEVER use | ALWAYS use instead |
|-----------|--------------------|
| `<button>` | `<Button>` from `@protolabs-ai/ui/atoms` |
| `<input>` | `<Input>` from `@protolabs-ai/ui/atoms` |
| `<select>` | `<Select>` + `<SelectTrigger>` + `<SelectContent>` + `<SelectItem>` |
| `<textarea>` | `<Textarea>` from `@protolabs-ai/ui/atoms` |
| `<input type="checkbox">` | `<Checkbox>` from `@protolabs-ai/ui/atoms` |
| `<label>` | `<Label>` from `@protolabs-ai/ui/atoms` |

## 3. Button Variants & Sizes

**Variants:** `default`, `destructive`, `outline`, `secondary`, `ghost`, `link`, `animated-outline`

**Sizes:** `default` (h-9), `sm` (h-8), `lg` (h-10), `icon` (9x9), `icon-sm` (8x8), `icon-lg` (10x10)

**Props:** `loading={true}` shows spinner and disables. `asChild` for custom wrappers.

## 4. Theme Token Mapping

NEVER hardcode colors. NEVER use raw Tailwind color classes (gray-*, blue-*, red-*, etc.).

### Backgrounds

| NEVER | ALWAYS |
|-------|--------|
| `bg-white`, `bg-gray-900` | `bg-background` |
| `bg-white` (card surface) | `bg-card` |
| `bg-gray-50`, `bg-gray-800` | `bg-muted` |
| `bg-gray-100`, `bg-gray-700` | `bg-accent` or `bg-secondary` |
| `hover:bg-gray-100` | `hover:bg-accent` |
| `bg-blue-500`, `bg-indigo-600` | `bg-primary` |
| `bg-blue-50` | `bg-primary/10` |
| `bg-red-500` | `bg-destructive` |
| Inline `style={{ background: '#...' }}` | Tailwind token class or `var(--token)` |

### Text

| NEVER | ALWAYS |
|-------|--------|
| `text-black`, `text-white`, `text-gray-900` | `text-foreground` |
| `text-gray-600`, `text-gray-700` | `text-foreground-secondary` |
| `text-gray-400`, `text-gray-500` | `text-muted-foreground` |
| `text-blue-600`, `text-blue-700` | `text-primary` |
| `text-red-500`, `text-red-600` | `text-destructive` |

### Borders

| NEVER | ALWAYS |
|-------|--------|
| `border-gray-200`, `border-gray-700` | `border-border` |
| `border-gray-300` (input borders) | `border-input` |
| `ring-blue-500` | `ring-ring` |

### Status Colors

Use CSS variable syntax for status indicators:

| Status | Background | Text |
|--------|------------|------|
| Success | `bg-status-success-bg` | `text-status-success` |
| Warning | `bg-status-warning-bg` | `text-status-warning` |
| Error | `bg-status-error-bg` | `text-status-error` |
| Info | `bg-status-info-bg` | `text-status-info` |

Or use Badge semantic variants: `<Badge variant="success">`, `<Badge variant="warning">`, etc.

## 5. Text Hierarchy

Three tiers only:

1. **Primary** — `text-foreground` — headings, labels, important content
2. **Secondary** — `text-foreground-secondary` — body text, descriptions
3. **Muted** — `text-muted-foreground` — hints, timestamps, tertiary info

## 6. Code Examples

### Card Section

```tsx
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@protolabs-ai/ui/atoms';

<Card>
  <CardHeader>
    <CardTitle>Section Title</CardTitle>
    <CardDescription>Brief explanation of this section.</CardDescription>
  </CardHeader>
  <CardContent className="space-y-4">
    {/* content here */}
  </CardContent>
</Card>
```

### Form Field

```tsx
import { Label, Input } from '@protolabs-ai/ui/atoms';

<div className="space-y-2">
  <Label htmlFor="project-name">Project Name</Label>
  <Input id="project-name" placeholder="my-project" value={name} onChange={(e) => setName(e.target.value)} />
  <p className="text-sm text-muted-foreground">Used as the directory name.</p>
</div>
```

### Button Group

```tsx
import { Button } from '@protolabs-ai/ui/atoms';
import { Save, Trash2 } from 'lucide-react';

<div className="flex items-center gap-2">
  <Button variant="outline" onClick={onCancel}>Cancel</Button>
  <Button variant="destructive" size="sm" onClick={onDelete}>
    <Trash2 /> Delete
  </Button>
  <Button onClick={onSave} loading={isSaving}>
    <Save /> Save Changes
  </Button>
</div>
```

## 7. Accessibility

- Icon-only buttons MUST have `aria-label`: `<Button size="icon" aria-label="Delete item"><Trash2 /></Button>`
- Every `<Input>` / `<Textarea>` / `<Select>` MUST have a paired `<Label>` with matching `htmlFor`/`id`
- Keyboard navigation is handled by shared components -- do not override `onKeyDown` unless adding new shortcuts

## 8. Exemptions

- **Canvas/renderer internals** that draw user content (e.g., code editor buffers, terminal emulators) are exempt
- **Application chrome** (toolbars, panels, sidebars, inspectors, settings, modals) is NEVER exempt

## 9. Reference Views

When building new UI, study these files as the gold standard:

- **Board view** (Kanban): `apps/ui/src/components/views/board-view/` -- layout, cards, drag-and-drop
- **Settings view** (forms): `apps/ui/src/components/views/settings-view/` -- form patterns, input groups, sections
