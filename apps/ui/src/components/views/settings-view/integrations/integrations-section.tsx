import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Plug, RefreshCw } from 'lucide-react';
import { Button, Spinner } from '@protolabsai/ui/atoms';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api-fetch';
import type { IntegrationSummary } from '@protolabsai/types';
import { IntegrationCard } from './integration-card';
import { IntegrationConfigDialog } from './integration-config-dialog';
import { SignalsPanel } from './signals-panel';

type ActiveTab = 'integrations' | 'signals';

const CATEGORY_LABELS: Record<string, string> = {
  communication: 'Communication',
  'project-mgmt': 'Project Management',
  'source-control': 'Source Control',
  streaming: 'Streaming',
  'ai-provider': 'AI Providers',
  tooling: 'Tooling',
  observability: 'Observability',
};

export function IntegrationsSection() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('integrations');
  const [integrations, setIntegrations] = useState<IntegrationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configDialogId, setConfigDialogId] = useState<string | null>(null);

  const fetchIntegrations = useCallback(async () => {
    try {
      setError(null);
      const res = await apiFetch('/api/integrations/registry/list', 'POST', { body: {} });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data = await res.json();
      setIntegrations(data.integrations ?? []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch integrations';
      setError(msg);
      console.error('Failed to fetch integrations:', err);
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchIntegrations();
      setLoading(false);
    })();
  }, [fetchIntegrations]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchIntegrations();
    setRefreshing(false);
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    try {
      const res = await apiFetch('/api/integrations/registry/toggle', 'POST', {
        body: { id, enabled },
      });
      if (!res.ok) throw new Error(`Toggle failed: ${res.status}`);
      // Optimistic update
      setIntegrations((prev) => prev.map((i) => (i.id === id ? { ...i, enabled } : i)));
    } catch (err) {
      console.error('Failed to toggle integration:', err);
      // Revert on failure
      await fetchIntegrations();
    }
  };

  // Group by category
  const grouped = integrations.reduce<Record<string, IntegrationSummary[]>>((acc, integration) => {
    const cat = integration.category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(integration);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Plug className="w-5 h-5 text-zinc-500" />
          <h2 className="text-lg font-semibold">Integrations</h2>
        </div>
        {activeTab === 'integrations' && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
            className="gap-1.5"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        )}
      </div>

      <div className="flex items-center gap-1 border-b border-zinc-200 dark:border-zinc-800">
        {(['integrations', 'signals'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'px-4 py-2 text-sm font-medium capitalize border-b-2 -mb-px transition-colors',
              activeTab === tab
                ? 'border-zinc-900 dark:border-zinc-100 text-zinc-900 dark:text-zinc-100'
                : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
            )}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {activeTab === 'integrations' && (
        <>
          <p className="text-sm text-zinc-500">
            Manage external connections for Discord, GitHub, and more.
          </p>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Spinner />
            </div>
          ) : (
            <div className="space-y-8">
              {Object.entries(grouped).map(([category, items]) => (
                <div key={category} className="space-y-3">
                  <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                    {CATEGORY_LABELS[category] ?? category}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {items.map((integration) => (
                      <IntegrationCard
                        key={integration.id}
                        integration={integration}
                        onToggle={handleToggle}
                        onConfigure={setConfigDialogId}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <IntegrationConfigDialog
            integrationId={configDialogId}
            open={configDialogId !== null}
            onOpenChange={(open) => {
              if (!open) setConfigDialogId(null);
            }}
            onSaved={fetchIntegrations}
          />
        </>
      )}

      {activeTab === 'signals' && <SignalsPanel />}
    </div>
  );
}
