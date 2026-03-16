/**
 * XCL Core Types
 *
 * ComponentDef is the canonical in-memory representation of a design system
 * component. It can be serialized to XCL (XML) for storage and deserialized
 * back, or compiled to TSX for use in React projects.
 */

/** A single prop on a component. */
export interface PropDef {
  name: string;
  type: 'string' | 'boolean' | 'number' | 'enum';
  required: boolean;
  default?: string;
  /** Possible values for enum props. */
  values?: string[];
  /** Description for documentation. */
  description?: string;
  /** If set, this prop overrides a CSS variable (e.g. '--btn-color'). */
  cssVariable?: string;
}

/** A CSS class conditional binding: class applied when prop equals value. */
export interface ConditionalClass {
  prop: string;
  value: string;
  classes: string;
}

/** The canonical in-memory representation of a component. */
export interface ComponentDef {
  /** Component name in PascalCase (e.g. 'Button'). */
  name: string;
  /** Base CSS classes always applied. */
  baseClasses: string;
  /** Conditional class bindings per prop value. */
  conditionals: ConditionalClass[];
  /** Prop definitions. */
  props: PropDef[];
  /** Inner HTML / slot content. */
  children?: string;
  /** Human-readable description. */
  description?: string;
}
