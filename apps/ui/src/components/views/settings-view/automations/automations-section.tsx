import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@protolabs-ai/ui/atoms';
import { Switch } from '@protolabs-ai/ui/atoms';
import { Spinner } from '@protolabs-ai/ui/atoms';
import { cn } from '@/lib/utils';
import {
  Zap,
  Plus,
  Pencil,
  Trash2,
  Lock,
  Clock,
  Radio,
  Webhook,
  CheckCircle2,
  XCircle,
  Loader2,
  Play,
  History,
} from 'lucide-react';
import type { Automation, AutomationRunStatus } from '@protolabs-ai/types';
import {
  listAutomations,
  createAutomation,
  updateAutomation,
  deleteAutomation,
  runAutomation,
} from '@/lib/api';
import { AutomationEditModal, type AutomationFormData } from './automation-edit-modal';
import { AutomationHistoryPanel } from './automation-history-panel';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function cronToHuman(expression: string): string {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) return expression;

  const [min, hour, dom, month, dow] = parts;

  if (expression.trim() === '* * * * *') return 'Every minute';

  const minStep = min.match(/^\*\/(\d+)$/);
  if (minStep && hour === '*' && dom === '*' && month === '*' && dow === '*') {
    return `Every ${minStep[1]} minutes`;
  }

  if (hour === '*' && dom === '*' && month === '*' && dow === '*') {
    const m = parseInt(min, 10);
    if (!isNaN(m)) return m === 0 ? 'Every hour' : `Every hour at :${String(m).padStart(2, '0')}`;
  }

  const hourStep = hour.match(/^\*\/(\d+)$/);
  if (hourStep && dom === '*' && month === '*' && dow === '*') {
    return `Every ${hourStep[1]} hours`;
  }

  const h = parseInt(hour, 10);
  const m = parseInt(min, 10);
  const timeStr =
    !isNaN(h) && !isNaN(m) ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` : null;

  if (dom === '*' && month === '*' && dow === '*' && timeStr) {
    return `Daily at ${timeStr}`;
  }

  if (dom === '*' && month === '*' && /^\d$/.test(dow)) {
    const dayName = DAYS[parseInt(dow, 10)] ?? `day ${dow}`;
    return timeStr ? `Every ${dayName} at ${timeStr}` : `Every ${dayName}`;
  }

  if (month === '*' && dow === '*' && /^\d+$/.test(dom)) {
    const day = parseInt(dom, 10);
    const suffix = day === 1 ? 'st' : day === 2 ? 'nd' : day === 3 ? 'rd' : 'th';
    return timeStr
      ? `Monthly on the ${day}${suffix} at ${timeStr}`
      : `Monthly on the ${day}${suffix}`;
  }

  return expression;
}

function timeAgo(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  const diffMonth = Math.floor(diffDay / 30);
  if (diffMonth < 12) return `${diffMonth}mo ago`;
  return `${Math.floor(diffMonth / 12)}y ago`;
}

function timeFromNow(isoString: string): string {
  const diffMs = new Date(isoString).getTime() - Date.now();
  if (diffMs <= 0) return 'overdue';
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'in <1m';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `in ${diffMin}m`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `in ${diffHour}h`;
  return `in ${Math.floor(diffHour / 24)}d`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TriggerBadge({ automation }: { automation: Automation }) {
  const { trigger } = automation;
  if (trigger.type === 'cron') {
    return (
      <div className="flex flex-col gap-0.5">
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="w-3 h-3 shrink-0" />
          {cronToHuman(trigger.expression)}
        </span>
        {automation.nextRunAt && (
          <span className="text-xs text-muted-foreground/60 pl-4">
            {timeFromNow(automation.nextRunAt)}
          </span>
        )}
      </div>
    );
  }
  if (trigger.type === 'event') {
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground font-mono">
        <Radio className="w-3 h-3" />
        {trigger.eventType}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground font-mono">
      <Webhook className="w-3 h-3" />
      {trigger.path}
    </span>
  );
}

function RunStatusBadge({ status }: { status?: AutomationRunStatus }) {
  if (!status) {
    return <span className="text-xs text-muted-foreground/60">Never run</span>;
  }
  const configs: Record<
    AutomationRunStatus,
    { icon: React.ReactNode; label: string; cls: string }
  > = {
    success: {
      icon: <CheckCircle2 className="w-3 h-3" />,
      label: 'Success',
      cls: 'text-green-500',
    },
    failure: {
      icon: <XCircle className="w-3 h-3" />,
      label: 'Failed',
      cls: 'text-destructive',
    },
    running: {
      icon: <Loader2 className="w-3 h-3 animate-spin" />,
      label: 'Running',
      cls: 'text-blue-500',
    },
    cancelled: {
      icon: <XCircle className="w-3 h-3" />,
      label: 'Cancelled',
      cls: 'text-muted-foreground',
    },
  };
  const cfg = configs[status];
  return (
    <span className={cn('flex items-center gap-1 text-xs', cfg.cls)}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

function modelLabel(automation: Automation): string {
  const { modelConfig } = automation;
  if (!modelConfig) return '—';
  const m = String(modelConfig.model);
  // Shorten known aliases
  if (m.includes('opus')) return 'Opus';
  if (m.includes('sonnet')) return 'Sonnet';
  if (m.includes('haiku')) return 'Haiku';
  return m;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AutomationsSection() {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAutomation, setEditingAutomation] = useState<Automation | null>(null);
  const [runningIds, setRunningIds] = useState<Set<string>>(new Set());
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);

  const fetchAutomations = useCallback(async () => {
    try {
      setError(null);
      const data = await listAutomations();
      setAutomations(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load automations');
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchAutomations();
      setLoading(false);
    })();
  }, [fetchAutomations]);

  const knownFlowIds = useMemo(() => {
    return Array.from(new Set(automations.map((a) => a.flowId).filter(Boolean)));
  }, [automations]);

  const enabledCount = useMemo(() => automations.filter((a) => a.enabled).length, [automations]);

  const handleToggle = async (automation: Automation, enabled: boolean) => {
    // Optimistic update
    setAutomations((prev) => prev.map((a) => (a.id === automation.id ? { ...a, enabled } : a)));
    try {
      await updateAutomation(automation.id, { enabled });
    } catch (err) {
      // Revert on error
      setAutomations((prev) =>
        prev.map((a) => (a.id === automation.id ? { ...a, enabled: !enabled } : a))
      );
      console.error('Failed to toggle automation:', err);
    }
  };

  const handleEdit = (automation: Automation) => {
    setEditingAutomation(automation);
    setModalOpen(true);
  };

  const handleCreate = () => {
    setEditingAutomation(null);
    setModalOpen(true);
  };

  const handleDelete = async (automation: Automation) => {
    if (!confirm(`Delete automation "${automation.name}"?`)) return;
    setAutomations((prev) => prev.filter((a) => a.id !== automation.id));
    try {
      await deleteAutomation(automation.id);
    } catch (err) {
      console.error('Failed to delete automation:', err);
      await fetchAutomations();
    }
  };

  const handleRunNow = async (automation: Automation) => {
    setRunningIds((prev) => new Set(prev).add(automation.id));
    try {
      await runAutomation(automation.id);
      await fetchAutomations();
    } catch (err) {
      console.error('Failed to run automation:', err);
    } finally {
      setRunningIds((prev) => {
        const next = new Set(prev);
        next.delete(automation.id);
        return next;
      });
    }
  };

  const handleSave = async (data: AutomationFormData) => {
    let trigger: Automation['trigger'];
    if (data.triggerType === 'cron') {
      trigger = { type: 'cron', expression: data.cronExpression };
    } else if (data.triggerType === 'event') {
      // Cast is safe: user can enter any event type string; server validates
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      trigger = { type: 'event', eventType: data.eventType as any };
    } else {
      trigger = { type: 'webhook', path: data.webhookPath };
    }

    if (editingAutomation) {
      await updateAutomation(editingAutomation.id, {
        name: data.name,
        description: data.description || undefined,
        trigger,
        flowId: data.flowId,
        enabled: data.enabled,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        modelConfig: data.modelConfig as unknown as Record<string, unknown>,
      });
    } else {
      await createAutomation({
        name: data.name,
        description: data.description || undefined,
        trigger,
        flowId: data.flowId,
        enabled: data.enabled,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        modelConfig: data.modelConfig as unknown as Record<string, unknown>,
      });
    }
    await fetchAutomations();
  };

  return (
    <div
      className={cn(
        'rounded-lg overflow-hidden',
        'border border-border/50',
        'bg-gradient-to-br from-card/90 via-card/70 to-card/80 backdrop-blur-xl',
        'shadow-sm shadow-black/5'
      )}
    >
      {/* Header */}
      <div className="p-4 border-b border-border/50 bg-gradient-to-r from-transparent via-accent/5 to-transparent">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-500/20 to-brand-600/10 flex items-center justify-center border border-brand-500/20">
              <Zap className="w-5 h-5 text-brand-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground tracking-tight">Automations</h2>
              <p className="text-sm text-muted-foreground/80">
                {loading ? (
                  'Trigger-based automations that run flows on schedule or in response to events'
                ) : (
                  <>
                    {enabledCount}/{automations.length} enabled &middot; trigger-based automations
                    that run flows on schedule or in response to events
                  </>
                )}
              </p>
            </div>
          </div>
          <Button onClick={handleCreate} size="sm" className="gap-2">
            <Plus className="w-4 h-4" />
            New Automation
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner className="w-6 h-6 text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="text-center py-8 text-destructive">
            <XCircle className="w-10 h-10 mx-auto mb-2 opacity-50" />
            <p className="text-sm">{error}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={fetchAutomations}>
              Retry
            </Button>
          </div>
        ) : automations.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <Zap className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="text-sm">No automations configured</p>
            <p className="text-xs mt-1">
              Create automations to run flows on a schedule or in response to events
            </p>
          </div>
        ) : (
          <div className="rounded-md border border-border/50 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/30 border-b border-border/50">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground w-[200px]">
                    Name
                  </th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">
                    Trigger
                  </th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden md:table-cell">
                    Flow
                  </th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden lg:table-cell">
                    Model
                  </th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden lg:table-cell">
                    Last Run
                  </th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">
                    Enabled
                  </th>
                  <th className="w-28 px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {automations.map((automation) => {
                  const isRunning = runningIds.has(automation.id);
                  const isHistoryExpanded = expandedHistoryId === automation.id;
                  return (
                    <React.Fragment key={automation.id}>
                      <tr
                        className={cn(
                          'hover:bg-muted/20 transition-colors',
                          !automation.enabled && 'opacity-60'
                        )}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            {automation.isBuiltIn && (
                              <Lock className="w-3 h-3 text-muted-foreground shrink-0" />
                            )}
                            <span
                              className="font-medium truncate max-w-[160px]"
                              title={automation.name}
                            >
                              {automation.name}
                            </span>
                          </div>
                          {automation.description && (
                            <p className="text-xs text-muted-foreground/70 mt-0.5 truncate max-w-[160px]">
                              {automation.description}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <TriggerBadge automation={automation} />
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <span className="font-mono text-xs text-muted-foreground truncate max-w-[140px] block">
                            {automation.flowId}
                          </span>
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          <span className="text-xs text-muted-foreground">
                            {modelLabel(automation)}
                          </span>
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          <div className="flex flex-col gap-0.5">
                            <RunStatusBadge status={automation.lastRunStatus} />
                            {automation.lastRunAt && (
                              <span className="text-xs text-muted-foreground/60">
                                {timeAgo(automation.lastRunAt)}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Switch
                            checked={automation.enabled}
                            onCheckedChange={(checked: boolean) =>
                              handleToggle(automation, checked)
                            }
                            aria-label={`${automation.enabled ? 'Disable' : 'Enable'} ${automation.name}`}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className={cn('h-7 w-7', isHistoryExpanded && 'text-brand-500')}
                              onClick={() =>
                                setExpandedHistoryId(isHistoryExpanded ? null : automation.id)
                              }
                              title="Toggle run history"
                            >
                              <History className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleRunNow(automation)}
                              disabled={isRunning}
                              title="Run now"
                            >
                              {isRunning ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Play className="w-3.5 h-3.5" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleEdit(automation)}
                              title="Edit automation"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            {!automation.isBuiltIn && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:text-destructive"
                                onClick={() => handleDelete(automation)}
                                title="Delete automation"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {isHistoryExpanded && (
                        <AutomationHistoryPanel automationId={automation.id} colSpan={7} />
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      <AutomationEditModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        automation={editingAutomation}
        knownFlowIds={knownFlowIds}
        onSave={handleSave}
      />
    </div>
  );
}
