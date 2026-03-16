/**
 * import-generator.ts
 *
 * Determines which import statements are needed for a generated React component
 * and produces the formatted import block.
 *
 * Handles:
 *  - React core import
 *  - Lucide icon imports (for icon-font nodes)
 *  - CSS module import (when css-modules strategy is used)
 */

// ============================================================================
// Minimal local types
// ============================================================================

interface LocalNode {
  type: string;
  /** For icon-font nodes */
  fontFamily?: string;
  character?: string;
  name?: string;
  children?: LocalNode[];
}

// ============================================================================
// Import Specification
// ============================================================================

export interface ImportSpec {
  /** Always true – every generated component uses React. */
  hasReact: boolean;
  /** Lucide icon names to import (PascalCase, e.g. ['Home', 'Settings']). */
  lucideIcons: string[];
  /** True when the component uses a CSS module file. */
  hasCSSModule: boolean;
  /** Name of the CSS module file (e.g. 'Button.module.css'). */
  cssModuleFile?: string;
}

// ============================================================================
// Icon Font → Lucide Name Mapping
// ============================================================================

/**
 * Convert an icon-font node's name/character to a PascalCase Lucide icon name.
 *
 * Lucide icon names are PascalCase: 'home' → 'Home', 'arrow-right' → 'ArrowRight'.
 * If the node has an explicit `name` (e.g. 'home', 'arrow-right'), that takes
 * priority over the Unicode character.
 */
export function toLucideIconName(node: LocalNode): string {
  const raw = node.name ?? '';
  if (!raw) return 'Box'; // safe fallback icon

  return raw
    .replace(/[^a-zA-Z0-9\s_-]/g, '')
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('');
}

// ============================================================================
// Node Tree Scanning
// ============================================================================

function collectIconFontNodes(node: LocalNode, acc: LocalNode[]): void {
  if (node.type === 'icon-font' || node.type === 'icon_font') {
    acc.push(node);
  }
  for (const child of node.children ?? []) {
    collectIconFontNodes(child, acc);
  }
}

// ============================================================================
// Import Collection
// ============================================================================

/**
 * Analyse a component node tree and return the set of imports needed for the
 * generated .tsx file.
 *
 * @param rootNode       The root PenFrame to analyse.
 * @param _doc           Reserved for future cross-document reference resolution.
 * @param cssStrategy    The CSS output strategy for this component.
 * @param componentName  Used to derive the CSS module filename.
 */
export function collectRequiredImports(
  rootNode: LocalNode,
  _doc: unknown,
  cssStrategy: 'inline' | 'css-modules' | 'tailwind' = 'inline',
  componentName = 'Component'
): ImportSpec {
  // Collect icon-font nodes
  const iconNodes: LocalNode[] = [];
  collectIconFontNodes(rootNode, iconNodes);

  const lucideIconsSet = new Set<string>();
  for (const iconNode of iconNodes) {
    lucideIconsSet.add(toLucideIconName(iconNode));
  }

  const hasCSSModule = cssStrategy === 'css-modules';

  return {
    hasReact: true,
    lucideIcons: Array.from(lucideIconsSet).sort(),
    hasCSSModule,
    cssModuleFile: hasCSSModule ? `${componentName}.module.css` : undefined,
  };
}

// ============================================================================
// Import Block Generation
// ============================================================================

/**
 * Render an ImportSpec to a formatted import block string suitable for
 * placement at the top of a generated .tsx file.
 *
 * Example output:
 * ```ts
 * import React from 'react';
 * import { Home, Settings } from 'lucide-react';
 * import styles from './Button.module.css';
 * ```
 */
export function generateImportBlock(spec: ImportSpec): string {
  const lines: string[] = [];

  if (spec.hasReact) {
    lines.push("import React from 'react';");
  }

  if (spec.lucideIcons.length > 0) {
    const icons = spec.lucideIcons.join(', ');
    lines.push(`import { ${icons} } from 'lucide-react';`);
  }

  if (spec.hasCSSModule && spec.cssModuleFile) {
    lines.push(`import styles from './${spec.cssModuleFile}';`);
  }

  return lines.join('\n');
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Check whether a Lucide icon name is likely valid.
 * This is a lightweight guard—full validation requires the lucide-react package.
 */
export function isValidLucideIconName(name: string): boolean {
  return /^[A-Z][A-Za-z0-9]+$/.test(name);
}
