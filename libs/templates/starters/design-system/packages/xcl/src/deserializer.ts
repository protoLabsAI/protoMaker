/**
 * deserializer.ts
 *
 * Parses an XCL XML string and reconstructs one or more ComponentDef objects.
 *
 * Includes a zero-dependency minimal XML parser sufficient for the XCL subset.
 *
 * XCL prop type decoding (inverse of serializer.ts encoding):
 *   str   → 'string'
 *   num   → 'number'
 *   bool  → 'boolean'
 *   node  → 'ReactNode'
 *   fn    → '() => void'
 *   elm   → 'React.ElementType'
 *   a|b|c → "'a' | 'b' | 'c'"
 *   type? → optional, no default
 *   type=v → has default value v
 */

import type {
  ComponentDef,
  PropDef,
  PropType,
  RenderNode,
  ClassCondition,
  ComputedVar,
  XCLDocument,
} from './types.js';

// ============================================================================
// Minimal XML parser
// ============================================================================

interface ParsedAttr {
  name: string;
  value: string;
}

interface ParsedElement {
  tag: string;
  attrs: ParsedAttr[];
  children: ParsedNode[];
  selfClosing: boolean;
}

type ParsedNode = ParsedElement | string;

function unescapeAttr(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/** Parse attribute string into key-value pairs. */
function parseAttrs(attrStr: string): ParsedAttr[] {
  const attrs: ParsedAttr[] = [];
  // Match: name="value" (value may contain escaped quotes)
  const re = /([^\s=]+)="((?:[^"\\]|\\.)*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attrStr)) !== null) {
    if (m[1] !== undefined && m[2] !== undefined) {
      attrs.push({ name: m[1], value: unescapeAttr(m[2]) });
    }
  }
  return attrs;
}

/** Find the matching close-tag index for an open tag starting at `start`. */
function findClose(src: string, tag: string, start: number): number {
  let depth = 1;
  let i = start;
  // Escape regex special chars in tag name (e.g. '$frag' contains '$')
  const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const openPat = new RegExp(`<${escapedTag}[\\s/>]`, 'g');
  const closePat = new RegExp(`</${escapedTag}>`, 'g');

  openPat.lastIndex = i;
  closePat.lastIndex = i;

  while (depth > 0) {
    openPat.lastIndex = i;
    closePat.lastIndex = i;
    const nextOpen = openPat.exec(src);
    const nextClose = closePat.exec(src);

    if (!nextClose) break;

    if (nextOpen && nextOpen.index < nextClose.index) {
      // Check it's not self-closing by peeking back at the tag content
      const tagEnd = src.indexOf('>', nextOpen.index);
      if (tagEnd !== -1 && src[tagEnd - 1] !== '/') {
        depth++;
      }
      i = nextOpen.index + 1;
    } else {
      depth--;
      if (depth === 0) return nextClose.index;
      i = nextClose.index + 1;
    }
  }
  return -1;
}

/** Parse XML source into a tree of ParsedNode. */
function parseXML(src: string): ParsedNode[] {
  const nodes: ParsedNode[] = [];
  let i = 0;
  const trimmed = src.trim();

  while (i < trimmed.length) {
    // Skip whitespace
    while (i < trimmed.length && /\s/.test(trimmed[i] ?? '')) i++;
    if (i >= trimmed.length) break;

    if (trimmed[i] === '<') {
      // Comment?
      if (trimmed.startsWith('<!--', i)) {
        const end = trimmed.indexOf('-->', i);
        i = end === -1 ? trimmed.length : end + 3;
        continue;
      }

      // Find end of opening tag
      let tagEnd = i + 1;
      let inStr = false;
      let strChar = '';
      while (tagEnd < trimmed.length) {
        const ch = trimmed[tagEnd] ?? '';
        if (inStr) {
          if (ch === strChar) inStr = false;
        } else {
          if (ch === '"' || ch === "'") {
            inStr = true;
            strChar = ch;
          } else if (ch === '>') {
            break;
          }
        }
        tagEnd++;
      }
      // tagEnd now points to '>'
      const tagContent = trimmed.slice(i + 1, tagEnd); // content between < and >
      const selfClosing = tagContent.endsWith('/');
      const inner = selfClosing ? tagContent.slice(0, -1).trim() : tagContent.trim();

      // Extract tag name
      const spaceIdx = inner.search(/[\s/]/);
      const tag = spaceIdx === -1 ? inner : inner.slice(0, spaceIdx);
      const attrStr = spaceIdx === -1 ? '' : inner.slice(spaceIdx + 1);

      const attrs = parseAttrs(attrStr);

      if (selfClosing) {
        nodes.push({ tag, attrs, children: [], selfClosing: true });
        i = tagEnd + 1;
      } else {
        // Find matching close tag
        const closeIdx = findClose(trimmed, tag, tagEnd + 1);
        let children: ParsedNode[] = [];
        if (closeIdx !== -1) {
          const childSrc = trimmed.slice(tagEnd + 1, closeIdx);
          children = parseXML(childSrc);
          i = closeIdx + `</${tag}>`.length;
        } else {
          i = tagEnd + 1;
        }
        nodes.push({ tag, attrs, children, selfClosing: false });
      }
    } else {
      // Text node
      let j = i;
      while (j < trimmed.length && trimmed[j] !== '<') j++;
      const text = trimmed.slice(i, j).trim();
      if (text) nodes.push(text);
      i = j;
    }
  }

  return nodes;
}

function attrsToMap(attrs: ParsedAttr[]): Record<string, string> {
  const m: Record<string, string> = {};
  for (const a of attrs) m[a.name] = a.value;
  return m;
}

// ============================================================================
// Prop type decoding
// ============================================================================

function decodePropType(encoded: string): {
  type: PropType;
  optional: boolean;
  defaultValue?: string | number | boolean;
} {
  let rest = encoded;
  let defaultValue: string | number | boolean | undefined;
  let optional = false;

  // Extract default value (=xxx suffix, must come after type and ?)
  const eqIdx = rest.lastIndexOf('=');
  if (eqIdx !== -1) {
    const rawDefault = rest.slice(eqIdx + 1);
    rest = rest.slice(0, eqIdx);
    // Parse default value type
    if (rawDefault === 'true') defaultValue = true;
    else if (rawDefault === 'false') defaultValue = false;
    else if (rawDefault !== '' && !isNaN(Number(rawDefault))) defaultValue = Number(rawDefault);
    else defaultValue = rawDefault;
    optional = true; // having a default implies optional call-site
  }

  // Extract optional marker
  if (rest.endsWith('?')) {
    optional = true;
    rest = rest.slice(0, -1);
  }

  let type: PropType;
  switch (rest) {
    case 'str':
      type = 'string';
      break;
    case 'num':
      type = 'number';
      break;
    case 'bool':
      type = 'boolean';
      break;
    case 'node':
      type = 'ReactNode';
      break;
    case 'fn':
      type = '() => void';
      break;
    case 'elm':
      type = 'React.ElementType';
      break;
    default:
      // Union of string literals: "sm|md|lg" → "'sm' | 'md' | 'lg'"
      if (rest.includes('|')) {
        type = rest
          .split('|')
          .map((v) => `'${v}'`)
          .join(' | ');
      } else {
        // Unknown or passthrough type
        type = rest;
      }
  }

  return { type, optional, defaultValue };
}

// ============================================================================
// Props parsing
// ============================================================================

function parsePropsElement(el: ParsedElement): PropDef[] {
  return el.attrs.map((a) => {
    const { type, optional, defaultValue } = decodePropType(a.value);
    return { name: a.name, type, optional, defaultValue };
  });
}

// ============================================================================
// Render node parsing
// ============================================================================

function parseRenderNode(node: ParsedNode): RenderNode {
  if (typeof node === 'string') {
    return { tag: '$text', text: node };
  }

  const el = node;

  // slot
  if (el.tag === 'slot') {
    return { tag: '$slot' };
  }

  // fragment
  if (el.tag === '$frag') {
    const children = el.children
      .filter((c) => typeof c !== 'string' || (c as string).trim() !== '')
      .map(parseRenderNode);
    return { tag: '$frag', children };
  }

  const aMap = attrsToMap(el.attrs);

  let className: string | undefined;
  const classConditions: ClassCondition[] = [];
  const style: Record<string, string> = {};
  const events: Record<string, string> = {};
  const attrs: Record<string, string> = {};

  for (const [k, v] of Object.entries(aMap)) {
    if (k === 'cn') {
      className = v;
    } else if (k.startsWith('cn.')) {
      const prop = k.slice(3);
      // "default:cls1;destructive:cls2"
      const segments = v.split(';');
      for (const seg of segments) {
        const colonIdx = seg.indexOf(':');
        if (colonIdx !== -1) {
          const value = seg.slice(0, colonIdx).trim();
          const classes = seg.slice(colonIdx + 1).trim();
          if (value && classes) {
            classConditions.push({ prop, value, classes });
          }
        }
      }
    } else if (k === 'style') {
      // "padding:16px;margin:8px"
      const pairs = v.split(';');
      for (const pair of pairs) {
        const colonIdx = pair.indexOf(':');
        if (colonIdx !== -1) {
          const sk = pair.slice(0, colonIdx).trim();
          const sv = pair.slice(colonIdx + 1).trim();
          if (sk) style[sk] = sv;
        }
      }
    } else if (k.startsWith('on.')) {
      events[k.slice(3)] = v;
    } else {
      attrs[k] = v;
    }
  }

  const children = el.children
    .filter((c) => typeof c !== 'string' || (c as string).trim() !== '')
    .map(parseRenderNode);

  const result: RenderNode = { tag: el.tag };
  if (className) result.className = className;
  if (classConditions.length > 0) result.classConditions = classConditions;
  if (Object.keys(style).length > 0) result.style = style;
  if (Object.keys(events).length > 0) result.events = events;
  if (Object.keys(attrs).length > 0) result.attrs = attrs;
  if (children.length > 0) result.children = children;

  return result;
}

// ============================================================================
// Component parsing
// ============================================================================

function parseComponentElement(el: ParsedElement): ComponentDef {
  const aMap = attrsToMap(el.attrs);
  const name = aMap['n'] ?? 'UnnamedComponent';
  const exported = aMap['x'] === '1';

  let props: PropDef[] = [];
  let render: RenderNode = { tag: 'div' };
  const computedVars: ComputedVar[] = [];

  for (const child of el.children) {
    if (typeof child === 'string') continue;
    const c = child;

    if (c.tag === 'P') {
      props = parsePropsElement(c);
    } else if (c.tag === 'R') {
      // Collect non-whitespace children of <R>
      const renderChildren = c.children.filter(
        (rc) => typeof rc !== 'string' || (rc as string).trim() !== ''
      );
      if (renderChildren.length > 0) {
        const first = renderChildren[0];
        if (first !== undefined) {
          render = parseRenderNode(first);
        }
      }
    } else if (c.tag === 'V') {
      for (const a of c.attrs) {
        computedVars.push({ name: a.name, expression: a.value });
      }
    }
  }

  const def: ComponentDef = { name, exported, props, render };
  if (computedVars.length > 0) def.computedVars = computedVars;
  return def;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Deserialize an XCL string into an array of ComponentDefs.
 * Throws on malformed input.
 */
export function deserialize(xcl: string): ComponentDef[] {
  const nodes = parseXML(xcl.trim());
  const xclEl = nodes.find((n): n is ParsedElement => typeof n !== 'string' && n.tag === 'xcl');
  if (!xclEl) throw new Error('XCL parse error: missing <xcl> root element');

  const components: ComponentDef[] = [];
  for (const child of xclEl.children) {
    if (typeof child === 'string') continue;
    if (child.tag === 'C') {
      components.push(parseComponentElement(child));
    }
  }
  return components;
}

/**
 * Deserialize an XCL string into a full XCLDocument.
 */
export function deserializeDocument(xcl: string): XCLDocument {
  const nodes = parseXML(xcl.trim());
  const xclEl = nodes.find((n): n is ParsedElement => typeof n !== 'string' && n.tag === 'xcl');
  if (!xclEl) throw new Error('XCL parse error: missing <xcl> root element');

  const vAttr = xclEl.attrs.find((a) => a.name === 'v');
  const version = vAttr?.value ?? '1';

  const components: ComponentDef[] = [];
  for (const child of xclEl.children) {
    if (typeof child === 'string') continue;
    if (child.tag === 'C') {
      components.push(parseComponentElement(child));
    }
  }
  return { version, components };
}
