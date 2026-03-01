import { useState, useEffect } from 'react';
import { Button } from '@protolabs-ai/ui/atoms';
import { Input } from '@protolabs-ai/ui/atoms';
import { Label } from '@protolabs-ai/ui/atoms';
import { Textarea } from '@protolabs-ai/ui/atoms';
import { Switch } from '@protolabs-ai/ui/atoms';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@protolabs-ai/ui/atoms';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@protolabs-ai/ui/atoms';
import { Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Automation, PhaseModelEntry } from '@protolabs-ai/types';
import { PhaseModelSelector } from '../model-defaults/phase-model-selector';

interface AutomationEditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, edit mode; when null, create mode */
  automation: Automation | null;
  /** Available flow IDs derived from existing automations */
  knownFlowIds: string[];
  onSave: (data: AutomationFormData) => Promise<void>;
}

export interface AutomationFormData {
  name: string;
  description: string;
  triggerType: 'cron' | 'event' | 'webhook';
  cronExpression: string;
  eventType: string;
  webhookPath: string;
  flowId: string;
  modelConfig: PhaseModelEntry;
  enabled: boolean;
}

const DEFAULT_MODEL: PhaseModelEntry = { model: 'claude-sonnet-4-6' };

const COMMON_EVENT_TYPES = [
  'feature:completed',
  'feature:error',
  'feature:created',
  'feature:pr-merged',
  'auto-mode:started',
  'auto-mode:stopped',
  'auto-mode:idle',
  'pr:review-submitted',
  'health:issue-detected',
];

const COMMON_CRON_PRESETS = [
  { label: 'Every 5 minutes', value: '*/5 * * * *' },
  { label: 'Every 30 minutes', value: '*/30 * * * *' },
  { label: 'Hourly', value: '0 * * * *' },
  { label: 'Every 6 hours', value: '0 */6 * * *' },
  { label: 'Daily (midnight)', value: '0 0 * * *' },
  { label: 'Weekly (Sunday)', value: '0 0 * * 0' },
];

export function AutomationEditModal({
  open,
  onOpenChange,
  automation,
  knownFlowIds,
  onSave,
}: AutomationEditModalProps) {
  const isBuiltIn = automation?.isBuiltIn ?? false;
  const isEditing = automation !== null;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [triggerType, setTriggerType] = useState<'cron' | 'event' | 'webhook'>('cron');
  const [cronExpression, setCronExpression] = useState('0 * * * *');
  const [eventType, setEventType] = useState('feature:completed');
  const [webhookPath, setWebhookPath] = useState('/my-webhook');
  const [flowId, setFlowId] = useState('');
  const [modelConfig, setModelConfig] = useState<PhaseModelEntry>(DEFAULT_MODEL);
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Populate form when editing
  useEffect(() => {
    if (automation) {
      setName(automation.name);
      setDescription(automation.description ?? '');
      setTriggerType(automation.trigger.type);
      if (automation.trigger.type === 'cron') {
        setCronExpression(automation.trigger.expression);
      } else if (automation.trigger.type === 'event') {
        setEventType(automation.trigger.eventType);
      } else if (automation.trigger.type === 'webhook') {
        setWebhookPath(automation.trigger.path);
      }
      setFlowId(automation.flowId);
      setModelConfig(automation.modelConfig ?? DEFAULT_MODEL);
      setEnabled(automation.enabled);
    } else {
      // Reset for create
      setName('');
      setDescription('');
      setTriggerType('cron');
      setCronExpression('0 * * * *');
      setEventType('feature:completed');
      setWebhookPath('/my-webhook');
      setFlowId('');
      setModelConfig(DEFAULT_MODEL);
      setEnabled(true);
    }
    setError(null);
  }, [automation, open]);

  const handleSave = async () => {
    setError(null);
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    if (!flowId.trim()) {
      setError('Flow ID is required');
      return;
    }
    if (triggerType === 'cron' && !cronExpression.trim()) {
      setError('Cron expression is required');
      return;
    }
    if (triggerType === 'webhook' && !webhookPath.trim()) {
      setError('Webhook path is required');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        description: description.trim(),
        triggerType,
        cronExpression: cronExpression.trim(),
        eventType: eventType.trim(),
        webhookPath: webhookPath.trim(),
        flowId: flowId.trim(),
        modelConfig,
        enabled,
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save automation');
    } finally {
      setSaving(false);
    }
  };

  const fieldsDisabled = isBuiltIn;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isBuiltIn && <Lock className="w-4 h-4 text-muted-foreground" />}
            {isEditing ? 'Edit Automation' : 'New Automation'}
          </DialogTitle>
          <DialogDescription>
            {isBuiltIn
              ? 'Built-in automations can only be enabled or disabled.'
              : isEditing
                ? 'Update the automation configuration.'
                : 'Create a new trigger-based automation.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="automation-name">Name</Label>
            <Input
              id="automation-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Nightly Stale Feature Check"
              disabled={fieldsDisabled}
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="automation-desc">Description</Label>
            <Textarea
              id="automation-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              rows={2}
              disabled={fieldsDisabled}
            />
          </div>

          {/* Trigger Type */}
          <div className="space-y-1.5">
            <Label>Trigger Type</Label>
            <Select
              value={triggerType}
              onValueChange={(v) => setTriggerType(v as 'cron' | 'event' | 'webhook')}
              disabled={fieldsDisabled}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cron">Scheduled (Cron)</SelectItem>
                <SelectItem value="event">Event</SelectItem>
                <SelectItem value="webhook">Webhook</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Trigger-specific inputs */}
          {triggerType === 'cron' && (
            <div className="space-y-1.5">
              <Label htmlFor="cron-expr">Cron Expression</Label>
              <div className="flex gap-2">
                <Input
                  id="cron-expr"
                  value={cronExpression}
                  onChange={(e) => setCronExpression(e.target.value)}
                  placeholder="0 * * * *"
                  disabled={fieldsDisabled}
                  className="font-mono text-sm flex-1"
                />
                {!fieldsDisabled && (
                  <Select value="" onValueChange={(v) => v && setCronExpression(v)}>
                    <SelectTrigger className="w-36 shrink-0">
                      <SelectValue placeholder="Preset" />
                    </SelectTrigger>
                    <SelectContent>
                      {COMMON_CRON_PRESETS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          )}

          {triggerType === 'event' && (
            <div className="space-y-1.5">
              <Label htmlFor="event-type">Event Type</Label>
              <div className="flex gap-2">
                <Input
                  id="event-type"
                  value={eventType}
                  onChange={(e) => setEventType(e.target.value)}
                  placeholder="feature:completed"
                  disabled={fieldsDisabled}
                  className="font-mono text-sm flex-1"
                />
                {!fieldsDisabled && (
                  <Select value="" onValueChange={(v) => v && setEventType(v)}>
                    <SelectTrigger className="w-40 shrink-0">
                      <SelectValue placeholder="Common" />
                    </SelectTrigger>
                    <SelectContent>
                      {COMMON_EVENT_TYPES.map((et) => (
                        <SelectItem key={et} value={et} className="font-mono text-xs">
                          {et}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          )}

          {triggerType === 'webhook' && (
            <div className="space-y-1.5">
              <Label htmlFor="webhook-path">Webhook Path</Label>
              <Input
                id="webhook-path"
                value={webhookPath}
                onChange={(e) => setWebhookPath(e.target.value)}
                placeholder="/my-webhook"
                disabled={fieldsDisabled}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Receives POST requests at /api/automations/webhook{webhookPath}
              </p>
            </div>
          )}

          {/* Flow ID */}
          <div className="space-y-1.5">
            <Label htmlFor="flow-id">Flow ID</Label>
            <div className="flex gap-2">
              <Input
                id="flow-id"
                value={flowId}
                onChange={(e) => setFlowId(e.target.value)}
                placeholder="built-in:stale-features"
                disabled={fieldsDisabled}
                className="font-mono text-sm flex-1"
              />
              {!fieldsDisabled && knownFlowIds.length > 0 && (
                <Select value="" onValueChange={(v) => v && setFlowId(v)}>
                  <SelectTrigger className="w-32 shrink-0">
                    <SelectValue placeholder="Pick" />
                  </SelectTrigger>
                  <SelectContent>
                    {knownFlowIds.map((fid) => (
                      <SelectItem key={fid} value={fid} className="font-mono text-xs">
                        {fid}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          {/* Model */}
          <div className="space-y-1.5">
            <Label>Model</Label>
            <PhaseModelSelector
              value={modelConfig}
              onChange={setModelConfig}
              compact
              disabled={fieldsDisabled}
              align="start"
            />
          </div>

          {/* Enabled */}
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="automation-enabled" className="text-sm font-medium">
                Enabled
              </Label>
              <p className="text-xs text-muted-foreground">Run this automation when triggered</p>
            </div>
            <Switch id="automation-enabled" checked={enabled} onCheckedChange={setEnabled} />
          </div>

          {error && (
            <p className={cn('text-sm text-destructive rounded-md bg-destructive/10 p-2')}>
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : isEditing ? 'Save Changes' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
