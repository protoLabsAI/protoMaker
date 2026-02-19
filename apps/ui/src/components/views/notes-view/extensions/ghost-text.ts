/**
 * Ghost Text Extension — Copilot-style inline autocomplete for TipTap
 *
 * Renders a phantom gray text prediction at the cursor position using
 * ProseMirror Decoration.widget. Tab accepts, Escape dismisses.
 *
 * Uses the /api/ai/complete endpoint for predictions.
 */

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

const GHOST_TEXT_KEY = new PluginKey('ghostText');
const DEBOUNCE_MS = 500;

/** State tracked by the ghost text plugin */
interface GhostTextState {
  decorations: DecorationSet;
  suggestion: string | null;
}

export interface GhostTextOptions {
  /** Function that fetches a completion given context and current line */
  fetchCompletion: (context: string, currentLine: string) => Promise<string | null>;
}

export const GhostText = Extension.create<GhostTextOptions>({
  name: 'ghostText',

  addOptions() {
    return {
      fetchCompletion: async () => null,
    };
  },

  addProseMirrorPlugins() {
    const { fetchCompletion } = this.options;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let abortController: AbortController | null = null;

    return [
      new Plugin<GhostTextState>({
        key: GHOST_TEXT_KEY,
        state: {
          init(): GhostTextState {
            return { decorations: DecorationSet.empty, suggestion: null };
          },

          apply(tr, prev): GhostTextState {
            const meta = tr.getMeta(GHOST_TEXT_KEY);

            // Explicit set/clear from our logic
            if (meta?.clear) {
              return { decorations: DecorationSet.empty, suggestion: null };
            }

            if (meta?.suggestion && typeof meta.position === 'number') {
              const widget = Decoration.widget(
                meta.position,
                () => {
                  const span = document.createElement('span');
                  span.className = 'ghost-text-suggestion';
                  span.textContent = meta.suggestion;
                  return span;
                },
                { side: 1 }
              );
              return {
                decorations: DecorationSet.create(tr.doc, [widget]),
                suggestion: meta.suggestion,
              };
            }

            // On any doc change, clear the ghost text
            if (tr.docChanged) {
              return { decorations: DecorationSet.empty, suggestion: null };
            }

            // Map decorations through position changes
            return {
              ...prev,
              decorations: prev.decorations.map(tr.mapping, tr.doc),
            };
          },
        },

        props: {
          decorations(state) {
            return GHOST_TEXT_KEY.getState(state)?.decorations ?? DecorationSet.empty;
          },
        },

        view(editorView) {
          function scheduleCompletion() {
            // Cancel any pending request
            if (debounceTimer) clearTimeout(debounceTimer);
            if (abortController) abortController.abort();

            debounceTimer = setTimeout(async () => {
              const { state } = editorView;
              const { selection, doc } = state;

              // Only complete at end of a text block, with a non-empty cursor position
              if (!selection.empty) return;

              const pos = selection.head;
              const $pos = doc.resolve(pos);

              // Get current line text (text in the current block up to cursor)
              const blockStart = $pos.start();
              const currentLine = doc.textBetween(blockStart, pos, '', '');

              // Don't trigger on empty lines
              if (!currentLine.trim()) return;

              // Get preceding context (up to ~2000 chars before current block)
              const contextStart = Math.max(0, blockStart - 2000);
              const context = doc.textBetween(contextStart, blockStart, '\n', '');

              try {
                abortController = new AbortController();
                const suggestion = await fetchCompletion(context, currentLine);

                // Verify editor state hasn't changed while we were fetching
                if (editorView.state.selection.head !== pos) return;
                if (!suggestion || !suggestion.trim()) return;

                editorView.dispatch(
                  editorView.state.tr.setMeta(GHOST_TEXT_KEY, {
                    suggestion: suggestion.trim(),
                    position: editorView.state.selection.head,
                  })
                );
              } catch {
                // Silently ignore aborted requests and errors
              }
            }, DEBOUNCE_MS);
          }

          return {
            update(view, prevState) {
              // Only trigger on doc changes (user is typing)
              if (view.state.doc.eq(prevState.doc)) return;
              scheduleCompletion();
            },
            destroy() {
              if (debounceTimer) clearTimeout(debounceTimer);
              if (abortController) abortController.abort();
            },
          };
        },
      }),
    ];
  },

  addKeyboardShortcuts() {
    return {
      Tab: ({ editor }) => {
        const pluginState = GHOST_TEXT_KEY.getState(editor.state) as GhostTextState | undefined;
        if (pluginState?.suggestion) {
          // Insert the ghost text at cursor
          editor.commands.insertContent(pluginState.suggestion);
          // Clear the decoration
          editor.view.dispatch(editor.state.tr.setMeta(GHOST_TEXT_KEY, { clear: true }));
          return true; // Handled — prevent default Tab behavior
        }
        return false; // Not handled — let Tab do its normal thing
      },

      Escape: ({ editor }) => {
        const pluginState = GHOST_TEXT_KEY.getState(editor.state) as GhostTextState | undefined;
        if (pluginState?.suggestion) {
          editor.view.dispatch(editor.state.tr.setMeta(GHOST_TEXT_KEY, { clear: true }));
          return true;
        }
        return false;
      },
    };
  },
});
