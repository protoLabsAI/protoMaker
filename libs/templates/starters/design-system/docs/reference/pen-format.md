# .pen format reference

The `.pen` file format is a JSON scene graph produced by [pencil.dev](https://pencil.dev). This reference covers all 15 node types, the document root structure, fill and stroke descriptors, variable system, and theme resolution as implemented in the `@@PROJECT_NAME-pen` package.

## Document structure

Every `.pen` file is a JSON object matching the `PenDocument` interface:

```ts
interface PenDocument {
  version: string; // e.g. "2.8"
  themes?: Record<string, string[]>; // theme dimensions
  variables?: Record<string, PenVariable>; // design token variables
  children: PenNode[]; // scene graph root nodes
}
```

### `themes`

Declares the available theme dimensions and their options:

```json
{
  "themes": {
    "Mode": ["Light", "Dark"],
    "Base": ["Zinc", "Slate", "Stone"],
    "Accent": ["Violet", "Blue", "Rose"]
  }
}
```

The active theme selection is provided at parse time via the `Theme` context object:

```ts
import { parsePenDocument, resolveVariables } from '@@PROJECT_NAME-pen';

const doc = parsePenDocument(raw);
const vars = resolveVariables(doc, { Mode: 'Dark', Base: 'Zinc' });
```

### `variables`

Design token variables keyed by CSS-custom-property-style names:

```json
{
  "variables": {
    "--background": { "type": "color", "value": "#FFFFFF" },
    "--sidebar": {
      "type": "color",
      "value": [
        { "value": "#F8F8F8", "theme": { "Mode": "Light" } },
        { "value": "#1A1A1A", "theme": { "Mode": "Dark" } }
      ]
    }
  }
}
```

Variables are referenced in node fill/stroke fields as `$--variable-name`. During rendering the parser resolves them against the active theme. The last matching `theme` entry wins.

```ts
interface PenVariable {
  type: 'color' | 'number' | 'string';
  value: string | number | ThemeDependent[];
}

interface ThemeDependent {
  value: string | number;
  theme: Record<string, string>;
}
```

---

## Common node properties

All node types extend `BaseNode`:

```ts
interface BaseNode {
  id: string;
  type: string; // discriminant — see node types below
  name?: string;
  x?: number;
  y?: number;
  width?: number | 'fill_container' | 'fit_content' | { fit_content: number };
  height?: number | 'fill_container' | 'fit_content' | { fit_content: number };
  rotation?: number;
  opacity?: number; // 0–1
  enabled?: boolean;
}
```

### Width and height sizing keywords

| Value                  | CSS equivalent                                  |
| ---------------------- | ----------------------------------------------- |
| `number`               | `{n}px`                                         |
| `"fill_container"`     | `flex: 1` (or `width: 100%` in non-flex parent) |
| `"fit_content"`        | `width: auto`                                   |
| `{ fit_content: 200 }` | `min-width: 200px; width: auto`                 |

---

## Node types

### 1. `frame`

The primary layout container. Renders as a `<div>` with optional flexbox layout.

```ts
interface FrameNode extends BaseNode {
  type: 'frame';
  children?: PenNode[];
  layout?: 'none' | 'vertical' | 'horizontal';
  gap?: number;
  padding?: number | [h, v] | [top, right, bottom, left];
  justifyContent?: 'start' | 'center' | 'end' | 'space_between' | 'space_around';
  alignItems?: 'start' | 'center' | 'end';
  fill?: string;
  stroke?: Stroke | string;
  cornerRadius?: number;
  clip?: boolean;
  reusable?: boolean; // true → component boundary (codegen creates a .tsx file)
  theme?: Theme;
  slot?: string[];
}
```

`layout` controls the flex direction:

| Value          | CSS                           |
| -------------- | ----------------------------- |
| `"none"`       | `position: absolute` children |
| `"vertical"`   | `flex-direction: column`      |
| `"horizontal"` | `flex-direction: row`         |

### 2. `group`

A container without fill or layout — used for logical grouping only.

```ts
interface GroupNode extends BaseNode {
  type: 'group';
  children?: PenNode[];
  layout?: 'none' | 'vertical' | 'horizontal';
}
```

### 3. `text`

Text content. Can be a plain string or an array of styled runs.

```ts
interface TextNode extends BaseNode {
  type: 'text';
  content: string | TextStyle[];
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string | number;
  textAlign?: 'left' | 'center' | 'right' | 'justify';
  fill?: string;
  lineHeight?: number;
  textAlignVertical?: 'top' | 'middle' | 'bottom';
}

interface TextStyle {
  text: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string | number;
  fill?: string;
}
```

### 4. `icon_font`

An icon from an icon font family. The `@@PROJECT_NAME-codegen` package maps Lucide icon names to `lucide-react` component imports.

```ts
interface IconFontNode extends BaseNode {
  type: 'icon_font';
  iconFontName: string; // e.g. "hexagon", "arrow-right"
  iconFontFamily: string; // e.g. "lucide"
  fill?: string;
}
```

To resolve a Lucide icon: convert `iconFontName` to PascalCase (`arrow-right` → `ArrowRight`) and import from `lucide-react`.

### 5. `ref`

A component instance reference. Points to a `frame` with `reusable: true` elsewhere in the document.

```ts
interface RefNode extends BaseNode {
  type: 'ref';
  ref: string; // id of the source frame
  descendants?: Record<string, Record<string, unknown>>; // property overrides
}
```

`descendants` keys are either child IDs or `"parent-id/child-id"` paths. Values are partial node property overrides applied to that descendant.

### 6. `rectangle`

A filled rectangle. Renders as a `<div>` with `border-radius` if `cornerRadius` is set.

```ts
interface RectangleNode extends BaseNode {
  type: 'rectangle';
  fill?: string;
  stroke?: Stroke | string;
  cornerRadius?: number;
}
```

### 7. `ellipse`

An ellipse or arc shape. Renders as a `<div>` with `border-radius: 50%`, or as an SVG arc for partial angles.

```ts
interface EllipseNode extends BaseNode {
  type: 'ellipse';
  fill?: string;
  stroke?: Stroke | string;
  startAngle?: number; // degrees
  endAngle?: number; // degrees
}
```

### 8. `line`

A straight line between two points. Renders as SVG.

```ts
interface LineNode extends BaseNode {
  type: 'line';
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  stroke?: Stroke | string;
}
```

### 9. `polygon`

A regular polygon with `n` sides. Renders as SVG.

```ts
interface PolygonNode extends BaseNode {
  type: 'polygon';
  sides?: number;
  fill?: string;
  stroke?: Stroke | string;
}
```

### 10. `path`

An SVG-compatible path. Renders as an SVG `<path>` element.

```ts
interface PathNode extends BaseNode {
  type: 'path';
  d?: string; // SVG path data
  path?: string; // alias for d
  fill?: string;
  stroke?: Stroke | string;
}
```

### 11. `note`

A design annotation. Not rendered in the output — used to add comments visible to designers and AI agents.

```ts
interface NoteNode extends BaseNode {
  type: 'note';
  content: string;
}
```

### 12. `prompt`

An AI prompt annotation. Not rendered in output. The `model` field optionally targets a specific model.

```ts
interface PromptNode extends BaseNode {
  type: 'prompt';
  content: string;
  model?: string; // e.g. "claude-3-5-sonnet-20241022"
}
```

### 13. `context`

A context information annotation. Not rendered. Provides background information to AI agents processing the design.

```ts
interface ContextNode extends BaseNode {
  type: 'context';
  content: string;
}
```

### 14. `vector`

An imported vector graphic (SVG asset reference).

```ts
interface VectorNode extends BaseNode {
  type: 'vector';
  fill?: string;
  stroke?: Stroke | string;
}
```

### 15. `instance`

A component instance with override properties.

```ts
interface InstanceNode extends BaseNode {
  type: 'instance';
  ref: string;
  overrides?: Record<string, unknown>;
}
```

---

## Fill descriptors

Node `fill` fields accept either a plain string (color, gradient, or `$variable`) or a structured `PenFill` object.

### String fill values

| Format       | Example        | Meaning                              |
| ------------ | -------------- | ------------------------------------ |
| Hex 6-digit  | `"#3B82F6"`    | RGB color                            |
| Hex 8-digit  | `"#3B82F680"`  | RGBA color (last two digits = alpha) |
| Hex 3-digit  | `"#38F"`       | Short RGB color                      |
| Variable ref | `"$--primary"` | Resolved from `doc.variables`        |

### Structured fills

```ts
type PenFill = PenSolidFill | PenGradientFill | PenImageFill;

interface PenSolidFill {
  type: 'solid';
  color: string | PenColor;
  opacity?: number;
}

interface PenGradientFill {
  type: 'gradient';
  gradientType: 'linear' | 'radial' | 'angular';
  stops: Array<{ position: number; color: string | PenColor }>;
  start?: { x: number; y: number };
  end?: { x: number; y: number };
  opacity?: number;
}

interface PenImageFill {
  type: 'image';
  imageRef: string; // asset reference ID
  scaleMode?: 'fill' | 'fit' | 'crop' | 'tile';
  opacity?: number;
}
```

---

## Stroke descriptors

```ts
interface Stroke {
  fill?: string;
  thickness?: number | StrokeThickness;
  align?: 'inside' | 'outside' | 'center';
}

interface StrokeThickness {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}
```

A stroke can also be a plain string, treated as a color value identical to the `fill` string formats above.

---

## Variable resolution

Variables defined in `doc.variables` are resolved at render time against the active theme. The resolution algorithm:

1. If `variable.value` is a scalar (`string | number`), return it directly.
2. If `variable.value` is a `ThemeDependent[]`, iterate the array.
3. For each entry, check if all keys in `entry.theme` match the active `Theme` selection.
4. Return the value of the **last matching entry** (later entries override earlier ones).
5. If no entry matches, fall back to the first entry's value.

```ts
import { resolveVariable } from '@@PROJECT_NAME-pen';

// Resolve a single variable
const value = resolveVariable(doc.variables['--sidebar'], { Mode: 'Dark' });
// → "#1A1A1A"
```

---

## Traversal API

```ts
import { traverse } from '@@PROJECT_NAME-pen';

// Depth-first visitor
traverse(doc, (node, parent, depth) => {
  console.log(`${' '.repeat(depth! * 2)}${node.type}: ${node.name ?? node.id}`);
  // Return false to skip children
  if (node.type === 'ref') return false;
});
```

The visitor signature:

```ts
type NodeVisitor = (node: PenNode, parent?: PenNode, depth?: number) => void | boolean;
```

---

## Parser API

```ts
import { parsePenDocument } from '@@PROJECT_NAME-pen';

const doc: PenDocument = parsePenDocument(rawJson);
```

`parsePenDocument` validates the top-level structure and returns a typed `PenDocument`. It does not mutate the input. Throws `Error` if the input is not a valid `.pen` document object.
