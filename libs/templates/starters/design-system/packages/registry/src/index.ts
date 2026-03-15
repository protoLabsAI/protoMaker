/**
 * Component Registry
 *
 * In-memory store for design system component definitions.
 * Provides a simple Map-backed registry with CRUD operations.
 *
 * Note: ComponentDef is inlined here so this package is independent
 * of the xcl package.
 */

// ---------------------------------------------------------------------------
// Inline type definitions (mirrored from xcl/src/types.ts)
// ---------------------------------------------------------------------------

/** A single prop on a component. */
export interface PropDef {
  name: string;
  type: 'string' | 'boolean' | 'number' | 'enum';
  required: boolean;
  default?: string;
  values?: string[];
  description?: string;
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
  name: string;
  baseClasses: string;
  conditionals: ConditionalClass[];
  props: PropDef[];
  children?: string;
  description?: string;
}

// ---------------------------------------------------------------------------
// ComponentRegistry
// ---------------------------------------------------------------------------

/**
 * In-memory registry for `ComponentDef` objects.
 * Components are keyed by their `name` property (case-sensitive).
 */
export class ComponentRegistry {
  private readonly store = new Map<string, ComponentDef>();

  /**
   * Register a component. If a component with the same name already exists
   * it will be overwritten.
   */
  register(component: ComponentDef): void {
    this.store.set(component.name, component);
  }

  /** Retrieve a component by name. Returns `undefined` if not found. */
  get(name: string): ComponentDef | undefined {
    return this.store.get(name);
  }

  /** Return all registered components as an array. */
  list(): ComponentDef[] {
    return Array.from(this.store.values());
  }

  /**
   * Remove a component by name.
   * @returns `true` if the component existed and was removed, `false` otherwise.
   */
  remove(name: string): boolean {
    return this.store.delete(name);
  }

  /** Check whether a component with the given name is registered. */
  has(name: string): boolean {
    return this.store.has(name);
  }

  /** Remove all registered components. */
  clear(): void {
    this.store.clear();
  }

  /** The number of components currently registered. */
  get size(): number {
    return this.store.size;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a new, empty `ComponentRegistry`.
 *
 * @example
 * ```ts
 * const registry = createRegistry();
 * registry.register({ name: 'Button', baseClasses: 'btn', props: [], conditionals: [] });
 * registry.list(); // → [{ name: 'Button', … }]
 * ```
 */
export function createRegistry(): ComponentRegistry {
  return new ComponentRegistry();
}
