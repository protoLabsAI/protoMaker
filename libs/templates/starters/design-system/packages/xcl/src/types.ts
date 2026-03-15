/**
 * types.ts
 *
 * XCL (XML Component Language) type definitions.
 *
 * XCL is a compact XML format for representing React components that achieves
 * 80–96% token reduction vs raw TSX, enabling efficient LLM component operations.
 *
 * Zero external dependencies — fully self-contained.
 */

// ============================================================================
// Prop Definitions
// ============================================================================

/**
 * Canonical prop type strings (after decoding from XCL shorthand).
 *
 * In XCL wire format these are abbreviated:
 *   str  → 'string'
 *   num  → 'number'
 *   bool → 'boolean'
 *   node → 'ReactNode'
 *   fn   → '() => void'
 *   elm  → 'React.ElementType'
 *   'sm|md|lg' → string union literal
 */
export type PropType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'ReactNode'
  | '() => void'
  | 'React.ElementType'
  | string; // for union literals: "'sm' | 'md' | 'lg'"

export interface PropDef {
  name: string;
  type: PropType;
  optional: boolean;
  defaultValue?: string | number | boolean;
}

// ============================================================================
// Render Node
// ============================================================================

/**
 * A conditional className mapping.
 *
 * When prop is '$' it means a passthrough className prop (spread).
 */
export interface ClassCondition {
  /** Prop name driving the condition. Use '$' for passthrough className spread. */
  prop: string;
  /** Prop value that activates these classes, or '*' for always-on spread. */
  value: string;
  /** Space-separated Tailwind classes to apply. */
  classes: string;
}

/**
 * A node in the render tree.
 *
 * Special tag values:
 *   '$slot'  → {children} JSX expression
 *   '$text'  → raw text / JSX expression content
 *   '$frag'  → React.Fragment <>...</>
 */
export interface RenderNode {
  /** HTML tag, React component name, or '$slot' / '$text' / '$frag'. */
  tag: string;

  /** Text content (only for '$text' nodes). */
  text?: string;

  /** Static base className string. */
  className?: string;

  /**
   * Conditional class mappings.
   * prop='variant', value='default' means: when variant==='default' apply classes.
   * prop='disabled', value='true' means: when disabled===true apply classes.
   * prop='$', value='*' means: spread the className prop.
   */
  classConditions?: ClassCondition[];

  /** Inline style object. */
  style?: Record<string, string>;

  /** Static / dynamic attributes. Values may contain {expr} interpolations. */
  attrs?: Record<string, string>;

  /**
   * Event handler mappings.
   * Key is event name without 'on' prefix (e.g. 'click' → onClick).
   * Value is the prop/handler name.
   */
  events?: Record<string, string>;

  /** Child nodes. */
  children?: RenderNode[];
}

// ============================================================================
// Computed Variables
// ============================================================================

export interface ComputedVar {
  name: string;
  /** JavaScript expression (may reference props). */
  expression: string;
}

// ============================================================================
// Component Definition (canonical IR)
// ============================================================================

export interface ComponentDef {
  /** PascalCase component name. */
  name: string;
  /** Whether to emit an `export` keyword. */
  exported: boolean;
  props: PropDef[];
  render: RenderNode;
  /** Optional derived values computed at the top of the function body. */
  computedVars?: ComputedVar[];
}

// ============================================================================
// XCL Document
// ============================================================================

export interface XCLDocument {
  version: string;
  components: ComponentDef[];
}

// ============================================================================
// Metrics
// ============================================================================

export interface XCLMetrics {
  /** Rough token estimate of the original TSX. */
  tsxTokens: number;
  /** Rough token estimate of the XCL representation. */
  xclTokens: number;
  /** Percentage of tokens saved: (1 - xclTokens/tsxTokens) * 100 */
  reductionPercent: number;
}

// ============================================================================
// Validation Result
// ============================================================================

export interface RoundTripResult {
  /** Whether the original and round-tripped component definitions are equivalent. */
  fidelity: boolean;
  /** Human-readable diff summary if fidelity is false. */
  diff?: string;
}
