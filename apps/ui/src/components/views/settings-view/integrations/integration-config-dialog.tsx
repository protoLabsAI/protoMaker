import { useCallback, useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Button,
  Input,
  Label,
  Switch,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
} from '@protolabs/ui/atoms';
import { apiFetch } from '@/lib/api-fetch';
import { useAppStore } from '@/store/app-store';
import type { IntegrationDescriptor, ConfigField } from '@automaker/types';

interface IntegrationConfigDialogProps {
  integrationId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export function IntegrationConfigDialog({
  integrationId,
  open,
  onOpenChange,
  onSaved,
}: IntegrationConfigDialogProps) {
  const [descriptor, setDescriptor] = useState<IntegrationDescriptor | null>(null);
  const [values, setValues] = useState<Record<string, string | number | boolean>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [revealedSecrets, setRevealedSecrets] = useState<Set<string>>(new Set());
  const currentProject = useAppStore((s) => s.currentProject);

  // Fetch descriptor when opened
  useEffect(() => {
    if (!open || !integrationId) return;

    setLoading(true);
    setRevealedSecrets(new Set());

    (async () => {
      try {
        const res = await apiFetch('/api/integrations/registry/get', 'POST', {
          body: { id: integrationId },
        });
        if (!res.ok) throw new Error(`Failed to load: ${res.status}`);
        const data = await res.json();
        setDescriptor(data.integration);

        // Initialize values from defaults
        const initial: Record<string, string | number | boolean> = {};
        for (const field of data.integration.configFields ?? []) {
          if (field.defaultValue !== undefined) {
            initial[field.key] = field.defaultValue;
          }
        }

        // Load existing project integration settings if available
        if (currentProject) {
          try {
            const settingsRes = await apiFetch('/api/integrations/get', 'POST', {
              body: { projectPath: currentProject },
            });
            if (!settingsRes.ok) throw new Error('settings unavailable');
            const settingsData = await settingsRes.json();
            const integrationSettings = settingsData.integrations?.[integrationId];
            if (integrationSettings) {
              for (const field of data.integration.configFields ?? []) {
                if (integrationSettings[field.key] !== undefined) {
                  initial[field.key] = integrationSettings[field.key];
                }
              }
            }
          } catch {
            // Settings not available yet — use defaults
          }
        }

        setValues(initial);
      } catch (error) {
        console.error('Failed to load integration config:', error);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, integrationId, currentProject]);

  const setValue = useCallback((key: string, value: string | number | boolean) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const toggleSecret = useCallback((key: string) => {
    setRevealedSecrets((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleSave = async () => {
    if (!descriptor || !currentProject) return;

    setSaving(true);
    setSaveError(null);
    try {
      // Save via existing integrations/update endpoint
      const integrations: Record<string, Record<string, unknown>> = {};
      const config: Record<string, unknown> = { enabled: true };
      for (const field of descriptor.configFields) {
        const val = values[field.key];
        if (val !== undefined && val !== '') {
          config[field.key] = val;
        }
      }
      integrations[descriptor.id] = config;

      const res = await apiFetch('/api/integrations/update', 'POST', {
        body: { projectPath: currentProject, integrations },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Save failed: ${res.status}`);
      }

      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save configuration';
      setSaveError(msg);
      console.error('Failed to save integration config:', err);
    } finally {
      setSaving(false);
    }
  };

  // Group fields
  const groupedFields = (descriptor?.configFields ?? []).reduce<Record<string, ConfigField[]>>(
    (acc, field) => {
      const group = field.group ?? 'General';
      if (!acc[group]) acc[group] = [];
      acc[group].push(field);
      return acc;
    },
    {}
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{descriptor?.name ?? 'Integration'} Configuration</DialogTitle>
          <DialogDescription>{descriptor?.description}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner />
          </div>
        ) : (
          <div className="space-y-6 py-2">
            {Object.entries(groupedFields).map(([group, fields]) => (
              <div key={group} className="space-y-3">
                <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                  {group}
                </h4>
                <div className="space-y-3">
                  {fields.map((field) => (
                    <FieldRenderer
                      key={field.key}
                      field={field}
                      value={values[field.key]}
                      revealed={revealedSecrets.has(field.key)}
                      onChange={(v) => setValue(field.key, v)}
                      onToggleReveal={() => toggleSecret(field.key)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {saveError && <p className="text-sm text-red-600 dark:text-red-400">{saveError}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Field renderer — auto-renders the right input for each ConfigField type
// ---------------------------------------------------------------------------

function FieldRenderer({
  field,
  value,
  revealed,
  onChange,
  onToggleReveal,
}: {
  field: ConfigField;
  value: string | number | boolean | undefined;
  revealed: boolean;
  onChange: (value: string | number | boolean) => void;
  onToggleReveal: () => void;
}) {
  switch (field.type) {
    case 'boolean':
      return (
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm">{field.label}</Label>
            {field.description && (
              <p className="text-xs text-zinc-500 mt-0.5">{field.description}</p>
            )}
          </div>
          <Switch checked={!!value} onCheckedChange={(v) => onChange(v)} />
        </div>
      );

    case 'secret':
      return (
        <div className="space-y-1.5">
          <Label className="text-sm">{field.label}</Label>
          {field.description && <p className="text-xs text-zinc-500">{field.description}</p>}
          <div className="relative">
            <Input
              type={revealed ? 'text' : 'password'}
              value={(value as string) ?? ''}
              onChange={(e) => onChange(e.target.value)}
              placeholder={field.placeholder}
              className="pr-9"
            />
            <button
              type="button"
              onClick={onToggleReveal}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
            >
              {revealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
      );

    case 'number':
      return (
        <div className="space-y-1.5">
          <Label className="text-sm">{field.label}</Label>
          {field.description && <p className="text-xs text-zinc-500">{field.description}</p>}
          <Input
            type="number"
            value={value !== undefined ? String(value) : ''}
            onChange={(e) => {
              const num = Number(e.target.value);
              if (!Number.isNaN(num)) onChange(num);
            }}
            placeholder={field.placeholder}
          />
        </div>
      );

    case 'select':
      return (
        <div className="space-y-1.5">
          <Label className="text-sm">{field.label}</Label>
          {field.description && <p className="text-xs text-zinc-500">{field.description}</p>}
          <Select value={(value as string) ?? ''} onValueChange={(v) => onChange(v)}>
            <SelectTrigger>
              <SelectValue placeholder={field.placeholder ?? 'Select...'} />
            </SelectTrigger>
            <SelectContent>
              {field.options?.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );

    case 'url':
    case 'string':
    default:
      return (
        <div className="space-y-1.5">
          <Label className="text-sm">{field.label}</Label>
          {field.description && <p className="text-xs text-zinc-500">{field.description}</p>}
          <Input
            type={field.type === 'url' ? 'url' : 'text'}
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
          />
        </div>
      );
  }
}
