import { RotateCcw, Settings } from 'lucide-react';
import { Button } from '@protolabs-ai/ui/atoms';
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
import { TERMINAL_FONT_OPTIONS } from '@/config/terminal-themes';
import { DEFAULT_FONT_VALUE } from '@/config/ui-font-options';
import { toast } from 'sonner';
import { useTerminalStore } from '@/store/terminal-store';
import { MIN_FONT_SIZE, MAX_FONT_SIZE, DEFAULT_FONT_SIZE } from './terminal-toolbar';

export interface TerminalSettingsPopoverProps {
  /** Current font size (managed at panel level, not in store) */
  fontSize: number;
  /** Callback to update font size */
  onFontSizeChange: (size: number) => void;
  /** Callback to reset font size to default */
  onResetZoom: () => void;
}

/**
 * Self-contained terminal settings popover.
 *
 * Renders the settings trigger button and the popover content with all
 * per-terminal configuration options.  Store-backed settings (font family,
 * scrollback, line height, screen reader, default run script) are accessed
 * and mutated directly from the terminal store so that this component can be
 * used without threading those values through a long prop chain.
 */
export function TerminalSettingsPopover({
  fontSize,
  onFontSizeChange,
  onResetZoom,
}: TerminalSettingsPopoverProps) {
  // Store-backed settings — read reactively so the UI stays in sync
  const defaultRunScript = useTerminalStore((state) => state.terminalState.defaultRunScript);
  const fontFamily = useTerminalStore((state) => state.terminalState.fontFamily);
  const scrollbackLines = useTerminalStore((state) => state.terminalState.scrollbackLines);
  const lineHeight = useTerminalStore((state) => state.terminalState.lineHeight);
  const screenReaderMode = useTerminalStore((state) => state.terminalState.screenReaderMode);

  // Store setters (stable references — no shallow comparison needed)
  const setTerminalDefaultRunScript = useTerminalStore(
    (state) => state.setTerminalDefaultRunScript
  );
  const setTerminalFontFamily = useTerminalStore((state) => state.setTerminalFontFamily);
  const setTerminalScrollbackLines = useTerminalStore((state) => state.setTerminalScrollbackLines);
  const setTerminalLineHeight = useTerminalStore((state) => state.setTerminalLineHeight);
  const setTerminalScreenReaderMode = useTerminalStore(
    (state) => state.setTerminalScreenReaderMode
  );

  return (
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
          {/* Font size slider */}
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

          {/* Default run script */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">Run on New Terminal</Label>
            <Input
              value={defaultRunScript}
              onChange={(e) => setTerminalDefaultRunScript(e.target.value)}
              placeholder="e.g., claude"
              className="h-7 text-xs"
            />
            <p className="text-[10px] text-muted-foreground">
              Command to run when creating a new terminal
            </p>
          </div>

          {/* Font family selector */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">Font Family</Label>
            <Select
              value={fontFamily || DEFAULT_FONT_VALUE}
              onValueChange={(value) => {
                setTerminalFontFamily(value);
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
                        fontFamily: option.value === DEFAULT_FONT_VALUE ? undefined : option.value,
                      }}
                    >
                      {option.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Scrollback lines slider */}
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
                setTerminalScrollbackLines(value);
              }}
              onValueCommit={() => {
                toast.info('Scrollback changed', {
                  description: 'Restart terminal for changes to take effect',
                });
              }}
              className="flex-1"
            />
          </div>

          {/* Line height slider */}
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
                setTerminalLineHeight(value);
              }}
              onValueCommit={() => {
                toast.info('Line height changed', {
                  description: 'Restart terminal for changes to take effect',
                });
              }}
              className="flex-1"
            />
          </div>

          {/* Screen reader toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-xs font-medium">Screen Reader</Label>
              <p className="text-[10px] text-muted-foreground">Enable accessibility mode</p>
            </div>
            <Switch
              checked={screenReaderMode}
              onCheckedChange={(checked) => {
                setTerminalScreenReaderMode(checked);
                toast.info(checked ? 'Screen reader enabled' : 'Screen reader disabled', {
                  description: 'Restart terminal for changes to take effect',
                });
              }}
            />
          </div>

          {/* Keyboard shortcut hints */}
          <div className="text-[10px] text-muted-foreground border-t pt-2">
            <p>Zoom: Ctrl++ / Ctrl+- / Ctrl+0</p>
            <p>Or use Ctrl+scroll wheel</p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
