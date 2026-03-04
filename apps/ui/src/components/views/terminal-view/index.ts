// Barrel export for terminal-view sub-components.
// Consumers can import from this single entry point instead of reaching into
// individual files: `import { TerminalPanel } from './terminal-view'`

export { TerminalPanel } from './terminal-panel';
export {
  TerminalToolbar,
  MIN_FONT_SIZE,
  MAX_FONT_SIZE,
  DEFAULT_FONT_SIZE,
} from './terminal-toolbar';
export type { TerminalToolbarProps } from './terminal-toolbar';
export { TerminalSettingsPopover } from './terminal-settings-popover';
export type { TerminalSettingsPopoverProps } from './terminal-settings-popover';
export { TerminalErrorBoundary } from './terminal-error-boundary';
export { TerminalContextMenu } from './terminal-keyboard-map';
export type { TerminalContextMenuProps, ContextMenuAction } from './terminal-keyboard-map';
