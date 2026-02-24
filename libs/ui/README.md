# @protolabs-ai/ui

Shared UI component library for AutoMaker, built on Radix UI primitives with Tailwind CSS v4 styling and atomic design principles.

## Installation

```bash
npm install @protolabs-ai/ui
```

### Peer Dependencies

This package requires React 19+ and Tailwind CSS 4+:

```bash
npm install react@^19 tailwindcss@^4
```

## Theme Setup

### 1. Import Theme CSS

Import the theme CSS file in your app entry point (e.g., `main.tsx` or `App.tsx`):

```tsx
import '@protolabs-ai/ui/themes.css';
```

### 2. Apply Theme Class

Add a theme class to your root HTML element. Available themes:

- `studio-light` (default light)
- `studio-dark` (default dark)
- `nord`
- `catppuccin`
- `dracula`
- `monokai`

```tsx
<html className="studio-dark">
  <body>{/* Your app */}</body>
</html>
```

### 3. Configure Tailwind

The package uses semantic CSS variables that integrate with Tailwind. These are automatically available when you import the theme CSS.

**Note:** All themes use OKLch color space for perceptually uniform colors and better gradients.

## Component Usage

### Import Components

Components are organized into atoms, molecules, and organisms following atomic design principles:

```tsx
// Atoms (primitives)
import { Button, Card, Input, Label } from '@protolabs-ai/ui';

// Molecules (composed components)
import { ConfirmDialog, Autocomplete, Markdown } from '@protolabs-ai/ui/molecules';

// Organisms (complex compositions)
// Coming soon...

// Utilities
import { cn } from '@protolabs-ai/ui/lib';
```

### Basic Example

```tsx
import { Button, Card, CardHeader, CardTitle, CardContent } from '@protolabs-ai/ui';

function Example() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Hello World</CardTitle>
      </CardHeader>
      <CardContent>
        <Button onClick={() => alert('Clicked!')}>Click me</Button>
      </CardContent>
    </Card>
  );
}
```

### Component Variants

Most components support variants via `class-variance-authority`:

```tsx
// Button variants
<Button variant="default">Default</Button>
<Button variant="destructive">Delete</Button>
<Button variant="outline">Cancel</Button>
<Button variant="ghost">Ghost</Button>

// Button sizes
<Button size="sm">Small</Button>
<Button size="default">Default</Button>
<Button size="lg">Large</Button>
<Button size="icon">📌</Button>
```

### Loading States

Buttons support loading state with built-in spinner:

```tsx
<Button loading={isSubmitting}>Save Changes</Button>
```

### Polymorphic Rendering

Use `asChild` prop to render components as different elements:

```tsx
import { Button } from '@protolabs-ai/ui';

<Button asChild>
  <a href="/dashboard">Go to Dashboard</a>
</Button>;
```

### Dialog Example

```tsx
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@protolabs-ai/ui';

function DeleteDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="destructive">Delete</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Are you sure?</DialogTitle>
          <DialogDescription>This action cannot be undone.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline">Cancel</Button>
          <Button variant="destructive">Delete</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

### Form Example

```tsx
import { Input, Label, Button, Card, CardContent } from '@protolabs-ai/ui';

function LoginForm() {
  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" placeholder="you@example.com" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" />
        </div>
        <Button className="w-full">Sign In</Button>
      </CardContent>
    </Card>
  );
}
```

## Available Components

### Atoms (26+ primitives)

**Forms:**

- `Button` — Action buttons with variants and loading states
- `Input` — Text input fields
- `Textarea` — Multi-line text input
- `Label` — Form labels
- `Checkbox` — Checkbox inputs
- `RadioGroup`, `RadioGroupItem` — Radio button groups
- `Select` — Dropdown select menus
- `Switch` — Toggle switches
- `Slider` — Range sliders

**Layout:**

- `Card` — Content containers with header/footer/content
- `Accordion` — Collapsible content sections
- `Tabs` — Tab navigation
- `Collapsible` — Show/hide content
- `ScrollArea` — Custom scrollable containers
- `Breadcrumb` — Navigation breadcrumbs

**Overlays:**

- `Dialog` — Modal dialogs
- `Sheet` — Slide-out panels
- `Popover` — Floating popovers
- `Tooltip` — Hover tooltips
- `DropdownMenu` — Context menus and dropdowns
- `Command` — Command palette (⌘K style)

**Feedback:**

- `Badge` — Status badges
- `SkeletonPulse` — Loading skeletons
- `Spinner` — Loading spinners
- `Kbd` — Keyboard shortcuts display

### Molecules (6 composed components)

- `HotkeyButton` — Button with keyboard shortcut display
- `ConfirmDialog` — Pre-configured confirmation dialog
- `Autocomplete` — Search/filter input with suggestions
- `LoadingState` — Centralized loading UI
- `ErrorState` — Centralized error UI
- `Markdown` — Markdown renderer with syntax highlighting

### Utilities

- `cn()` — Tailwind class merging utility (clsx + tailwind-merge)

## Customization

### Styling Components

All components accept `className` prop for Tailwind utilities:

```tsx
<Button className="w-full mt-4">Full Width Button</Button>
```

### Using `cn()` Utility

The `cn()` utility combines class names and resolves Tailwind conflicts:

```tsx
import { cn } from '@protolabs-ai/ui/lib';

<Button className={cn('w-full', isActive && 'bg-primary', isDisabled && 'opacity-50')}>
  Dynamic Button
</Button>;
```

### Accessing Variants

Export both components and their variants for custom compositions:

```tsx
import { buttonVariants } from '@protolabs-ai/ui';

<a className={buttonVariants({ variant: 'outline', size: 'sm' })}>Link styled as button</a>;
```

### Theme Switching

Toggle themes at runtime by changing the root class:

```tsx
function ThemeSwitcher() {
  const [theme, setTheme] = useState('studio-dark');

  useEffect(() => {
    document.documentElement.className = theme;
  }, [theme]);

  return (
    <select value={theme} onChange={(e) => setTheme(e.target.value)}>
      <option value="studio-light">Studio Light</option>
      <option value="studio-dark">Studio Dark</option>
      <option value="nord">Nord</option>
      <option value="catppuccin">Catppuccin</option>
      <option value="dracula">Dracula</option>
      <option value="monokai">Monokai</option>
    </select>
  );
}
```

## Storybook

Browse all components and their variants in our interactive Storybook:

**🔗 [View Storybook Documentation](https://storybook.automaker.dev)** _(Coming soon)_

Run Storybook locally:

```bash
cd libs/ui
npm run storybook
```

Storybook includes:

- Live component previews
- Interactive props controls
- Theme switcher for testing all 6 themes
- Accessibility auditing via `addon-a11y`
- Auto-generated documentation

## Package Structure

```
libs/ui/
├── src/
│   ├── atoms/           # Primitive components (26+)
│   ├── molecules/       # Composed components (6+)
│   ├── organisms/       # Complex compositions (coming soon)
│   ├── lib/             # Utilities (cn, theme helpers)
│   └── themes/          # CSS theme files
├── .storybook/          # Storybook configuration
├── package.json         # Package manifest
└── README.md            # This file
```

## Design Philosophy

This library follows:

- **Atomic Design** — Components organized as atoms → molecules → organisms
- **Composition over inheritance** — Build complex UIs by composing primitives
- **Radix UI** — Accessible, unstyled primitives as foundation
- **Tailwind CSS v4** — Utility-first styling with semantic tokens
- **CVA** — Type-safe variant management
- **React 19** — Modern React patterns (no forwardRef needed)

## TypeScript

All components are fully typed with TypeScript 5.9+:

```tsx
import type { ButtonProps } from '@protolabs-ai/ui';

function CustomButton(props: ButtonProps) {
  return <Button {...props} />;
}
```

Components extend their native HTML element props:

```tsx
// Button extends React.ComponentProps<'button'>
<Button type="submit" onClick={(e) => console.log(e)} disabled={isDisabled} />
```

## Accessibility

All components follow WCAG 2.1 Level AA guidelines:

- Keyboard navigation (Tab, Enter, Escape, Arrow keys)
- Screen reader support via ARIA attributes
- Focus management and visible focus indicators
- Color contrast meeting AA standards
- Semantic HTML elements

Radix UI primitives provide baseline accessibility. Additional features:

- Focus trapping in modals
- Escape key handling
- Auto-focusing first input
- Portal rendering for overlays

Test accessibility in Storybook with the integrated `addon-a11y` panel.

## Browser Support

Supports modern browsers with native CSS features:

- Chrome/Edge 119+
- Firefox 120+
- Safari 17.4+

**Required CSS features:**

- OKLch color space (`oklch()` function)
- CSS custom properties (CSS variables)
- CSS Grid and Flexbox

## Contributing

This package is part of the AutoMaker monorepo. See the main repository for contribution guidelines.

## License

See LICENSE file in the repository root.

---

**Part of [AutoMaker](https://automaker.dev)** — AI-powered development automation platform.
