/**
 * registry.ts
 *
 * Type-safe component registry for the design system starter kit.
 *
 * Adapted from proto2's ComponentRegistry pattern. Provides:
 *   - register / registerMany      — add components with full metadata
 *   - get / has / list             — basic retrieval
 *   - search                       — filter by name, category, tags, target
 *   - populateFromGenerated        — auto-populate from codegen output
 *   - toJSON / fromJSON            — serialise/restore the registry
 *
 * The registry is entirely in-memory; persistence is left to the caller
 * (write toJSON() to disk, load with fromJSON() on startup).
 *
 * Zero external dependencies.
 */

import type {
  AtomicCategory,
  ComponentEntry,
  GeneratedComponentFile,
  RegisterResult,
  RegistrySearchOptions,
} from './types.js';
import { extractPropsFromSource, generateSchema } from './schema-generator.js';

// ============================================================================
// Category inference
// ============================================================================

/**
 * Infer an atomic design category from a component name using common naming
 * conventions.  Returns 'unknown' if no convention matches.
 *
 * Rules (first match wins):
 *   - Name ends with 'Page'          → page
 *   - Name ends with 'Template' / 'Layout' → template
 *   - Name ends with 'Section' / 'Panel' / 'Sidebar' / 'Navbar' / 'Header' /
 *     'Footer' / 'Hero' / 'Modal' / 'Dialog' / 'Drawer' / 'Table' → organism
 *   - Name ends with 'Card' / 'Form' / 'Group' / 'Row' / 'Item' / 'List' /
 *     'Menu' / 'Dropdown' / 'Tooltip' / 'Popover' / 'Banner' / 'Alert' → molecule
 *   - Everything else                → atom
 */
export function inferCategory(name: string): AtomicCategory {
  if (/Page$/.test(name)) return 'page';
  if (/Template$|Layout$/.test(name)) return 'template';
  if (
    /Section$|Panel$|Sidebar$|Navbar$|NavBar$|Header$|Footer$|Hero$|Modal$|Dialog$|Drawer$|DataTable$|Table$/.test(
      name
    )
  )
    return 'organism';
  if (
    /Card$|Form$|Group$|Row$|Item$|List$|Menu$|Dropdown$|Tooltip$|Popover$|Banner$|Alert$|SearchBar$|Breadcrumb$/.test(
      name
    )
  )
    return 'molecule';
  if (
    /Button$|Input$|Icon$|Badge$|Tag$|Avatar$|Chip$|Checkbox$|Radio$|Toggle$|Switch$|Spinner$|Loader$|Skeleton$|Divider$|Link$|Label$/.test(
      name
    )
  )
    return 'atom';
  return 'atom'; // Default to atom for unrecognised small components
}

/**
 * Infer tags from a component name.  Returns an empty array if nothing is
 * recognisable — callers can always add extra tags via the entry options.
 */
function inferTags(name: string): string[] {
  const tags: string[] = [];
  if (/Button|Toggle|Switch|Checkbox|Radio/.test(name)) tags.push('interactive');
  if (/Input|Textarea|Select|Form|Field/.test(name)) tags.push('form');
  if (/Nav|Menu|Breadcrumb|Sidebar|Header|Footer/.test(name)) tags.push('navigation');
  if (/Card|Panel|Section|Banner|Hero/.test(name)) tags.push('layout');
  if (/Icon|Badge|Avatar|Chip|Tag/.test(name)) tags.push('display');
  if (/Modal|Dialog|Drawer|Tooltip|Popover|Alert/.test(name)) tags.push('overlay');
  if (/Table|List|Row|Item|DataTable/.test(name)) tags.push('data');
  if (/Spinner|Loader|Skeleton/.test(name)) tags.push('feedback');
  return tags;
}

// ============================================================================
// ComponentRegistry
// ============================================================================

export class ComponentRegistry {
  /** Internal store: component name → entry. */
  private readonly _entries = new Map<string, ComponentEntry>();

  // --------------------------------------------------------------------------
  // Single-entry registration
  // --------------------------------------------------------------------------

  /**
   * Register a single component entry.
   *
   * If an entry with the same name already exists, registration is skipped
   * unless `overwrite: true` is passed in options.
   *
   * @returns `true` if the component was added, `false` if it was skipped.
   */
  register(
    entry: Omit<ComponentEntry, 'registeredAt'>,
    options: { overwrite?: boolean } = {}
  ): boolean {
    if (this._entries.has(entry.name) && !options.overwrite) {
      return false;
    }
    this._entries.set(entry.name, {
      ...entry,
      registeredAt: new Date().toISOString(),
    });
    return true;
  }

  // --------------------------------------------------------------------------
  // Bulk registration
  // --------------------------------------------------------------------------

  /**
   * Register multiple entries at once.
   *
   * @returns A `RegisterResult` listing which names were registered and which
   *          were skipped.
   */
  registerMany(
    entries: Array<Omit<ComponentEntry, 'registeredAt'>>,
    options: { overwrite?: boolean } = {}
  ): RegisterResult {
    const result: RegisterResult = { registered: [], skipped: [] };
    for (const entry of entries) {
      if (this.register(entry, options)) {
        result.registered.push(entry.name);
      } else {
        result.skipped.push(entry.name);
      }
    }
    return result;
  }

  // --------------------------------------------------------------------------
  // Retrieval
  // --------------------------------------------------------------------------

  /** Returns `true` if a component with the given name is registered. */
  has(name: string): boolean {
    return this._entries.has(name);
  }

  /** Retrieve a component entry by name, or `undefined` if not found. */
  get(name: string): ComponentEntry | undefined {
    return this._entries.get(name);
  }

  /** Return all registered component entries as an array. */
  list(): ComponentEntry[] {
    return Array.from(this._entries.values());
  }

  /** Return the total number of registered components. */
  get size(): number {
    return this._entries.size;
  }

  // --------------------------------------------------------------------------
  // Search
  // --------------------------------------------------------------------------

  /**
   * Search the registry by name, category, tags, and/or framework target.
   *
   * All provided criteria are ANDed: a component must satisfy every criterion
   * to appear in results.
   *
   * @param options Search criteria (all optional).
   * @returns       Matching entries sorted alphabetically by name.
   */
  search(options: RegistrySearchOptions): ComponentEntry[] {
    const results: ComponentEntry[] = [];

    for (const entry of this._entries.values()) {
      if (!this._matchesSearch(entry, options)) continue;
      results.push(entry);
    }

    return results.sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Find all components in a given atomic design category. */
  byCategory(category: AtomicCategory): ComponentEntry[] {
    return this.search({ category });
  }

  /** Find components that include all of the given tags. */
  byTags(tags: string[]): ComponentEntry[] {
    return this.search({ tags });
  }

  // --------------------------------------------------------------------------
  // Auto-populate from codegen output
  // --------------------------------------------------------------------------

  /**
   * Auto-populate the registry from an array of generated component files
   * produced by the codegen package's `generateFromDocument()` function.
   *
   * For each file the method will:
   *   1. Parse props from the TSX source using `extractPropsFromSource()`.
   *   2. Generate a JSON Schema for those props.
   *   3. Infer the atomic category and tags from the component name.
   *   4. Register the entry (skipping duplicates unless `overwrite` is set).
   *
   * @param files      Array of generated component files.
   * @param options    `importBasePath` — import prefix to prepend to filenames
   *                   (default `'./components/'`).
   *                   `overwrite` — re-register duplicates (default `false`).
   * @returns          A `RegisterResult` listing registered / skipped names.
   */
  populateFromGenerated(
    files: GeneratedComponentFile[],
    options: {
      importBasePath?: string;
      overwrite?: boolean;
    } = {}
  ): RegisterResult {
    const importBase = options.importBasePath ?? './components/';
    const result: RegisterResult = { registered: [], skipped: [] };

    for (const file of files) {
      const { componentName, content, filename, penSourceId } = file;
      if (!componentName) continue;

      const props = extractPropsFromSource(content, componentName);
      const schema = generateSchema(componentName, props);
      const category = inferCategory(componentName);
      const tags = inferTags(componentName);

      // Build import path: base + filename without extension
      const stem = filename.replace(/\.[^.]+$/, '');
      const importPath = `${importBase}${stem}`;

      const entry: Omit<ComponentEntry, 'registeredAt'> = {
        name: componentName,
        category,
        tags,
        importPath,
        targets: ['react'],
        schema,
        props,
        filename,
        penSourceId,
      };

      if (this.register(entry, { overwrite: options.overwrite })) {
        result.registered.push(componentName);
      } else {
        result.skipped.push(componentName);
      }
    }

    return result;
  }

  // --------------------------------------------------------------------------
  // Serialisation
  // --------------------------------------------------------------------------

  /**
   * Serialise the entire registry to a plain JSON-compatible object.
   * Use `fromJSON()` to restore a registry from this snapshot.
   */
  toJSON(): { components: ComponentEntry[] } {
    return { components: this.list() };
  }

  /**
   * Restore (merge) entries from a previously serialised registry snapshot.
   *
   * Existing entries are NOT overwritten unless `overwrite: true` is passed.
   *
   * @param data     The JSON object returned by `toJSON()`.
   * @param options  `overwrite` — re-register existing entries (default `false`).
   */
  fromJSON(
    data: { components: ComponentEntry[] },
    options: { overwrite?: boolean } = {}
  ): RegisterResult {
    return this.registerMany(data.components, options);
  }

  // --------------------------------------------------------------------------
  // Internal helpers
  // --------------------------------------------------------------------------

  private _matchesSearch(entry: ComponentEntry, options: RegistrySearchOptions): boolean {
    if (
      options.name !== undefined &&
      !entry.name.toLowerCase().includes(options.name.toLowerCase())
    ) {
      return false;
    }
    if (options.category !== undefined && entry.category !== options.category) {
      return false;
    }
    if (options.tags !== undefined && options.tags.length > 0) {
      for (const tag of options.tags) {
        if (!entry.tags.includes(tag)) return false;
      }
    }
    if (options.target !== undefined && !entry.targets.includes(options.target)) {
      return false;
    }
    return true;
  }
}

// ============================================================================
// Default singleton export
// ============================================================================

/**
 * Default shared registry instance.
 *
 * For projects with a single design system, import and use this singleton
 * directly.  For multi-tenant or test scenarios, instantiate `ComponentRegistry`
 * directly to get isolated instances.
 */
export const registry = new ComponentRegistry();
