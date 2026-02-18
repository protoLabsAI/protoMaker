import type { PenThemeSelection } from '@automaker/pen-renderer';

interface ThemePickerProps {
  theme: PenThemeSelection;
  onChange: (theme: PenThemeSelection) => void;
}

const MODES = ['Light', 'Dark'];
const BASES = ['Neutral', 'Gray', 'Zinc', 'Slate', 'Stone'];
const ACCENTS = ['Default', 'Blue', 'Green', 'Orange', 'Red', 'Rose', 'Violet', 'Yellow'];

function SelectControl({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-xs text-muted-foreground whitespace-nowrap">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 rounded border border-border bg-background px-2 text-xs text-foreground"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  );
}

export function ThemePicker({ theme, onChange }: ThemePickerProps) {
  return (
    <div className="flex items-center gap-4 rounded-md border border-border bg-card px-3 py-1.5">
      <SelectControl
        label="Mode"
        value={theme.Mode ?? 'Dark'}
        options={MODES}
        onChange={(value) => onChange({ ...theme, Mode: value })}
      />
      <SelectControl
        label="Base"
        value={theme.Base ?? 'Zinc'}
        options={BASES}
        onChange={(value) => onChange({ ...theme, Base: value })}
      />
      <SelectControl
        label="Accent"
        value={theme.Accent ?? 'Violet'}
        options={ACCENTS}
        onChange={(value) => onChange({ ...theme, Accent: value })}
      />
    </div>
  );
}
