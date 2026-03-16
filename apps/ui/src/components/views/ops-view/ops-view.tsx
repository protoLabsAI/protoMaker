/**
 * Ops View
 *
 * Main operations dashboard with four tab panels:
 * - Timers: all registered cron and interval timers with pause/resume
 * - Events: webhook delivery log with retry capability
 * - Maintenance: server environment and health details
 * - System: real-time resource monitoring and agent status
 */

import { useState } from 'react';
import { Settings2, Timer, Webhook, Server, Activity } from 'lucide-react';
import { PanelHeader } from '@/components/shared/panel-header';
import { cn } from '@/lib/utils';
import { TimerPanel } from './timer-panel';
import { EventFlowPanel } from './event-flow-panel';
import { MaintenancePanel } from './maintenance-panel';
import { SystemHealthPanel } from './system-health-panel';

// ============================================================================
// Types
// ============================================================================

type OpsTab = 'timers' | 'events' | 'maintenance' | 'system';

interface TabDefinition {
  id: OpsTab;
  label: string;
  icon: typeof Timer;
}

// ============================================================================
// Constants
// ============================================================================

const TABS: TabDefinition[] = [
  { id: 'timers', label: 'Timers', icon: Timer },
  { id: 'events', label: 'Events', icon: Webhook },
  { id: 'maintenance', label: 'Maintenance', icon: Server },
  { id: 'system', label: 'System', icon: Activity },
];

// ============================================================================
// Sub-components
// ============================================================================

interface TabButtonProps {
  tab: TabDefinition;
  isActive: boolean;
  onClick: () => void;
}

function TabButton({ tab, isActive, onClick }: TabButtonProps) {
  const Icon = tab.icon;
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200',
        isActive
          ? 'bg-primary text-primary-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground hover:bg-accent'
      )}
      aria-selected={isActive}
      role="tab"
    >
      <Icon className="h-3.5 w-3.5" />
      {tab.label}
    </button>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function OpsView() {
  const [activeTab, setActiveTab] = useState<OpsTab>('system');

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PanelHeader icon={Settings2} title="Operations" />

      {/* Tab bar */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-border/50" role="tablist">
        {TABS.map((tab) => (
          <TabButton
            key={tab.id}
            tab={tab}
            isActive={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
          />
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto px-4 py-4" role="tabpanel">
        {activeTab === 'timers' && <TimerPanel />}
        {activeTab === 'events' && <EventFlowPanel />}
        {activeTab === 'maintenance' && <MaintenancePanel />}
        {activeTab === 'system' && <SystemHealthPanel />}
      </div>
    </div>
  );
}
