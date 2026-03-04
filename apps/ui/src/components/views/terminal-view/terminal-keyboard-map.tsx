import { useState, useRef, useEffect } from 'react';
import { Copy, ClipboardPaste, CheckSquare, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ContextMenuAction = 'copy' | 'paste' | 'selectAll' | 'clear';

const MENU_ACTIONS: ContextMenuAction[] = ['copy', 'paste', 'selectAll', 'clear'];

export interface TerminalContextMenuProps {
  /** Position of the context menu, or null when closed */
  contextMenu: { x: number; y: number } | null;
  /** Whether the user is on macOS (affects shortcut display: ⌘ vs Ctrl) */
  isMac: boolean;
  /** Called to close the menu (e.g. Escape key or Tab) */
  onClose: () => void;
  /** Called when a menu action is selected (parent handles close + xterm focus) */
  onAction: (action: ContextMenuAction) => void;
  /** Focuses the xterm instance (called after Escape to restore keyboard input) */
  focusXterm: () => void;
}

/**
 * TerminalContextMenu — the keyboard shortcut map display for the terminal.
 *
 * Renders a context menu that shows available terminal actions alongside their
 * keyboard shortcut labels (⌘C / Ctrl+C, etc.). Self-manages focus state and
 * keyboard navigation; delegates action execution and menu close to the parent
 * via `onAction` and `onClose` props.
 */
export function TerminalContextMenu({
  contextMenu,
  isMac,
  onClose,
  onAction,
  focusXterm,
}: TerminalContextMenuProps) {
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const [focusedMenuIndex, setFocusedMenuIndex] = useState(0);
  const focusedMenuIndexRef = useRef(0);

  // Keep ref in sync with state for use inside event handlers
  useEffect(() => {
    focusedMenuIndexRef.current = focusedMenuIndex;
  }, [focusedMenuIndex]);

  // Close context menu on click outside or scroll; handle keyboard navigation
  useEffect(() => {
    if (!contextMenu) return;

    // Reset focus index and focus the first menu item when the menu opens
    setFocusedMenuIndex(0);
    focusedMenuIndexRef.current = 0;
    requestAnimationFrame(() => {
      const firstButton =
        contextMenuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]');
      firstButton?.focus();
    });

    const handleClick = () => onClose();
    const handleScroll = () => onClose();

    const handleKeyDown = (e: KeyboardEvent) => {
      const updateFocusIndex = (newIndex: number) => {
        focusedMenuIndexRef.current = newIndex;
        setFocusedMenuIndex(newIndex);
      };

      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          e.stopPropagation();
          onClose();
          focusXterm();
          break;
        case 'ArrowDown':
          e.preventDefault();
          e.stopPropagation();
          updateFocusIndex((focusedMenuIndexRef.current + 1) % MENU_ACTIONS.length);
          break;
        case 'ArrowUp':
          e.preventDefault();
          e.stopPropagation();
          updateFocusIndex(
            (focusedMenuIndexRef.current - 1 + MENU_ACTIONS.length) % MENU_ACTIONS.length
          );
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          e.stopPropagation();
          onAction(MENU_ACTIONS[focusedMenuIndexRef.current]);
          break;
        case 'Tab':
          e.preventDefault();
          e.stopPropagation();
          onClose();
          break;
      }
    };

    document.addEventListener('click', handleClick);
    document.addEventListener('scroll', handleScroll, true);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('click', handleClick);
      document.removeEventListener('scroll', handleScroll, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [contextMenu, onClose, focusXterm, onAction]);

  // Programmatically focus the correct menu item when keyboard navigation changes
  useEffect(() => {
    if (!contextMenu || !contextMenuRef.current) return;
    const buttons = contextMenuRef.current.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
    buttons[focusedMenuIndex]?.focus();
  }, [focusedMenuIndex, contextMenu]);

  if (!contextMenu) return null;

  return (
    <div
      ref={contextMenuRef}
      role="menu"
      aria-label="Terminal context menu"
      className="fixed z-50 min-w-[160px] rounded-md border border-border bg-popover p-1 shadow-md animate-in fade-in-0 zoom-in-95"
      style={{ left: contextMenu.x, top: contextMenu.y }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        role="menuitem"
        tabIndex={focusedMenuIndex === 0 ? 0 : -1}
        className={cn(
          'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-popover-foreground cursor-default outline-none',
          focusedMenuIndex === 0
            ? 'bg-accent text-accent-foreground'
            : 'hover:bg-accent hover:text-accent-foreground'
        )}
        onClick={() => onAction('copy')}
      >
        <Copy className="h-4 w-4" />
        <span className="flex-1 text-left">Copy</span>
        <span className="text-xs text-muted-foreground">{isMac ? '⌘C' : 'Ctrl+C'}</span>
      </button>
      <button
        role="menuitem"
        tabIndex={focusedMenuIndex === 1 ? 0 : -1}
        className={cn(
          'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-popover-foreground cursor-default outline-none',
          focusedMenuIndex === 1
            ? 'bg-accent text-accent-foreground'
            : 'hover:bg-accent hover:text-accent-foreground'
        )}
        onClick={() => onAction('paste')}
      >
        <ClipboardPaste className="h-4 w-4" />
        <span className="flex-1 text-left">Paste</span>
        <span className="text-xs text-muted-foreground">{isMac ? '⌘V' : 'Ctrl+V'}</span>
      </button>
      <div role="separator" className="my-1 h-px bg-border" />
      <button
        role="menuitem"
        tabIndex={focusedMenuIndex === 2 ? 0 : -1}
        className={cn(
          'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-popover-foreground cursor-default outline-none',
          focusedMenuIndex === 2
            ? 'bg-accent text-accent-foreground'
            : 'hover:bg-accent hover:text-accent-foreground'
        )}
        onClick={() => onAction('selectAll')}
      >
        <CheckSquare className="h-4 w-4" />
        <span className="flex-1 text-left">Select All</span>
        <span className="text-xs text-muted-foreground">{isMac ? '⌘A' : 'Ctrl+A'}</span>
      </button>
      <button
        role="menuitem"
        tabIndex={focusedMenuIndex === 3 ? 0 : -1}
        className={cn(
          'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-popover-foreground cursor-default outline-none',
          focusedMenuIndex === 3
            ? 'bg-accent text-accent-foreground'
            : 'hover:bg-accent hover:text-accent-foreground'
        )}
        onClick={() => onAction('clear')}
      >
        <Trash2 className="h-4 w-4" />
        <span className="flex-1 text-left">Clear</span>
      </button>
    </div>
  );
}
