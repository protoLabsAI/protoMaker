/**
 * CodeMirror 6 language extension resolver.
 *
 * Maps file extensions to the appropriate CodeMirror language support.
 * Uses official @codemirror/lang-* packages where available, falls back to
 * @codemirror/legacy-modes via StreamLanguage for everything else.
 */

import { StreamLanguage } from '@codemirror/language';
import { javascript } from '@codemirror/lang-javascript';
import { css } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { python } from '@codemirror/lang-python';
import { xml } from '@codemirror/lang-xml';
import type { Extension } from '@codemirror/state';

// Lazy-loaded legacy modes to keep initial bundle small.
// Each is only imported when a file of that type is opened.
const legacyModeLoaders: Record<string, () => Promise<Extension>> = {
  shell: async () => {
    const { shell } = await import('@codemirror/legacy-modes/mode/shell');
    return StreamLanguage.define(shell);
  },
  yaml: async () => {
    const { yaml } = await import('@codemirror/legacy-modes/mode/yaml');
    return StreamLanguage.define(yaml);
  },
  toml: async () => {
    const { toml } = await import('@codemirror/legacy-modes/mode/toml');
    return StreamLanguage.define(toml);
  },
  dockerfile: async () => {
    const { dockerFile } = await import('@codemirror/legacy-modes/mode/dockerfile');
    return StreamLanguage.define(dockerFile);
  },
  sql: async () => {
    const { standardSQL } = await import('@codemirror/legacy-modes/mode/sql');
    return StreamLanguage.define(standardSQL);
  },
  go: async () => {
    const { go } = await import('@codemirror/legacy-modes/mode/go');
    return StreamLanguage.define(go);
  },
  rust: async () => {
    const { rust } = await import('@codemirror/legacy-modes/mode/rust');
    return StreamLanguage.define(rust);
  },
  ruby: async () => {
    const { ruby } = await import('@codemirror/legacy-modes/mode/ruby');
    return StreamLanguage.define(ruby);
  },
  swift: async () => {
    const { swift } = await import('@codemirror/legacy-modes/mode/swift');
    return StreamLanguage.define(swift);
  },
  clike: async () => {
    const { c } = await import('@codemirror/legacy-modes/mode/clike');
    return StreamLanguage.define(c);
  },
  cpp: async () => {
    const { cpp } = await import('@codemirror/legacy-modes/mode/clike');
    return StreamLanguage.define(cpp);
  },
  java: async () => {
    const { java } = await import('@codemirror/legacy-modes/mode/clike');
    return StreamLanguage.define(java);
  },
  php: async () => {
    // PHP is closest to the Java/C# family in clike
    const { kotlin } = await import('@codemirror/legacy-modes/mode/clike');
    return StreamLanguage.define(kotlin);
  },
  lua: async () => {
    const { lua } = await import('@codemirror/legacy-modes/mode/lua');
    return StreamLanguage.define(lua);
  },
  perl: async () => {
    const { perl } = await import('@codemirror/legacy-modes/mode/perl');
    return StreamLanguage.define(perl);
  },
  diff: async () => {
    const { diff } = await import('@codemirror/legacy-modes/mode/diff');
    return StreamLanguage.define(diff);
  },
  powershell: async () => {
    const { powerShell } = await import('@codemirror/legacy-modes/mode/powershell');
    return StreamLanguage.define(powerShell);
  },
  r: async () => {
    const { r } = await import('@codemirror/legacy-modes/mode/r');
    return StreamLanguage.define(r);
  },
  nginx: async () => {
    const { nginx } = await import('@codemirror/legacy-modes/mode/nginx');
    return StreamLanguage.define(nginx);
  },
  protobuf: async () => {
    const { protobuf } = await import('@codemirror/legacy-modes/mode/protobuf');
    return StreamLanguage.define(protobuf);
  },
};

// Cache resolved legacy modes so we don't re-import them
const resolvedLegacyModes = new Map<string, Extension>();

/** Extension-to-language key mapping */
const extensionMap: Record<string, string> = {
  // JavaScript / TypeScript (official packages)
  js: 'js-jsx',
  jsx: 'js-jsx',
  mjs: 'js-jsx',
  cjs: 'js-jsx',
  ts: 'ts',
  mts: 'ts',
  cts: 'ts',
  tsx: 'tsx',

  // Web (official packages)
  css: 'css',
  scss: 'css',
  less: 'css',
  json: 'json',
  jsonc: 'json',
  md: 'markdown',
  mdx: 'markdown',
  markdown: 'markdown',
  xml: 'xml',
  svg: 'xml',
  xsl: 'xml',
  xslt: 'xml',
  html: 'xml',
  htm: 'xml',

  // Python (official package)
  py: 'python',
  pyw: 'python',

  // Shell (legacy mode)
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  fish: 'shell',

  // Config languages (legacy mode)
  yml: 'yaml',
  yaml: 'yaml',
  toml: 'toml',

  // Dockerfile
  dockerfile: 'dockerfile',

  // SQL
  sql: 'sql',

  // Go
  go: 'go',

  // Rust
  rs: 'rust',

  // Ruby
  rb: 'ruby',
  rake: 'ruby',
  gemspec: 'ruby',

  // Swift
  swift: 'swift',

  // C / C++
  c: 'clike',
  h: 'clike',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  hxx: 'cpp',

  // Java
  java: 'java',

  // PHP
  php: 'php',

  // Lua
  lua: 'lua',

  // Perl
  pl: 'perl',
  pm: 'perl',

  // Diff / Patch
  diff: 'diff',
  patch: 'diff',

  // PowerShell
  ps1: 'powershell',
  psm1: 'powershell',

  // R
  r: 'r',

  // Nginx
  conf: 'nginx',

  // Protobuf
  proto: 'protobuf',
};

/** Map of special filenames to language keys (e.g. Dockerfile has no extension) */
const filenameMap: Record<string, string> = {
  Dockerfile: 'dockerfile',
  Makefile: 'shell',
  Jenkinsfile: 'java',
  '.gitignore': 'shell',
  '.env': 'shell',
  '.bashrc': 'shell',
  '.zshrc': 'shell',
};

/**
 * Resolve the CodeMirror language extension for a given file name.
 * Returns `null` for unknown/unsupported file types.
 *
 * Official language packages are returned synchronously.
 * Legacy modes are lazy-loaded and cached.
 */
export function getLanguageExtension(fileName: string): Extension | null {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  const baseName = fileName.split('/').pop() ?? fileName;
  const langKey = filenameMap[baseName] ?? extensionMap[ext];

  if (!langKey) return null;

  // Official packages (synchronous)
  switch (langKey) {
    case 'js-jsx':
      return javascript({ jsx: true });
    case 'ts':
      return javascript({ typescript: true });
    case 'tsx':
      return javascript({ typescript: true, jsx: true });
    case 'css':
      return css();
    case 'json':
      return json();
    case 'markdown':
      return markdown();
    case 'python':
      return python();
    case 'xml':
      return xml();
  }

  // Check if already resolved from legacy mode cache
  const cached = resolvedLegacyModes.get(langKey);
  if (cached) return cached;

  // Legacy modes need async loading — return null on first call, cache for next
  const loader = legacyModeLoaders[langKey];
  if (loader) {
    // Fire-and-forget: load the mode, cache it, but return null for this render.
    // The next time the file is opened or the editor re-renders, the cached mode
    // will be available synchronously.
    void loader().then((ext) => resolvedLegacyModes.set(langKey, ext));
  }

  return null;
}

/**
 * Async version that waits for legacy mode loading.
 * Useful in contexts where you can await (e.g., effect hooks).
 */
export async function getLanguageExtensionAsync(fileName: string): Promise<Extension | null> {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  const baseName = fileName.split('/').pop() ?? fileName;
  const langKey = filenameMap[baseName] ?? extensionMap[ext];

  if (!langKey) return null;

  // Official packages
  switch (langKey) {
    case 'js-jsx':
      return javascript({ jsx: true });
    case 'ts':
      return javascript({ typescript: true });
    case 'tsx':
      return javascript({ typescript: true, jsx: true });
    case 'css':
      return css();
    case 'json':
      return json();
    case 'markdown':
      return markdown();
    case 'python':
      return python();
    case 'xml':
      return xml();
  }

  // Check cache
  const cached = resolvedLegacyModes.get(langKey);
  if (cached) return cached;

  // Load and cache legacy mode
  const loader = legacyModeLoaders[langKey];
  if (loader) {
    const loaded = await loader();
    resolvedLegacyModes.set(langKey, loaded);
    return loaded;
  }

  return null;
}
