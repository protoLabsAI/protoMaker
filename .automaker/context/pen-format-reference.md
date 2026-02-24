# .pen File Format Reference (v2.8)

The `designs/` directory contains `.pen` files — JSON scene graphs from pencil.dev. We are building a native renderer and editor to replace pencil.dev in our workflow.

## Document Structure

```typescript
interface PenDocument {
  version: string;                           // "2.8"
  themes?: Record<string, string[]>;         // { "Mode": ["Light", "Dark"], "Base": ["Zinc", ...] }
  variables?: Record<string, PenVariable>;   // Design tokens
  children: PenNode[];                       // Scene graph root nodes
}
```

## Node Types (discriminated union on `type` field)

| Type | Renders As | Key Props |
|------|-----------|-----------|
| `frame` | `<div>` with flexbox | layout, gap, padding, fill, stroke, clip, cornerRadius, children |
| `group` | `<div>` container (no fill) | layout, children |
| `text` | `<span>` | content (string or TextStyle[]), fontFamily, fontSize, fontWeight, textAlign |
| `icon_font` | Lucide React icon | iconFontName ("hexagon"), iconFontFamily ("lucide"), fill |
| `ref` | Clone of referenced component | ref (source ID), descendants (overrides map) |
| `rectangle` | `<div>` with fill | fill, stroke, cornerRadius |
| `ellipse` | `<div>` with border-radius: 50% | fill, stroke, startAngle, endAngle |
| `line` | SVG line | x1, y1, x2, y2, stroke |
| `polygon` | SVG polygon | sides, fill, stroke |
| `path` | SVG path | d (SVG path data), fill, stroke |
| `note` | Hidden (design annotation) | content |
| `prompt` | Hidden (AI prompt) | content, model |
| `context` | Hidden (context info) | content |

## Common Properties (all nodes)

```typescript
id: string;         // Unique, no "/" chars
type: string;       // Discriminant
x?: number;         // Absolute position (when parent layout is "none")
y?: number;
name?: string;      // Human label
width?: number | "fill_container" | "fit_content" | { fit_content: number };
height?: number | "fill_container" | "fit_content" | { fit_content: number };
rotation?: number;
opacity?: number;   // 0-1
enabled?: boolean;
```

## Layout System (frames & groups)

```typescript
layout?: "none" | "vertical" | "horizontal";  // none=absolute, vertical=flex-col, horizontal=flex-row
gap?: number;
padding?: number | [h, v] | [top, right, bottom, left];
justifyContent?: "start" | "center" | "end" | "space_between" | "space_around";
alignItems?: "start" | "center" | "end";
clip?: boolean;  // overflow: hidden
```

**Size mapping:**
- `fill_container` → `flex: 1` (or `width: 100%` in non-flex)
- `fit_content` → `width: auto`
- `{ fit_content: 200 }` → `width: auto; min-width: 200px`
- `number` → `width: Npx`

## Fills

```typescript
// Solid color (most common)
fill?: string;  // "#RRGGBB", "#RRGGBBAA", "#RGB", or "$variable-name"

// Multiple fills (array, painted in order)
fill?: PenFill[];

// Gradient
{ type: "linear_gradient", from: {x,y}, to: {x,y}, colors: [{color, position}...] }
{ type: "radial_gradient", center: {x,y}, radius: number, colors: [...] }

// Image
{ type: "image", src: "../../path.png", mode: "stretch"|"fill"|"fit" }
```

## Variables & Themes

```typescript
// Variable declaration
"variables": {
  "--background": { "type": "color", "value": "#FFFFFF" },
  "--sidebar": { "type": "color", "value": [
    { "value": "#F8F8F8", "theme": { "Mode": "Light" } },
    { "value": "#1A1A1A", "theme": { "Mode": "Dark" } }
  ]}
}

// Variable usage — "$" prefix in any color/fill field
"fill": "$--background"
```

**Resolution:** Match current theme selections against variable's theme-dependent values. Last matching entry wins. Variables without theme values use their default.

## Components & Instances

```typescript
// Component: any node with reusable: true
{ "type": "frame", "id": "sidebar-comp", "reusable": true, ... }

// Instance: ref node pointing to component
{ "type": "ref", "id": "inst-1", "ref": "sidebar-comp", "x": 100, "y": 0 }

// Overrides via descendants map (keyed by child ID or "parent/child" path)
{ "type": "ref", "ref": "sidebar-comp", "descendants": {
    "child-id": { "fill": "#FF0000" },
    "parent-id/child-id": { "content": "New text" }
  }
}
```

## Existing Designs

| File | Content |
|------|---------|
| `designs/components/shadcn-kit.pen` | 88 reusable components, 28 variables, multi-theme (Light/Dark + 5 bases + 8 accents). Sidebar, Buttons, Cards, Dashboards, Hero CTA, Twitch Panel. **6,321 lines.** |
| `designs/site/landing-page.pen` | Empty placeholder (800x600) |
| `designs/experiments/scratch.pen` | Empty placeholder (800x600) |

## Implementation Rules

1. **No heavy deps** — render with React components + CSS flexbox, not fabric.js/konva
2. **Types in `@protolabs-ai/types`** (libs/types/src/pen.ts) — single source of truth
3. **Parser in `@protolabs-ai/pen-parser`** (libs/pen-parser/) — follows libs/ conventions
4. **Server routes** in apps/server/src/routes/designs/ — Express 5 pattern
5. **UI components** in apps/ui/src/components/views/designs-view/
6. **Lucide icons** — map `iconFontFamily: "lucide"` + `iconFontName` to lucide-react components
7. **Variable tokens** — `$--background` maps to CSS `var(--background)` or resolved hex from variables map
8. **Defer exotic features** — mesh gradients, path editing, blend modes are follow-up work
