/**
 * schema-generator.ts
 *
 * Generates JSON Schema (draft-07 compatible) from:
 *   1. An array of PropDefinition objects (from prop-extractor or manual input).
 *   2. TSX source strings — parses the exported `interface <Name>Props { ... }`
 *      block to derive prop definitions.
 *
 * Zero external dependencies — all parsing is done with plain regex + string ops.
 */

import type { PropDefinition, ComponentSchema, JSONSchemaProperty } from './types.js';

// ============================================================================
// TypeScript → JSON Schema type mapping
// ============================================================================

/** Map a TypeScript primitive type string to its JSON Schema equivalent. */
function tsTypeToJsonSchemaType(tsType: string): JSONSchemaProperty['type'] {
  const t = tsType.trim().toLowerCase();
  if (t === 'string') return 'string';
  if (t === 'number' || t === 'bigint') return 'number';
  if (t === 'boolean') return 'boolean';
  if (t === 'null') return 'null';
  if (t === 'object' || t.startsWith('{')) return 'object';
  if (t.endsWith('[]') || t.startsWith('array<')) return 'array';
  // Default for React.ReactNode, unknown, any, etc.
  return 'string';
}

// ============================================================================
// Schema generation from PropDefinition[]
// ============================================================================

/**
 * Generate a JSON Schema object for a component given its prop definitions.
 *
 * Every prop becomes a property in the schema. Required props are listed under
 * the `required` array. CSS-variable-backed props receive an extra description
 * indicating the CSS custom property they control.
 *
 * @param componentName  PascalCase component name used as schema title.
 * @param props          Array of prop definitions to convert.
 * @param description    Optional human-readable description.
 */
export function generateSchema(
  componentName: string,
  props: PropDefinition[],
  description?: string
): ComponentSchema {
  const properties: Record<string, JSONSchemaProperty> = {};
  const requiredProps: string[] = [];

  for (const prop of props) {
    const schemaProp: JSONSchemaProperty = {
      type: tsTypeToJsonSchemaType(prop.tsType),
    };

    // Build description from prop metadata
    const descParts: string[] = [];
    if (prop.description) descParts.push(prop.description);
    if (prop.cssVariable) {
      descParts.push(`Overrides CSS variable \`${prop.cssVariable}\`.`);
    }
    if (descParts.length > 0) {
      schemaProp.description = descParts.join(' ');
    }

    properties[prop.propName] = schemaProp;

    if (prop.required) {
      requiredProps.push(prop.propName);
    }
  }

  // React.ReactNode children is always present
  properties['children'] = {
    type: 'string',
    description: 'Child nodes (React.ReactNode).',
  };

  const schema: ComponentSchema = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    title: `${componentName}Props`,
    properties,
  };

  if (description) schema.description = description;
  if (requiredProps.length > 0) schema.required = requiredProps;

  return schema;
}

// ============================================================================
// TSX source parsing — extract prop definitions from interface block
// ============================================================================

/**
 * Parse a TSX source string and extract prop definitions from the exported
 * `interface <ComponentName>Props { ... }` block.
 *
 * Handles:
 *   - `propName?: type;`  (optional)
 *   - `propName: type;`   (required)
 *   - Single-line JSDoc comments (`/** ... *\/`) above a prop
 *   - CSS-variable descriptions in the form `Overrides CSS var --foo-bar`
 *
 * @param source         Full TSX source string.
 * @param componentName  Component name used to find the interface.
 * @returns              Array of PropDefinition objects.
 */
export function extractPropsFromSource(source: string, componentName: string): PropDefinition[] {
  const interfaceName = `${componentName}Props`;

  // Find the interface block
  const startPattern = new RegExp(
    `(?:export\\s+)?interface\\s+${escapeRegex(interfaceName)}\\s*\\{`
  );
  const startMatch = startPattern.exec(source);
  if (!startMatch) return [];

  const bodyStart = startMatch.index + startMatch[0].length;
  const bodyEnd = findMatchingBrace(source, bodyStart - 1);
  if (bodyEnd === -1) return [];

  const body = source.slice(bodyStart, bodyEnd);

  return parseInterfaceBody(body);
}

/**
 * Parse the body of an interface block (between the outer braces) into prop
 * definitions.  Skips `children` since it is always managed by the registry.
 */
function parseInterfaceBody(body: string): PropDefinition[] {
  const props: PropDefinition[] = [];
  const lines = body.split('\n');

  let pendingDescription: string | undefined;
  let pendingCssVar: string | undefined;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    // Single-line JSDoc comment
    const jsdocMatch = /^\/\*\*\s*(.*?)\s*\*\//.exec(line);
    if (jsdocMatch) {
      const comment = jsdocMatch[1] ?? '';
      // Detect CSS variable reference
      const cssVarMatch = /Overrides CSS\s+(?:var(?:iable)?\s+)?([--\w]+)/i.exec(comment);
      if (cssVarMatch) {
        pendingCssVar = cssVarMatch[1] ?? undefined;
      }
      pendingDescription =
        comment.replace(/Overrides CSS\s+(?:var(?:iable)?\s+)?[--\w]+\.?/i, '').trim() || undefined;
      continue;
    }

    // Multi-line comment start — skip the line
    if (line.startsWith('/*') || line.startsWith('*')) {
      continue;
    }

    // Single-line comment
    if (line.startsWith('//')) {
      pendingDescription = line.slice(2).trim() || undefined;
      continue;
    }

    // Prop line: `propName?: type;` or `propName: type;`
    const propMatch = /^(\w+)(\??):\s*(.+?)\s*;/.exec(line);
    if (propMatch) {
      const [, propName, optMark, tsType] = propMatch;
      if (!propName || propName === 'children') {
        // Reset pending and continue
        pendingDescription = undefined;
        pendingCssVar = undefined;
        continue;
      }

      props.push({
        propName,
        tsType: tsType ?? 'string',
        required: optMark !== '?',
        description: pendingDescription,
        cssVariable: pendingCssVar,
      });

      pendingDescription = undefined;
      pendingCssVar = undefined;
    }
  }

  return props;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Find the index of the closing `}` that matches the opening `{` at `openIdx`.
 * Returns -1 if not found.
 */
function findMatchingBrace(source: string, openIdx: number): number {
  let depth = 0;
  for (let i = openIdx; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Escape special regex metacharacters in a string. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ============================================================================
// Convenience: generate schema directly from TSX source
// ============================================================================

/**
 * Parse a generated TSX source file and produce a ready-to-store
 * `ComponentSchema` in one step.
 *
 * @param componentName  PascalCase component name.
 * @param source         Full TSX source content.
 * @param description    Optional schema-level description.
 */
export function schemaFromSource(
  componentName: string,
  source: string,
  description?: string
): ComponentSchema {
  const props = extractPropsFromSource(source, componentName);
  return generateSchema(componentName, props, description);
}
