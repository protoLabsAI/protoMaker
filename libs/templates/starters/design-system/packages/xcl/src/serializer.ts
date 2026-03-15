/**
 * serializer.ts
 *
 * Converts a ComponentDef (or array of) into compact XCL XML.
 *
 * XCL wire format overview:
 *
 *   <xcl v="1">
 *     <C n="Name" x="1">                <!-- x="1" = exported -->
 *       <P propName="type?=default"/>   <!-- prop declarations -->
 *       <R>                             <!-- render tree -->
 *         <button cn="base" cn.variant="default:cls1;outline:cls2"
 *                 on.click="onClick" disabled="{disabled}">
 *           <slot/>
 *         </button>
 *       </R>
 *       <V derivedName="expression"/>   <!-- computed vars (optional) -->
 *     </C>
 *   </xcl>
 *
 * Prop type shorthand:
 *   str    → string
 *   num    → number
 *   bool   → boolean
 *   node   → ReactNode
 *   fn     → () => void
 *   elm    → React.ElementType
 *   a|b|c  → union of string literals
 *   type?  → optional (no default)
 *   type=v → has default value v
 */

import type {
  ComponentDef,
  PropDef,
  RenderNode,
  ClassCondition,
  XCLDocument,
  XCLMetrics,
} from './types.js';

// ============================================================================
// Type encoding
// ============================================================================

function encodeType(prop: PropDef): string {
  let base: string;
  const t = prop.type;

  if (t === 'string') base = 'str';
  else if (t === 'number') base = 'num';
  else if (t === 'boolean') base = 'bool';
  else if (t === 'ReactNode') base = 'node';
  else if (t === '() => void' || t.includes('=>')) base = 'fn';
  else if (t === 'React.ElementType') base = 'elm';
  else {
    // Union of string literals: "'sm' | 'md' | 'lg'" → "sm|md|lg"
    base = t.replace(/['"]/g, '').replace(/\s*\|\s*/g, '|');
  }

  if (prop.optional && prop.defaultValue === undefined) {
    base += '?';
  }
  if (prop.defaultValue !== undefined) {
    base += `=${String(prop.defaultValue)}`;
  }
  return base;
}

// ============================================================================
// XML attribute escaping
// ============================================================================

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ============================================================================
// Props element serialization
// ============================================================================

function serializeProps(props: PropDef[]): string {
  if (props.length === 0) return '';
  const attrs = props.map((p) => `${p.name}="${encodeType(p)}"`).join(' ');
  return `<P ${attrs}/>`;
}

// ============================================================================
// Render node serialization
// ============================================================================

function serializeRenderNode(node: RenderNode, depth: number): string {
  const indent = '  '.repeat(depth);

  // --- Special nodes ---
  if (node.tag === '$slot') {
    return `${indent}<slot/>`;
  }

  if (node.tag === '$text') {
    return `${indent}${node.text ?? ''}`;
  }

  if (node.tag === '$frag') {
    const children = node.children ?? [];
    if (children.length === 0) return `${indent}<$frag/>`;
    const inner = children.map((c) => serializeRenderNode(c, depth + 1)).join('\n');
    return `${indent}<$frag>\n${inner}\n${indent}</$frag>`;
  }

  // --- Regular element ---
  const parts: string[] = [];

  // Static className
  if (node.className) {
    parts.push(`cn="${escapeAttr(node.className)}"`);
  }

  // Conditional class mappings – group by prop, skip empty-classes conditions
  if (node.classConditions && node.classConditions.length > 0) {
    const byProp = new Map<string, ClassCondition[]>();
    for (const cc of node.classConditions) {
      // Skip no-op conditions (empty classes string)
      if (!cc.classes.trim()) continue;
      const existing = byProp.get(cc.prop) ?? [];
      existing.push(cc);
      byProp.set(cc.prop, existing);
    }
    for (const [prop, conditions] of Array.from(byProp.entries())) {
      const val = conditions.map((c) => `${c.value}:${c.classes}`).join(';');
      parts.push(`cn.${prop}="${escapeAttr(val)}"`);
    }
  }

  // Style
  if (node.style && Object.keys(node.style).length > 0) {
    const styleStr = Object.entries(node.style)
      .map(([k, v]) => `${k}:${v}`)
      .join(';');
    parts.push(`style="${escapeAttr(styleStr)}"`);
  }

  // Events
  if (node.events) {
    for (const [event, handler] of Object.entries(node.events)) {
      parts.push(`on.${event}="${escapeAttr(handler)}"`);
    }
  }

  // Other attributes
  if (node.attrs) {
    for (const [k, v] of Object.entries(node.attrs)) {
      parts.push(`${k}="${escapeAttr(v)}"`);
    }
  }

  const attrStr = parts.length > 0 ? ' ' + parts.join(' ') : '';
  const children = node.children ?? [];

  if (children.length === 0) {
    return `${indent}<${node.tag}${attrStr}/>`;
  }

  const childLines = children.map((c) => serializeRenderNode(c, depth + 1)).join('\n');
  return `${indent}<${node.tag}${attrStr}>\n${childLines}\n${indent}</${node.tag}>`;
}

// ============================================================================
// Component serialization
// ============================================================================

function serializeComponentDef(def: ComponentDef): string {
  const lines: string[] = [];
  const exportAttr = def.exported ? ' x="1"' : '';
  lines.push(`<C n="${escapeAttr(def.name)}"${exportAttr}>`);

  const propsXml = serializeProps(def.props);
  if (propsXml) lines.push(propsXml);

  lines.push('<R>');
  lines.push(serializeRenderNode(def.render, 1));
  lines.push('</R>');

  if (def.computedVars && def.computedVars.length > 0) {
    const vAttrs = def.computedVars.map((v) => `${v.name}="${escapeAttr(v.expression)}"`).join(' ');
    lines.push(`<V ${vAttrs}/>`);
  }

  lines.push('</C>');
  return lines.join('\n');
}

// ============================================================================
// Token estimation (rough heuristic: ~4 chars per token)
// ============================================================================

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Serialize a single ComponentDef to XCL string.
 */
export function serialize(def: ComponentDef): string {
  const inner = serializeComponentDef(def);
  return `<xcl v="1">\n${inner}\n</xcl>`;
}

/**
 * Serialize multiple ComponentDefs to a single XCL document.
 */
export function serializeDocument(doc: XCLDocument): string {
  const inner = doc.components.map(serializeComponentDef).join('\n');
  return `<xcl v="${doc.version}">\n${inner}\n</xcl>`;
}

/**
 * Serialize a ComponentDef and measure token reduction vs the equivalent TSX.
 *
 * @param def          The component definition to serialize.
 * @param tsxSource    The original TSX source string (used only for comparison).
 */
export function serializeWithMetrics(
  def: ComponentDef,
  tsxSource: string
): { xcl: string; metrics: XCLMetrics } {
  const xcl = serialize(def);
  const tsxTokens = estimateTokens(tsxSource);
  const xclTokens = estimateTokens(xcl);
  const reductionPercent = Math.round((1 - xclTokens / tsxTokens) * 100);
  return { xcl, metrics: { tsxTokens, xclTokens, reductionPercent } };
}
