/**
 * prop-extractor.ts
 *
 * Extracts React prop definitions from variable references in PenNode
 * styling properties.  Each unique $--variable becomes a typed prop so
 * consumers can override design tokens at component instantiation.
 */

// ============================================================================
// Minimal local types
// ============================================================================

interface LocalFill {
  type: string;
  color?: string;
  stops?: Array<{ position: number; color: string }>;
}

interface LocalStroke {
  color: string;
  width: number;
}

interface LocalNode {
  id: string;
  name?: string;
  type: string;
  fills?: LocalFill[];
  strokes?: LocalStroke[];
  children?: LocalNode[];
  // text-specific
  content?: string;
}

interface LocalDocument {
  variables?: Array<{ id: string; name: string; type: string }>;
}

// ============================================================================
// Prop Definition
// ============================================================================

/** A single React prop derived from a $--variable reference in the design. */
export interface PropDefinition {
  /** Prop name in camelCase (e.g. 'primaryColor'). */
  propName: string;
  /** TypeScript type for the prop (always 'string' for CSS variables). */
  tsType: string;
  /** The CSS custom property this maps to (e.g. '--primary-color'). */
  cssVariable: string;
  /** Whether a value is required (false — always has a CSS fallback). */
  required: boolean;
}

// ============================================================================
// Variable Reference Scanning
// ============================================================================

function collectVarsFromFills(fills: LocalFill[]): Set<string> {
  const vars = new Set<string>();
  for (const fill of fills) {
    if (fill.color?.startsWith('$')) vars.add(fill.color.slice(1));
    for (const stop of fill.stops ?? []) {
      if (stop.color.startsWith('$')) vars.add(stop.color.slice(1));
    }
  }
  return vars;
}

function collectVarsFromNode(node: LocalNode, acc: Set<string>): void {
  for (const v of collectVarsFromFills(node.fills ?? [])) acc.add(v);
  for (const stroke of node.strokes ?? []) {
    if (stroke.color.startsWith('$')) acc.add(stroke.color.slice(1));
  }
  // Recurse into children
  for (const child of node.children ?? []) {
    collectVarsFromNode(child, acc);
  }
}

/** Collect all unique CSS variable names referenced (as $--name) within a
 *  node tree.  Returns names like '--primary-color' (the CSS var name). */
export function collectVariableRefs(node: LocalNode): string[] {
  const acc = new Set<string>();
  collectVarsFromNode(node, acc);
  return Array.from(acc);
}

// ============================================================================
// CSS variable → prop name
// ============================================================================

/**
 * Convert a CSS variable name like '--primary-color' to a camelCase prop
 * name like 'primaryColor'.
 */
export function cssVarToPropName(cssVar: string): string {
  // Strip leading '--'
  const stripped = cssVar.replace(/^-+/, '');
  return stripped.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

// ============================================================================
// Prop Extraction
// ============================================================================

/**
 * Extract all React prop definitions for a component node tree.
 *
 * Each unique CSS variable reference in the node tree produces one optional
 * string prop that maps to a CSS custom property override.
 *
 * @param node   The root PenFrame/node to scan.
 * @param _doc   The parent document (reserved for future variable metadata lookup).
 */
export function extractProps(node: LocalNode, _doc: LocalDocument): PropDefinition[] {
  const cssVars = collectVariableRefs(node);

  return cssVars.map((cssVar) => ({
    propName: cssVarToPropName(cssVar),
    tsType: 'string',
    cssVariable: cssVar,
    required: false,
  }));
}

// ============================================================================
// Code Generation
// ============================================================================

/**
 * Generate a TypeScript interface string for the component props.
 *
 * Example output:
 * ```ts
 * export interface ButtonProps {
 *   primaryColor?: string;
 *   textColor?: string;
 *   children?: React.ReactNode;
 * }
 * ```
 */
export function generatePropInterface(
  componentName: string,
  props: PropDefinition[],
  extraCssVars: string[] = []
): string {
  const interfaceName = `${componentName}Props`;
  const lines: string[] = [`export interface ${interfaceName} {`];

  const allProps = [
    ...props,
    ...extraCssVars
      .filter((v) => !props.some((p) => p.cssVariable === v))
      .map((cssVar) => ({
        propName: cssVarToPropName(cssVar),
        tsType: 'string',
        cssVariable: cssVar,
        required: false,
      })),
  ];

  for (const prop of allProps) {
    const optional = prop.required ? '' : '?';
    lines.push(`  /** Overrides CSS var ${prop.cssVariable} */`);
    lines.push(`  ${prop.propName}${optional}: ${prop.tsType};`);
  }

  // Always include children
  lines.push('  children?: React.ReactNode;');
  lines.push('}');

  return lines.join('\n');
}

/**
 * Generate the style object expression that maps incoming props to CSS custom
 * properties so they flow down to child elements via CSS cascade.
 *
 * Example output (as a string to embed in JSX):
 * ```ts
 * {
 *   '--primary-color': props.primaryColor,
 *   '--text-color': props.textColor,
 * } as React.CSSProperties
 * ```
 */
export function generatePropStyleExpression(props: PropDefinition[]): string {
  if (props.length === 0) return '{}';

  const entries = props.map((p) => `    '${p.cssVariable}': props.${p.propName}`).join(',\n');

  return `{\n${entries},\n  }`;
}
