/**
 * XCL Serializer / Deserializer
 *
 * Bidirectional codec between `ComponentDef` and XCL (XML Component Language).
 * Uses only Node.js built-ins — no external dependencies.
 */

import type { ComponentDef, PropDef, ConditionalClass } from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Escape special XML characters in attribute values and text content. */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Unescape XML entities. */
function unescapeXml(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

// ---------------------------------------------------------------------------
// Serialize
// ---------------------------------------------------------------------------

/**
 * Serialize a `ComponentDef` to an XCL XML string.
 *
 * @example
 * ```ts
 * const xml = serialize(buttonDef);
 * // → '<component name="Button" baseClasses="btn" ...>…</component>'
 * ```
 */
export function serialize(component: ComponentDef): string {
  const lines: string[] = [];

  // Opening <component> tag
  const attrs: string[] = [
    `name="${escapeXml(component.name)}"`,
    `baseClasses="${escapeXml(component.baseClasses)}"`,
  ];
  if (component.description) {
    attrs.push(`description="${escapeXml(component.description)}"`);
  }
  lines.push(`<component ${attrs.join(' ')}>`);

  // <props>
  if (component.props.length > 0) {
    lines.push('  <props>');
    for (const prop of component.props) {
      const propAttrs: string[] = [`name="${escapeXml(prop.name)}"`, `type="${prop.type}"`];
      propAttrs.push(`required="${prop.required}"`);
      if (prop.default !== undefined) {
        propAttrs.push(`default="${escapeXml(prop.default)}"`);
      }
      if (prop.values && prop.values.length > 0) {
        propAttrs.push(`values="${escapeXml(prop.values.join(','))}"`);
      }
      if (prop.description) {
        propAttrs.push(`description="${escapeXml(prop.description)}"`);
      }
      if (prop.cssVariable) {
        propAttrs.push(`cssVariable="${escapeXml(prop.cssVariable)}"`);
      }
      lines.push(`    <prop ${propAttrs.join(' ')} />`);
    }
    lines.push('  </props>');
  }

  // <conditionals>
  if (component.conditionals.length > 0) {
    lines.push('  <conditionals>');
    for (const cond of component.conditionals) {
      lines.push(
        `    <conditional prop="${escapeXml(cond.prop)}" value="${escapeXml(cond.value)}" classes="${escapeXml(cond.classes)}" />`
      );
    }
    lines.push('  </conditionals>');
  }

  // <children>
  if (component.children !== undefined) {
    lines.push(`  <children>${escapeXml(component.children)}</children>`);
  }

  lines.push('</component>');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Deserialize helpers
// ---------------------------------------------------------------------------

/**
 * Extract the value of an XML attribute from a tag string.
 * Returns `undefined` if the attribute is absent.
 */
function getAttribute(tag: string, attr: string): string | undefined {
  const re = new RegExp(`${attr}="([^"]*)"`, 'i');
  const match = re.exec(tag);
  if (!match) return undefined;
  return unescapeXml(match[1] ?? '');
}

/**
 * Extract all self-closing `<tagName …/>` elements from `xml` between
 * `<parentTag>` and `</parentTag>`.
 */
function extractChildren(xml: string, parentTag: string): string[] {
  const blockRe = new RegExp(`<${parentTag}[^>]*>([\\s\\S]*?)<\\/${parentTag}>`, 'i');
  const blockMatch = blockRe.exec(xml);
  if (!blockMatch) return [];
  const block = blockMatch[1] ?? '';
  const tagRe = /<\w+[^>]*\/>/g;
  return Array.from(block.matchAll(tagRe), (m) => m[0]);
}

// ---------------------------------------------------------------------------
// Deserialize
// ---------------------------------------------------------------------------

/**
 * Deserialize an XCL XML string back to a `ComponentDef`.
 *
 * @throws {Error} if the XML is missing a required `<component>` element.
 *
 * @example
 * ```ts
 * const def = deserialize(xml);
 * // → ComponentDef { name: 'Button', baseClasses: 'btn', … }
 * ```
 */
export function deserialize(xml: string): ComponentDef {
  // Parse <component …> opening tag
  const componentTagMatch = /<component\s([^>]*)>/i.exec(xml);
  if (!componentTagMatch) {
    throw new Error('XCL deserialize: missing <component> element');
  }
  const componentTag = componentTagMatch[1] ?? '';

  const name = getAttribute(componentTag, 'name') ?? '';
  const baseClasses = getAttribute(componentTag, 'baseClasses') ?? '';
  const description = getAttribute(componentTag, 'description');

  // Parse props
  const props: PropDef[] = [];
  for (const propTag of extractChildren(xml, 'props')) {
    const propName = getAttribute(propTag, 'name');
    const propType = getAttribute(propTag, 'type') as PropDef['type'] | undefined;
    if (!propName || !propType) continue;

    const requiredAttr = getAttribute(propTag, 'required');
    const valuesAttr = getAttribute(propTag, 'values');

    const prop: PropDef = {
      name: propName,
      type: propType,
      required: requiredAttr === 'true',
    };

    const defaultVal = getAttribute(propTag, 'default');
    if (defaultVal !== undefined) prop.default = defaultVal;

    if (valuesAttr) prop.values = valuesAttr.split(',');

    const propDescription = getAttribute(propTag, 'description');
    if (propDescription !== undefined) prop.description = propDescription;

    const cssVariable = getAttribute(propTag, 'cssVariable');
    if (cssVariable !== undefined) prop.cssVariable = cssVariable;

    props.push(prop);
  }

  // Parse conditionals
  const conditionals: ConditionalClass[] = [];
  for (const condTag of extractChildren(xml, 'conditionals')) {
    const prop = getAttribute(condTag, 'prop');
    const value = getAttribute(condTag, 'value');
    const classes = getAttribute(condTag, 'classes');
    if (!prop || value === undefined || !classes) continue;
    conditionals.push({ prop, value, classes });
  }

  // Parse <children> text content
  const childrenMatch = /<children>([\s\S]*?)<\/children>/i.exec(xml);
  const children = childrenMatch ? unescapeXml(childrenMatch[1] ?? '') : undefined;

  const result: ComponentDef = { name, baseClasses, conditionals, props };
  if (description !== undefined) result.description = description;
  if (children !== undefined) result.children = children;

  return result;
}
