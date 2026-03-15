/**
 * XCL → TSX Code Generator
 *
 * Converts a `ComponentDef` to a React TSX component string.
 */

import type { ComponentDef, PropDef } from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a TypeScript type annotation for a prop.
 * Enum props produce a union of string literals; others map to primitives.
 */
function propTypeAnnotation(prop: PropDef): string {
  if (prop.type === 'enum' && prop.values && prop.values.length > 0) {
    return prop.values.map((v) => `'${v}'`).join(' | ');
  }
  if (prop.type === 'boolean') return 'boolean';
  if (prop.type === 'number') return 'number';
  return 'string';
}

/** Indent every line of `text` by `n` spaces. */
function indent(text: string, n: number): string {
  const pad = ' '.repeat(n);
  return text
    .split('\n')
    .map((line) => (line.trim() === '' ? '' : `${pad}${line}`))
    .join('\n');
}

// ---------------------------------------------------------------------------
// xclToTsx
// ---------------------------------------------------------------------------

/**
 * Convert a `ComponentDef` to a React TSX component string.
 *
 * @example
 * ```ts
 * const tsx = xclToTsx(buttonDef);
 * // → 'import React from "react"; export const Button: React.FC<ButtonProps> = …'
 * ```
 */
export function xclToTsx(component: ComponentDef): string {
  const { name, baseClasses, props, conditionals, children } = component;
  const propsInterfaceName = `${name}Props`;

  // -------------------------------------------------------------------------
  // Interface lines
  // -------------------------------------------------------------------------
  const interfaceLines: string[] = [];
  for (const prop of props) {
    const optional = !prop.required ? '?' : '';
    const typeLine = `  ${prop.name}${optional}: ${propTypeAnnotation(prop)};`;
    if (prop.description) {
      interfaceLines.push(`  /** ${prop.description} */`);
    }
    interfaceLines.push(typeLine);
  }
  interfaceLines.push('  children?: React.ReactNode;');

  // -------------------------------------------------------------------------
  // Destructured parameters with defaults
  // -------------------------------------------------------------------------
  const paramLines: string[] = [];
  for (const prop of props) {
    if (prop.default !== undefined) {
      paramLines.push(`  ${prop.name} = '${prop.default}',`);
    } else {
      paramLines.push(`  ${prop.name},`);
    }
  }
  paramLines.push('  children,');

  // -------------------------------------------------------------------------
  // Class computation
  // -------------------------------------------------------------------------
  const classEntries: string[] = [];

  if (baseClasses) {
    classEntries.push(`'${baseClasses}'`);
  }

  for (const cond of conditionals) {
    classEntries.push(`    ${cond.prop} === '${cond.value}' ? '${cond.classes}' : ''`);
  }

  let classesBlock: string;
  if (classEntries.length > 0) {
    const entries = classEntries.map((e, i) => (i === 0 ? `    ${e},` : `${e},`)).join('\n');
    classesBlock = `  const classes = [\n${entries}\n  ].filter(Boolean).join(' ');`;
  } else {
    classesBlock = `  const classes = '${baseClasses}';`;
  }

  // -------------------------------------------------------------------------
  // JSX body
  // -------------------------------------------------------------------------
  const childrenContent = children ? `\n      ${children}\n    ` : '\n      {children}\n    ';
  const jsxBody = `  return (\n    <div className={classes}>${childrenContent}</div>\n  );`;

  // -------------------------------------------------------------------------
  // Assemble
  // -------------------------------------------------------------------------
  const lines: string[] = [];

  lines.push(`import React from 'react';`);
  lines.push('');

  // Interface
  lines.push(`export interface ${propsInterfaceName} {`);
  lines.push(...interfaceLines);
  lines.push('}');
  lines.push('');

  // Component function
  lines.push(`export const ${name}: React.FC<${propsInterfaceName}> = ({`);
  lines.push(...paramLines);
  lines.push('}) => {');
  lines.push(classesBlock);
  lines.push('');
  lines.push(jsxBody);
  lines.push('};');

  return lines.join('\n');
}
