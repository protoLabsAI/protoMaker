/**
 * CodeEditor — Full-featured code editor powered by CodeMirror 6.
 *
 * Features:
 * - Syntax highlighting for .ts, .tsx, .js, .jsx, .json, .md, .css, .py and more
 * - Configurable font family / size (read from app-store, persisted to localStorage)
 * - Binary file detection: shows a warning instead of the editor
 * - Auto-save with 1-second debounce writing to /api/fs/write
 */

import { useMemo, useEffect, useRef, useCallback } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { css } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { python } from '@codemirror/lang-python';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { AlertTriangle } from 'lucide-react';
import { useAppStore } from '@/store/app-store';
import { apiPost } from '@/lib/api-fetch';
import type { FileEditorTab } from './use-file-editor-store';
import { useFileEditorStore } from './use-file-editor-store';

// ---------------------------------------------------------------------------
// Language detection
// ---------------------------------------------------------------------------

function getLanguageExtension(fileName: string): Extension | null {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  switch (ext) {
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
      return javascript({ jsx: true });
    case 'ts':
    case 'mts':
    case 'cts':
      return javascript({ typescript: true });
    case 'tsx':
      return javascript({ typescript: true, jsx: true });
    case 'css':
    case 'scss':
    case 'less':
      return css();
    case 'json':
    case 'jsonc':
      return json();
    case 'md':
    case 'mdx':
    case 'markdown':
      return markdown();
    case 'py':
    case 'pyw':
      return python();
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Binary file detection
// ---------------------------------------------------------------------------

const BINARY_EXTENSIONS = new Set([
  // Images
  'png',
  'jpg',
  'jpeg',
  'gif',
  'bmp',
  'ico',
  'webp',
  'tiff',
  'tif',
  'avif',
  'svg',
  // Archives
  'zip',
  'tar',
  'gz',
  'bz2',
  'rar',
  '7z',
  // Fonts
  'ttf',
  'otf',
  'woff',
  'woff2',
  'eot',
  // Native binaries
  'exe',
  'dll',
  'so',
  'dylib',
  'bin',
  // Office / PDF
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
]);

function isBinaryExtension(fileName: string): boolean {
  const parts = fileName.split('.');
  if (parts.length < 2) return false;
  return BINARY_EXTENSIONS.has(parts[parts.length - 1].toLowerCase());
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface CodeEditorProps {
  tab: FileEditorTab;
}

export function CodeEditor({ tab }: CodeEditorProps) {
  const { updateTabContent, markTabSaved } = useFileEditorStore();
  const { fileEditorFontFamily, fileEditorFontSize } = useAppStore();

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Auto-save (1 s debounce) ─────────────────────────────────────────────
  const scheduleAutoSave = useCallback(
    (filePath: string, content: string, tabId: string) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        try {
          const result = await apiPost<{ success: boolean; error?: string }>('/api/fs/write', {
            filePath,
            content,
          });
          if (result.success) {
            markTabSaved(tabId);
          }
        } catch {
          // Silently ignore — unsaved indicator remains visible
        }
      }, 1000);
    },
    [markTabSaved]
  );

  // Clear save timer when the component unmounts or tab changes
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [tab.id]);

  const handleChange = useCallback(
    (value: string) => {
      updateTabContent(tab.id, value);
      scheduleAutoSave(tab.filePath, value, tab.id);
    },
    [tab.id, tab.filePath, updateTabContent, scheduleAutoSave]
  );

  // ── Language extension ────────────────────────────────────────────────────
  const extensions = useMemo<Extension[]>(() => {
    const exts: Extension[] = [];
    const lang = getLanguageExtension(tab.fileName);
    if (lang) exts.push(lang);
    exts.push(EditorView.lineWrapping);
    return exts;
  }, [tab.fileName]);

  // ── Font theme ────────────────────────────────────────────────────────────
  const fontTheme = useMemo(() => {
    const family =
      fileEditorFontFamily || 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace';
    const size = `${fileEditorFontSize}px`;
    return EditorView.theme({
      '&': { fontSize: size },
      '.cm-scroller': { fontFamily: family, fontSize: size, lineHeight: '1.6' },
      '.cm-content': { fontFamily: family },
    });
  }, [fileEditorFontFamily, fileEditorFontSize]);

  // ── Binary file warning ───────────────────────────────────────────────────
  if (tab.isBinary || isBinaryExtension(tab.fileName)) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <AlertTriangle className="h-10 w-10 text-amber-500" />
        <p className="text-sm font-medium">Binary file cannot be edited</p>
        <p className="max-w-xs text-center text-xs opacity-70">
          <span className="font-mono">{tab.fileName}</span> is a binary file (image, archive, or
          font) and cannot be displayed in the text editor.
        </p>
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────────
  if (tab.error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <AlertTriangle className="h-10 w-10 text-destructive" />
        <p className="text-sm font-medium">Failed to load file</p>
        <p className="max-w-xs text-center text-xs opacity-70">{tab.error}</p>
      </div>
    );
  }

  // ── Loading state ─────────────────────────────────────────────────────────
  if (tab.isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  // ── Editor ────────────────────────────────────────────────────────────────
  return (
    <CodeMirror
      value={tab.content}
      onChange={handleChange}
      extensions={[...extensions, fontTheme]}
      theme={oneDark}
      height="100%"
      style={{ height: '100%' }}
      className="h-full overflow-hidden"
      basicSetup={{
        lineNumbers: true,
        foldGutter: true,
        highlightActiveLine: true,
        highlightSelectionMatches: true,
        autocompletion: true,
        bracketMatching: true,
        indentOnInput: true,
        closeBrackets: true,
      }}
    />
  );
}
