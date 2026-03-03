/**
 * CodeEditor — Full-featured code editor powered by CodeMirror 6.
 *
 * Features:
 * - Syntax highlighting for 30+ languages via shared codemirror-languages utility
 * - Configurable font family / size (read from app-store, persisted to localStorage)
 * - Binary / too-large file detection: shows a warning instead of the editor
 * - Auto-save with configurable debounce writing to /api/fs/write
 * - Ctrl+S / Cmd+S explicit save
 * - Cursor position reporting
 * - Inline diff decorations (added/deleted lines from unified diff)
 */

import { useMemo, useEffect, useRef, useCallback, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { oneDark } from '@codemirror/theme-one-dark';
import {
  EditorView,
  keymap,
  Decoration,
  type DecorationSet,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view';
import { RangeSetBuilder, type Extension } from '@codemirror/state';
import { AlertTriangle, FileWarning } from 'lucide-react';
import { useAppStore } from '@/store/app-store';
import { apiPost } from '@/lib/api-fetch';
import { getLanguageExtension, getLanguageExtensionAsync } from '@/lib/codemirror-languages';
import { BINARY_EXTENSIONS, type FileEditorTab } from './use-file-editor-store';
import { useFileEditorStore } from './use-file-editor-store';

// ---------------------------------------------------------------------------
// Binary file detection (uses shared constant from store)
// ---------------------------------------------------------------------------

function isBinaryExtension(fileName: string): boolean {
  const parts = fileName.split('.');
  if (parts.length < 2) return false;
  return BINARY_EXTENSIONS.has(parts[parts.length - 1].toLowerCase());
}

// ---------------------------------------------------------------------------
// Diff decoration helpers
// ---------------------------------------------------------------------------

interface DiffHunk {
  /** 1-based line number in the new file */
  newStart: number;
  addedLines: number[];
  deletedText: string[];
}

function parseUnifiedDiff(diffText: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  const lines = diffText.split('\n');
  let currentHunk: DiffHunk | null = null;
  let newLineCounter = 0;

  for (const line of lines) {
    const hunkHeader = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkHeader) {
      if (currentHunk) hunks.push(currentHunk);
      const newStart = parseInt(hunkHeader[1], 10);
      currentHunk = { newStart, addedLines: [], deletedText: [] };
      newLineCounter = newStart;
      continue;
    }

    if (!currentHunk) continue;

    if (line.startsWith('+') && !line.startsWith('+++')) {
      currentHunk.addedLines.push(newLineCounter);
      newLineCounter++;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      currentHunk.deletedText.push(line.slice(1));
    } else if (!line.startsWith('\\')) {
      // Context line
      newLineCounter++;
    }
  }

  if (currentHunk) hunks.push(currentHunk);
  return hunks;
}

const addedLineDeco = Decoration.line({ class: 'cm-diff-added' });

class DeletedLinesWidget extends WidgetType {
  constructor(readonly lines: string[]) {
    super();
  }

  toDOM() {
    const wrapper = document.createElement('div');
    wrapper.className = 'cm-diff-deleted-block';
    for (const text of this.lines) {
      const line = document.createElement('div');
      line.className = 'cm-diff-deleted-line';
      line.textContent = text || ' ';
      wrapper.appendChild(line);
    }
    return wrapper;
  }

  eq(other: DeletedLinesWidget) {
    return (
      this.lines.length === other.lines.length && this.lines.every((l, i) => l === other.lines[i])
    );
  }
}

function createDiffExtension(diffContent: string): Extension {
  const hunks = parseUnifiedDiff(diffContent);

  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = this.buildDecorations(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = this.buildDecorations(update.view);
        }
      }

      buildDecorations(view: EditorView): DecorationSet {
        const builder = new RangeSetBuilder<Decoration>();
        const doc = view.state.doc;

        // Collect all decorations and sort by position
        const decorations: Array<{ from: number; to: number; deco: Decoration }> = [];

        for (const hunk of hunks) {
          // Added line highlights
          for (const lineNum of hunk.addedLines) {
            if (lineNum >= 1 && lineNum <= doc.lines) {
              const line = doc.line(lineNum);
              decorations.push({ from: line.from, to: line.from, deco: addedLineDeco });
            }
          }

          // Deleted lines widget (show before the first added line of the hunk)
          if (hunk.deletedText.length > 0) {
            const insertBeforeLine =
              hunk.addedLines.length > 0 ? hunk.addedLines[0] : hunk.newStart;
            if (insertBeforeLine >= 1 && insertBeforeLine <= doc.lines) {
              const line = doc.line(insertBeforeLine);
              decorations.push({
                from: line.from,
                to: line.from,
                deco: Decoration.widget({
                  widget: new DeletedLinesWidget(hunk.deletedText),
                  side: -1,
                }),
              });
            }
          }
        }

        // Sort by position for RangeSetBuilder
        decorations.sort((a, b) => a.from - b.from || a.to - b.to);
        for (const { from, to, deco } of decorations) {
          builder.add(from, to, deco);
        }

        return builder.finish();
      }
    },
    { decorations: (v) => v.decorations }
  );
}

const diffTheme = EditorView.theme({
  '.cm-diff-added': {
    backgroundColor: 'rgba(46, 160, 67, 0.15)',
  },
  '.cm-diff-deleted-block': {
    borderLeft: '3px solid rgba(248, 81, 73, 0.4)',
    paddingLeft: '4px',
    opacity: '0.7',
  },
  '.cm-diff-deleted-line': {
    backgroundColor: 'rgba(248, 81, 73, 0.1)',
    color: 'rgba(248, 81, 73, 0.8)',
    fontStyle: 'italic',
    textDecoration: 'line-through',
    whiteSpace: 'pre',
    fontFamily: 'inherit',
    fontSize: 'inherit',
    lineHeight: '1.6',
    padding: '0 4px',
  },
});

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface CodeEditorProps {
  tab: FileEditorTab;
  onCursorChange?: (line: number, col: number) => void;
  diffContent?: string | null;
}

export function CodeEditor({ tab, onCursorChange, diffContent }: CodeEditorProps) {
  const { updateTabContent, markTabSaved } = useFileEditorStore();
  const { fileEditorFontFamily, fileEditorFontSize, editorAutoSave, editorAutoSaveDelay } =
    useAppStore();

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestContentRef = useRef(tab.content);

  // Async language loading state
  const [asyncLangExt, setAsyncLangExt] = useState<Extension | null>(null);

  // Keep latest content in sync for explicit save
  useEffect(() => {
    latestContentRef.current = tab.content;
  }, [tab.content]);

  // Load language extension (may be async for legacy modes)
  useEffect(() => {
    let cancelled = false;
    void getLanguageExtensionAsync(tab.fileName).then((ext) => {
      if (!cancelled) setAsyncLangExt(ext);
    });
    return () => {
      cancelled = true;
    };
  }, [tab.fileName]);

  // -- Explicit save (Ctrl+S) -----------------------------------------------
  const saveNow = useCallback(
    async (filePath: string, content: string, tabId: string) => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      try {
        const result = await apiPost<{ success: boolean; error?: string }>('/api/fs/write', {
          filePath,
          content,
        });
        if (result.success) {
          markTabSaved(tabId);
        }
      } catch {
        // Silently ignore
      }
    },
    [markTabSaved]
  );

  // -- Auto-save (configurable debounce) -------------------------------------
  const scheduleAutoSave = useCallback(
    (filePath: string, content: string, tabId: string) => {
      if (!editorAutoSave) return;
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
          // Silently ignore
        }
      }, editorAutoSaveDelay);
    },
    [markTabSaved, editorAutoSave, editorAutoSaveDelay]
  );

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

  // -- Cursor change ---------------------------------------------------------
  const handleUpdate = useCallback(
    (update: ViewUpdate) => {
      if (!onCursorChange) return;
      if (update.selectionSet || update.docChanged) {
        const pos = update.state.selection.main.head;
        const line = update.state.doc.lineAt(pos);
        onCursorChange(line.number, pos - line.from + 1);
      }
    },
    [onCursorChange]
  );

  // -- Ctrl+S keymap ---------------------------------------------------------
  const saveKeymap = useMemo(
    () =>
      keymap.of([
        {
          key: 'Mod-s',
          run: () => {
            void saveNow(tab.filePath, latestContentRef.current, tab.id);
            return true;
          },
        },
      ]),
    [tab.filePath, tab.id, saveNow]
  );

  // -- Extensions (language + save + cursor + diff) ---------------------------
  const extensions = useMemo<Extension[]>(() => {
    const exts: Extension[] = [];

    // Try sync first, fall back to async-loaded
    const lang = getLanguageExtension(tab.fileName) ?? asyncLangExt;
    if (lang) exts.push(lang);

    exts.push(EditorView.lineWrapping);
    exts.push(saveKeymap);
    exts.push(EditorView.updateListener.of(handleUpdate));

    // Diff decorations
    if (diffContent) {
      exts.push(createDiffExtension(diffContent));
      exts.push(diffTheme);
    }

    return exts;
  }, [tab.fileName, asyncLangExt, saveKeymap, handleUpdate, diffContent]);

  // -- Font theme -------------------------------------------------------------
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

  // -- Binary file warning ----------------------------------------------------
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

  // -- Too-large file warning -------------------------------------------------
  if (tab.isTooLarge) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <FileWarning className="h-10 w-10 text-amber-500" />
        <p className="text-sm font-medium">File is too large</p>
        <p className="max-w-xs text-center text-xs opacity-70">
          <span className="font-mono">{tab.fileName}</span> exceeds the 5 MB size limit for
          in-browser editing.
        </p>
      </div>
    );
  }

  // -- Error state ------------------------------------------------------------
  if (tab.error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <AlertTriangle className="h-10 w-10 text-destructive" />
        <p className="text-sm font-medium">Failed to load file</p>
        <p className="max-w-xs text-center text-xs opacity-70">{tab.error}</p>
      </div>
    );
  }

  // -- Loading state ----------------------------------------------------------
  if (tab.isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading...
      </div>
    );
  }

  // -- Editor -----------------------------------------------------------------
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
