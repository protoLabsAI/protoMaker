/**
 * Symbol Detector — parses changed files and extracts exported symbols
 * that could create cross-repo breaking changes.
 *
 * Detects:
 * - TypeScript interface/type definitions
 * - Class exports
 * - Function signatures
 * - REST endpoint handlers (Express-style route definitions)
 * - CLI argument definitions
 */

/** Category of exported symbol that may affect downstream consumers */
export type SymbolKind = 'interface' | 'type' | 'class' | 'function' | 'rest_endpoint' | 'cli_flag';

/** A detected exported symbol in a changed file */
export interface DetectedSymbol {
  /** Name of the exported symbol */
  name: string;
  /** Category of the symbol */
  kind: SymbolKind;
  /** Zero-based line number where the symbol was found */
  line: number;
  /** Raw text of the declaration */
  declaration: string;
}

/**
 * Parse a TypeScript/JavaScript source file and return all exported symbols
 * that may affect cross-repo consumers when changed.
 *
 * Uses regex-based heuristics — does not require a full AST parser.
 * Conservative approach: returns more results rather than fewer.
 *
 * @param source - Raw source text of the file
 * @returns Array of detected exported symbols
 */
export function detectExportedSymbols(source: string): DetectedSymbol[] {
  const symbols: DetectedSymbol[] = [];
  const lines = source.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // TypeScript interface export
    const interfaceMatch = line.match(/^export\s+(?:declare\s+)?interface\s+(\w+)/);
    if (interfaceMatch) {
      symbols.push({
        name: interfaceMatch[1],
        kind: 'interface',
        line: i,
        declaration: line.trim(),
      });
      continue;
    }

    // TypeScript type export
    const typeMatch = line.match(/^export\s+(?:declare\s+)?type\s+(\w+)/);
    if (typeMatch) {
      symbols.push({
        name: typeMatch[1],
        kind: 'type',
        line: i,
        declaration: line.trim(),
      });
      continue;
    }

    // Class export
    const classMatch = line.match(/^export\s+(?:declare\s+|abstract\s+)?class\s+(\w+)/);
    if (classMatch) {
      symbols.push({
        name: classMatch[1],
        kind: 'class',
        line: i,
        declaration: line.trim(),
      });
      continue;
    }

    // Function export (declaration or arrow)
    const funcMatch = line.match(/^export\s+(?:declare\s+|async\s+)?function\s+(\w+)/);
    if (funcMatch) {
      symbols.push({
        name: funcMatch[1],
        kind: 'function',
        line: i,
        declaration: line.trim(),
      });
      continue;
    }

    // Exported const arrow function
    const arrowMatch = line.match(
      /^export\s+(?:declare\s+)?const\s+(\w+)\s*(?::\s*\S+\s*)?=\s*(?:async\s+)?\(/
    );
    if (arrowMatch) {
      symbols.push({
        name: arrowMatch[1],
        kind: 'function',
        line: i,
        declaration: line.trim(),
      });
      continue;
    }

    // REST endpoint definitions (Express-style: router.get/post/put/delete/patch)
    const restMatch = line.match(
      /(?:router|app|server)\s*\.\s*(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/i
    );
    if (restMatch) {
      const method = restMatch[1].toUpperCase();
      const path = restMatch[2];
      symbols.push({
        name: `${method} ${path}`,
        kind: 'rest_endpoint',
        line: i,
        declaration: line.trim(),
      });
      continue;
    }

    // CLI flag definitions (commander/yargs style)
    const cliMatch = line.match(/\.(?:option|argument|command)\s*\(\s*['"`](--?[\w-]+)['"`]/);
    if (cliMatch) {
      symbols.push({
        name: cliMatch[1],
        kind: 'cli_flag',
        line: i,
        declaration: line.trim(),
      });
    }
  }

  return symbols;
}

/**
 * Compare two sets of detected symbols and return the names of symbols
 * that were added, removed, or modified (by declaration text change).
 */
export interface SymbolDiff {
  added: string[];
  removed: string[];
  modified: string[];
}

export function diffSymbols(before: DetectedSymbol[], after: DetectedSymbol[]): SymbolDiff {
  const beforeMap = new Map(before.map((s) => [s.name, s.declaration]));
  const afterMap = new Map(after.map((s) => [s.name, s.declaration]));

  const added: string[] = [];
  const removed: string[] = [];
  const modified: string[] = [];

  for (const [name, decl] of afterMap) {
    if (!beforeMap.has(name)) {
      added.push(name);
    } else if (beforeMap.get(name) !== decl) {
      modified.push(name);
    }
  }

  for (const name of beforeMap.keys()) {
    if (!afterMap.has(name)) {
      removed.push(name);
    }
  }

  return { added, removed, modified };
}
