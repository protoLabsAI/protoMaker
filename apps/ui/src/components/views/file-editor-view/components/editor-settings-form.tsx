import { useAppStore } from '@/store/app-store';
import { Label } from '@protolabs-ai/ui/atoms';
import { Input } from '@protolabs-ai/ui/atoms';
import { Switch } from '@protolabs-ai/ui/atoms';

const FONT_OPTIONS = [
  { label: 'System Default', value: '' },
  { label: 'JetBrains Mono', value: '"JetBrains Mono", monospace' },
  { label: 'Fira Code', value: '"Fira Code", monospace' },
  { label: 'Source Code Pro', value: '"Source Code Pro", monospace' },
  { label: 'IBM Plex Mono', value: '"IBM Plex Mono", monospace' },
];

export function EditorSettingsForm() {
  const {
    fileEditorFontFamily,
    fileEditorFontSize,
    editorAutoSave,
    setFileEditorFontFamily,
    setFileEditorFontSize,
    setEditorAutoSave,
  } = useAppStore();

  return (
    <div className="space-y-4 p-1">
      <div className="space-y-1.5">
        <Label className="text-xs">Font Family</Label>
        <select
          value={fileEditorFontFamily}
          onChange={(e) => setFileEditorFontFamily(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {FONT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Font Size</Label>
        <div className="flex items-center gap-2">
          <Input
            type="range"
            min={10}
            max={24}
            step={1}
            value={fileEditorFontSize}
            onChange={(e) => setFileEditorFontSize(Number(e.target.value))}
            className="flex-1 h-6"
          />
          <span className="text-xs text-muted-foreground w-8 text-right tabular-nums">
            {fileEditorFontSize}px
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Label className="text-xs">Auto-save</Label>
        <Switch checked={editorAutoSave} onCheckedChange={setEditorAutoSave} />
      </div>
    </div>
  );
}
