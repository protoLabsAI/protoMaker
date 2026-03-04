import type { RefObject } from 'react';
import {
  X,
  SplitSquareHorizontal,
  SplitSquareVertical,
  GripHorizontal,
  Terminal,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Settings,
  Search,
  ChevronUp,
  ChevronDown,
  Maximize2,
  Minimize2,
  GitBranch,
} from 'lucide-react';
import { Button } from '@protolabs-ai/ui/atoms';
import { Spinner } from '@protolabs-ai/ui/atoms';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@protolabs-ai/ui/atoms';
import { Slider } from '@protolabs-ai/ui/atoms';
import { Label } from '@protolabs-ai/ui/atoms';
import { Input } from '@protolabs-ai/ui/atoms';
import { Switch } from '@protolabs-ai/ui/atoms';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@protolabs-ai/ui/atoms';
import type { DraggableAttributes, DraggableSyntheticListeners } from '@dnd-kit/core';
import { TERMINAL_FONT_OPTIONS } from '@/config/terminal-themes';
import { DEFAULT_FONT_VALUE } from '@/config/ui-font-options';
import { toast } from 'sonner';

// Font size constraints — exported so terminal-panel can import them
export const MIN_FONT_SIZE = 8;
export const MAX_FONT_SIZE = 32;
export const DEFAULT_FONT_SIZE = 14;

export interface TerminalToolbarProps {
  // Display state
  shellName: string;
  branchName?: string;
  fontSize: number;
  connectionStatus: 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'auth_failed';
  processExitCode: number | null;
  isMaximized: boolean;
  isDragging: boolean;

  // Search state
  showSearch: boolean;
  searchQuery: string;
  searchInputRef: RefObject<HTMLInputElement | null>;

  // Terminal settings (from store, passed as props — no direct store access in this component)
  defaultRunScript: string;
  fontFamily: string | null | undefined;
  scrollbackLines: number;
  lineHeight: number;
  screenReaderMode: boolean;

  // Drag-and-drop refs / attributes
  dragRef: (node: HTMLButtonElement | null) => void;
  dragAttributes: DraggableAttributes;
  dragListeners: DraggableSyntheticListeners;

  // Window / panel action callbacks
  onClose: () => void;
  onSplitHorizontal: () => void;
  onSplitVertical: () => void;
  onToggleMaximize?: () => void;

  // Font-size callbacks
  onFontSizeChange: (size: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;

  // Search callbacks
  onSearchQueryChange: (query: string) => void;
  onSearchNext: () => void;
  onSearchPrevious: () => void;
  onCloseSearch: () => void;

  // Settings callbacks (wrapping store setters)
  onSetDefaultRunScript: (value: string) => void;
  onSetFontFamily: (value: string) => void;
  onSetScrollbackLines: (value: number) => void;
  onSetLineHeight: (value: number) => void;
  onSetScreenReaderMode: (value: boolean) => void;
}

export function TerminalToolbar({
  shellName,
  branchName,
  fontSize,
  connectionStatus,
  processExitCode,
  isMaximized,
  isDragging,
  showSearch,
  searchQuery,
  searchInputRef,
  defaultRunScript,
  fontFamily,
  scrollbackLines,
  lineHeight,
  screenReaderMode,
  dragRef,
  dragAttributes,
  dragListeners,
  onClose,
  onSplitHorizontal,
  onSplitVertical,
  onToggleMaximize,
  onFontSizeChange,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onSearchQueryChange,
  onSearchNext,
  onSearchPrevious,
  onCloseSearch,
  onSetDefaultRunScript,
  onSetFontFamily,
  onSetScrollbackLines,
  onSetLineHeight,
  onSetScreenReaderMode,
}: TerminalToolbarProps) {
  return (
    <>
      {/* Header bar with drag handle - uses app theme CSS variables */}
      <div className="flex items-center h-7 px-1 shrink-0 bg-card border-b border-border">
        {/* Drag handle */}
        <button
          ref={dragRef}
          {...dragAttributes}
          {...dragListeners}
          className={cn(
            'p-1 rounded cursor-grab active:cursor-grabbing mr-1 transition-colors text-muted-foreground hover:text-foreground hover:bg-accent',
            isDragging && 'cursor-grabbing'
          )}
          title="Drag to swap terminals"
        >
          <GripHorizontal className="h-3 w-3" />
        </button>

        {/* Terminal icon and label */}
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <Terminal className="h-3 w-3 shrink-0 text-muted-foreground" />
          <span className="text-xs truncate text-foreground">{shellName}</span>
          {/* Branch name indicator - show when terminal was opened from worktree */}
          {branchName && (
            <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-500 shrink-0">
              <GitBranch className="h-2.5 w-2.5 shrink-0" />
              <span>{branchName}</span>
            </span>
          )}
          {/* Font size indicator - only show when not default */}
          {fontSize !== DEFAULT_FONT_SIZE && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onResetZoom();
              }}
              className="text-[10px] px-1 rounded transition-colors text-muted-foreground hover:text-foreground hover:bg-accent"
              title="Click to reset zoom (Ctrl+0)"
            >
              {fontSize}px
            </button>
          )}
          {connectionStatus === 'reconnecting' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-status-warning/20 text-yellow-500 flex items-center gap-1">
              <Spinner size="xs" />
              Reconnecting...
            </span>
          )}
          {connectionStatus === 'disconnected' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/20 text-destructive">
              Disconnected
            </span>
          )}
          {connectionStatus === 'auth_failed' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/20 text-destructive">
              Auth Failed
            </span>
          )}
          {processExitCode !== null && (
            <span
              className={cn(
                'text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1',
                processExitCode === 0
                  ? 'bg-status-success/20 text-green-500'
                  : 'bg-status-warning/20 text-yellow-500'
              )}
            >
              Exited ({processExitCode})
            </span>
          )}
        </div>

        {/* Zoom and action buttons */}
        <div className="flex items-center gap-0.5">
          {/* Zoom controls */}
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              onZoomOut();
            }}
            title="Zoom Out (Ctrl+-)"
            disabled={fontSize <= MIN_FONT_SIZE}
          >
            <ZoomOut className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              onZoomIn();
            }}
            title="Zoom In (Ctrl++)"
            disabled={fontSize >= MAX_FONT_SIZE}
          >
            <ZoomIn className="h-3 w-3" />
          </Button>

          {/* Settings popover */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 text-muted-foreground hover:text-foreground"
                onClick={(e) => e.stopPropagation()}
                title="Terminal Settings"
              >
                <Settings className="h-3 w-3" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="w-64 p-3"
              align="end"
              side="bottom"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium">Font Size</Label>
                    <span className="text-xs text-muted-foreground">{fontSize}px</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Slider
                      value={[fontSize]}
                      min={MIN_FONT_SIZE}
                      max={MAX_FONT_SIZE}
                      step={1}
                      onValueChange={([value]) => onFontSizeChange(value)}
                      className="flex-1"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0"
                      onClick={() => onResetZoom()}
                      disabled={fontSize === DEFAULT_FONT_SIZE}
                      title="Reset to default"
                    >
                      <RotateCcw className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-medium">Run on New Terminal</Label>
                  <Input
                    value={defaultRunScript}
                    onChange={(e) => onSetDefaultRunScript(e.target.value)}
                    placeholder="e.g., claude"
                    className="h-7 text-xs"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Command to run when creating a new terminal
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-medium">Font Family</Label>
                  <Select
                    value={fontFamily || DEFAULT_FONT_VALUE}
                    onValueChange={(value) => {
                      onSetFontFamily(value);
                      toast.info('Font family changed', {
                        description: 'Restart terminal for changes to take effect',
                      });
                    }}
                  >
                    <SelectTrigger className="w-full h-8 text-xs">
                      <SelectValue placeholder="Default (Menlo / Monaco)" />
                    </SelectTrigger>
                    <SelectContent>
                      {TERMINAL_FONT_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          <span
                            style={{
                              fontFamily:
                                option.value === DEFAULT_FONT_VALUE ? undefined : option.value,
                            }}
                          >
                            {option.label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium">Scrollback</Label>
                    <span className="text-xs text-muted-foreground">
                      {(scrollbackLines / 1000).toFixed(0)}k lines
                    </span>
                  </div>
                  <Slider
                    value={[scrollbackLines]}
                    min={1000}
                    max={100000}
                    step={1000}
                    onValueChange={([value]) => {
                      onSetScrollbackLines(value);
                    }}
                    onValueCommit={() => {
                      toast.info('Scrollback changed', {
                        description: 'Restart terminal for changes to take effect',
                      });
                    }}
                    className="flex-1"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium">Line Height</Label>
                    <span className="text-xs text-muted-foreground">{lineHeight.toFixed(1)}</span>
                  </div>
                  <Slider
                    value={[lineHeight]}
                    min={1.0}
                    max={2.0}
                    step={0.1}
                    onValueChange={([value]) => {
                      onSetLineHeight(value);
                    }}
                    onValueCommit={() => {
                      toast.info('Line height changed', {
                        description: 'Restart terminal for changes to take effect',
                      });
                    }}
                    className="flex-1"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-xs font-medium">Screen Reader</Label>
                    <p className="text-[10px] text-muted-foreground">Enable accessibility mode</p>
                  </div>
                  <Switch
                    checked={screenReaderMode}
                    onCheckedChange={(checked) => {
                      onSetScreenReaderMode(checked);
                      toast.info(checked ? 'Screen reader enabled' : 'Screen reader disabled', {
                        description: 'Restart terminal for changes to take effect',
                      });
                    }}
                  />
                </div>

                <div className="text-[10px] text-muted-foreground border-t pt-2">
                  <p>Zoom: Ctrl++ / Ctrl+- / Ctrl+0</p>
                  <p>Or use Ctrl+scroll wheel</p>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          <div className="w-px h-3 mx-0.5 bg-border" />

          {/* Split/close buttons */}
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              onSplitHorizontal();
            }}
            title="Split Right (Alt+D)"
          >
            <SplitSquareHorizontal className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              onSplitVertical();
            }}
            title="Split Down (Alt+S)"
          >
            <SplitSquareVertical className="h-3 w-3" />
          </Button>
          {onToggleMaximize && (
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                onToggleMaximize();
              }}
              title={isMaximized ? 'Restore' : 'Maximize'}
            >
              {isMaximized ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-muted-foreground hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            title="Close Terminal (Alt+W)"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Search bar */}
      {showSearch && (
        <div className="flex items-center gap-1 px-2 py-1 bg-card border-b border-border shrink-0">
          <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => {
              onSearchQueryChange(e.target.value);
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') {
                e.preventDefault();
                if (e.shiftKey) {
                  onSearchPrevious();
                } else {
                  onSearchNext();
                }
              } else if (e.key === 'Escape') {
                e.preventDefault();
                onCloseSearch();
              }
            }}
            placeholder="Search..."
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none min-w-0"
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-muted-foreground hover:text-foreground shrink-0"
            onClick={onSearchPrevious}
            disabled={!searchQuery}
            title="Previous Match (Shift+Enter)"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-muted-foreground hover:text-foreground shrink-0"
            onClick={onSearchNext}
            disabled={!searchQuery}
            title="Next Match (Enter)"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-muted-foreground hover:text-foreground shrink-0"
            onClick={onCloseSearch}
            title="Close (Escape)"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </>
  );
}
