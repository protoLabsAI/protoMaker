/**
 * types.ts
 *
 * Core type definitions for the component registry.
 *
 * The registry maps component names to rich metadata including JSON Schema
 * for props, atomic design categories, framework targets, and .pen source
 * references.
 */

// ============================================================================
// Atomic Design Hierarchy
// ============================================================================

/**
 * Atomic design categories for component classification.
 *
 * - atom:      Smallest building blocks (Button, Input, Icon, Badge)
 * - molecule:  Simple groups of atoms (FormField, SearchBar, Card)
 * - organism:  Complex UI sections (Navbar, Sidebar, DataTable)
 * - template:  Page-level layouts without real content
 * - page:      Full page instances with real content
 * - unknown:   Not yet classified
 */
export type AtomicCategory = 'atom' | 'molecule' | 'organism' | 'template' | 'page' | 'unknown';

// ============================================================================
// Framework Targets
// ============================================================================

/** Supported output framework targets. */
export type FrameworkTarget = 'react' | 'html' | 'vue' | 'svelte';

// ============================================================================
// JSON Schema Types
// ============================================================================

/** A JSON Schema property definition (draft-07 compatible subset). */
export interface JSONSchemaProperty {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null';
  description?: string;
  default?: unknown;
  enum?: string[];
  items?: JSONSchemaProperty;
  properties?: Record<string, JSONSchemaProperty>;
  required?: string[];
}

/** JSON Schema object for a component's props interface. */
export interface ComponentSchema {
  $schema: string;
  type: 'object';
  title: string;
  description?: string;
  properties: Record<string, JSONSchemaProperty>;
  required?: string[];
}

// ============================================================================
// Prop Definitions
// ============================================================================

/**
 * A single prop definition extracted from a component's TypeScript interface.
 * Used for both registry metadata and JSON Schema generation.
 */
export interface PropDefinition {
  /** Prop name in camelCase (e.g. 'primaryColor'). */
  propName: string;
  /** TypeScript type string (e.g. 'string', 'boolean', 'number'). */
  tsType: string;
  /** The CSS custom property this maps to (e.g. '--primary-color'), if any. */
  cssVariable?: string;
  /** Whether the prop is required (false = optional). */
  required: boolean;
  /** Human-readable description for docs. */
  description?: string;
}

// ============================================================================
// Registry Entry
// ============================================================================

/**
 * A complete registry entry for a single component.
 *
 * Captures everything needed to discover, import, and use a generated
 * component: schema, props, design system metadata, and source references.
 */
export interface ComponentEntry {
  /** Component name in PascalCase (e.g. 'Button', 'HeroCard'). */
  name: string;

  /** Atomic design category for hierarchical browsing. */
  category: AtomicCategory;

  /** Searchable tags (e.g. ['interactive', 'form', 'navigation']). */
  tags: string[];

  /** Import path relative to the consuming project's root or absolute. */
  importPath: string;

  /** Framework targets this component has been generated for. */
  targets: FrameworkTarget[];

  /** JSON Schema describing the component's props. */
  schema: ComponentSchema;

  /** Structured prop definitions (source of truth for schema generation). */
  props: PropDefinition[];

  /** ID of the source .pen frame this component was generated from. */
  penSourceId?: string;

  /** Generated source filename (e.g. 'Button.tsx'). */
  filename?: string;

  /** ISO-8601 timestamp of when this entry was added to the registry. */
  registeredAt: string;
}

// ============================================================================
// Search
// ============================================================================

/**
 * Options for searching the registry.
 * All fields are optional and ANDed together when multiple are provided.
 */
export interface RegistrySearchOptions {
  /** Partial or full component name match (case-insensitive). */
  name?: string;

  /** Filter to a specific atomic design category. */
  category?: AtomicCategory;

  /** Must include ALL of these tags. */
  tags?: string[];

  /** Filter to components supporting this framework target. */
  target?: FrameworkTarget;
}

// ============================================================================
// Auto-Populate Input
// ============================================================================

/**
 * A generated component file produced by the codegen package.
 * Matches the GeneratedFile shape from `@@PROJECT_NAME-codegen`.
 */
export interface GeneratedComponentFile {
  /** Output filename, e.g. 'Button.tsx'. */
  filename: string;

  /** PascalCase component name, e.g. 'Button'. */
  componentName: string;

  /** Full TSX source content. */
  content: string;

  /** Optional .pen frame ID this was generated from. */
  penSourceId?: string;
}

// ============================================================================
// Registry Events
// ============================================================================

/** Result returned by register() and registerMany(). */
export interface RegisterResult {
  /** Components successfully added. */
  registered: string[];
  /** Components skipped because they were already present. */
  skipped: string[];
}
