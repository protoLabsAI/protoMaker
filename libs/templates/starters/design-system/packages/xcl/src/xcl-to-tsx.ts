/**
 * xcl-to-tsx.ts
 *
 * Converts an XCL string directly to valid TypeScript React (TSX) source code.
 *
 * Generated code follows React 19 conventions:
 *   - Function declarations (not arrow functions)
 *   - No React.forwardRef
 *   - Uses cn() helper for conditional classNames
 *   - Named exports
 *
 * Example output for a Button component:
 *
 *   import { cn } from '../utils/cn';
 *
 *   interface ButtonProps {
 *     variant?: string;
 *     size?: 'sm' | 'md' | 'lg';
 *     children: React.ReactNode;
 *     onClick?: () => void;
 *     disabled?: boolean;
 *   }
 *
 *   export function Button({
 *     variant = 'default',
 *     size = 'md',
 *     children,
 *     onClick,
 *     disabled = false,
 *   }: ButtonProps) {
 *     return (
 *       <button
 *         className={cn(
 *           'base-classes',
 *           variant === 'default' && 'cls1',
 *           variant === 'outline' && 'cls2',
 *         )}
 *         onClick={onClick}
 *         disabled={disabled}
 *       >
 *         {children}
 *       </button>
 *     );
 *   }
 */

import { deserialize } from './deserializer.js';
import type { ComponentDef, PropDef, PropType, RenderNode, ClassCondition } from './types.js';

// ============================================================================
// Type helpers
// ============================================================================

function propTypeToTS(type: PropType, optional: boolean): string {
  switch (type) {
    case 'string':
      return 'string';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'ReactNode':
      return 'React.ReactNode';
    case '() => void':
      return '() => void';
    case 'React.ElementType':
      return 'React.ElementType';
    default:
      // Union literals like "'sm' | 'md' | 'lg'" pass through directly
      return type;
  }
  void optional; // used by caller for the ? marker
}

function defaultValueLiteral(val: string | number | boolean | undefined): string {
  if (val === undefined) return '';
  if (typeof val === 'boolean') return String(val);
  if (typeof val === 'number') return String(val);
  // String default — wrap in quotes if not already
  const s = String(val);
  if (s.startsWith("'") || s.startsWith('"')) return s;
  return `'${s}'`;
}

// ============================================================================
// Interface generation
// ============================================================================

function generateInterface(name: string, props: PropDef[]): string {
  if (props.length === 0) return `interface ${name}Props {}`;

  const lines: string[] = [`interface ${name}Props {`];
  for (const p of props) {
    const tsType = propTypeToTS(p.type, p.optional);
    const optMarker = p.optional ? '?' : '';
    lines.push(`  ${p.name}${optMarker}: ${tsType};`);
  }
  lines.push('}');
  return lines.join('\n');
}

// ============================================================================
// Destructured params generation
// ============================================================================

function generateParams(props: PropDef[]): string {
  if (props.length === 0) return '{}';

  const lines: string[] = [];
  for (const p of props) {
    const defVal = defaultValueLiteral(p.defaultValue);
    if (defVal) {
      lines.push(`  ${p.name} = ${defVal},`);
    } else {
      lines.push(`  ${p.name},`);
    }
  }
  return `{\n${lines.join('\n')}\n}`;
}

// ============================================================================
// className expression generation
// ============================================================================

function buildClassNameExpr(
  base: string | undefined,
  conditions: ClassCondition[] | undefined
): string {
  if (!base && (!conditions || conditions.length === 0)) return '';

  const parts: string[] = [];
  if (base) parts.push(`'${base.replace(/'/g, "\\'")}'`);

  if (conditions) {
    for (const cc of conditions) {
      if (cc.prop === '$') {
        // Passthrough className prop
        parts.push(cc.classes);
      } else if (cc.value === 'true') {
        // Boolean prop
        parts.push(`${cc.prop} && '${cc.classes.replace(/'/g, "\\'")}'`);
      } else if (cc.value === 'false') {
        parts.push(`!${cc.prop} && '${cc.classes.replace(/'/g, "\\'")}'`);
      } else {
        // String union value
        parts.push(`${cc.prop} === '${cc.value}' && '${cc.classes.replace(/'/g, "\\'")}'`);
      }
    }
  }

  if (parts.length === 1 && !parts[0]?.includes(' && ') && !parts[0]?.includes(',')) {
    // Single static class — use simple string
    return `className=${parts[0]!.startsWith("'") ? parts[0] : `{${parts[0]}}`}`;
  }

  return `className={cn(\n${parts.map((p) => `          ${p},`).join('\n')}\n        )}`;
}

// ============================================================================
// JSX render generation
// ============================================================================

function generateJSX(node: RenderNode, depth: number, hasClassNames: boolean): string {
  const indent = '  '.repeat(depth);

  if (node.tag === '$slot') {
    return `${indent}{children}`;
  }

  if (node.tag === '$text') {
    const t = node.text ?? '';
    // If it looks like a {expr}, keep as-is; otherwise wrap as literal
    return `${indent}${t.startsWith('{') ? t : t}`;
  }

  if (node.tag === '$frag') {
    const children = node.children ?? [];
    if (children.length === 0) return `${indent}<></>`;
    const inner = children.map((c) => generateJSX(c, depth + 1, hasClassNames)).join('\n');
    return `${indent}<>\n${inner}\n${indent}</>`;
  }

  const attrLines: string[] = [];
  const innerIndent = '  '.repeat(depth + 1);

  // className
  const cnExpr = buildClassNameExpr(node.className, node.classConditions);
  if (cnExpr) {
    attrLines.push(`${innerIndent}${cnExpr}`);
  }

  // style
  if (node.style && Object.keys(node.style).length > 0) {
    const styleObj = Object.entries(node.style)
      .map(([k, v]) => {
        // Convert kebab-case to camelCase
        const camel = k.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
        const val = v.startsWith('{') ? v : `'${v}'`;
        return `${camel}: ${val}`;
      })
      .join(', ');
    attrLines.push(`${innerIndent}style={{ ${styleObj} }}`);
  }

  // events
  if (node.events) {
    for (const [event, handler] of Object.entries(node.events)) {
      const onName = 'on' + event.charAt(0).toUpperCase() + event.slice(1);
      attrLines.push(`${innerIndent}${onName}={${handler}}`);
    }
  }

  // other attrs
  if (node.attrs) {
    for (const [k, v] of Object.entries(node.attrs)) {
      if (v.startsWith('{') && v.endsWith('}')) {
        attrLines.push(`${innerIndent}${k}=${v}`);
      } else if (v === 'true') {
        attrLines.push(`${innerIndent}${k}`);
      } else if (v === 'false') {
        // skip false boolean attrs
      } else {
        attrLines.push(`${innerIndent}${k}="${v}"`);
      }
    }
  }

  const children = node.children ?? [];
  const tagWithAttrs =
    attrLines.length > 0 ? `<${node.tag}\n${attrLines.join('\n')}\n${indent}>` : `<${node.tag}>`;

  if (children.length === 0) {
    if (attrLines.length > 0) {
      // Self-closing with attrs
      const selfClose = `<${node.tag}\n${attrLines.join('\n')}\n${indent}/>`;
      return `${indent}${selfClose}`;
    }
    return `${indent}<${node.tag} />`;
  }

  const childLines = children.map((c) => generateJSX(c, depth + 1, hasClassNames)).join('\n');

  return `${indent}${tagWithAttrs}\n${childLines}\n${indent}</${node.tag}>`;
}

// ============================================================================
// Needs-cn check
// ============================================================================

function nodeNeedsClassNames(node: RenderNode): boolean {
  if (node.className || (node.classConditions && node.classConditions.length > 0)) {
    return true;
  }
  if (node.children) {
    return node.children.some(nodeNeedsClassNames);
  }
  return false;
}

// ============================================================================
// Full component generation
// ============================================================================

function generateComponent(def: ComponentDef): string {
  const usesCn = nodeNeedsClassNames(def.render);
  const hasConditions =
    (def.render.classConditions?.length ?? 0) > 0 ||
    Boolean(
      def.render.children?.some(
        (c) => typeof c === 'object' && (c as RenderNode).classConditions?.length
      )
    );

  const lines: string[] = [];

  // Interface
  lines.push(generateInterface(def.name, def.props));
  lines.push('');

  // Function signature
  const exportKw = def.exported ? 'export ' : '';
  const params = generateParams(def.props);
  const iface = def.name + 'Props';
  lines.push(`${exportKw}function ${def.name}(${params}: ${iface}) {`);

  // Computed vars
  if (def.computedVars && def.computedVars.length > 0) {
    for (const cv of def.computedVars) {
      lines.push(`  const ${cv.name} = ${cv.expression};`);
    }
    lines.push('');
  }

  // Return
  lines.push('  return (');
  lines.push(generateJSX(def.render, 2, usesCn || hasConditions));
  lines.push('  );');
  lines.push('}');

  return lines.join('\n');
}

// ============================================================================
// Imports generation
// ============================================================================

function generateImports(defs: ComponentDef[]): string {
  const usesCn = defs.some((d) => nodeNeedsClassNames(d.render));
  const usesReact = defs.some((d) => d.props.some((p) => p.type === 'ReactNode'));

  const imports: string[] = [];

  if (usesReact) {
    imports.push("import React from 'react';");
  }
  if (usesCn) {
    imports.push("import { cn } from '../utils/cn';");
  }

  return imports.join('\n');
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Convert an XCL string to a TSX source file string.
 *
 * @param xcl     The XCL document string.
 * @returns       A TypeScript React (.tsx) source file string.
 */
export function xclToTSX(xcl: string): string {
  const defs = deserialize(xcl);
  if (defs.length === 0) return '';

  const importBlock = generateImports(defs);
  const components = defs.map(generateComponent).join('\n\n');

  const parts: string[] = [];
  if (importBlock) {
    parts.push(importBlock);
    parts.push('');
  }
  parts.push(components);

  return parts.join('\n') + '\n';
}

/**
 * Convert a single ComponentDef directly to TSX source.
 * Useful when you already have the parsed structure.
 */
export function componentDefToTSX(def: ComponentDef): string {
  const importBlock = generateImports([def]);
  const component = generateComponent(def);

  const parts: string[] = [];
  if (importBlock) {
    parts.push(importBlock);
    parts.push('');
  }
  parts.push(component);

  return parts.join('\n') + '\n';
}
