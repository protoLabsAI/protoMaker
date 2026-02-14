import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { BarChart3, Plug, Activity, DollarSign, Zap, Clock, CheckCircle2 } from 'lucide-react';
import { AnimatedTabs } from './animated-tabs';
import { HeroStat } from './hero-stat';
import { GlowAreaChart } from './glow-area-chart';
import { GlowDonut } from './glow-donut';
import { ActivityTicker, IntegrationCard } from './activity-ticker';
import { Gauge, FlowStatus, CapacityBar } from './system-health';
import { GlowCard, StaggerContainer } from './glow-card';
import { LiveIndicator } from './animated-counter';

// ─── Mock Data ───────────────────────────────────────────────

const costTimeSeries = [
  { name: 'Feb 7', cost: 3.2, haiku: 0.4 },
  { name: 'Feb 8', cost: 5.8, haiku: 0.8 },
  { name: 'Feb 9', cost: 8.1, haiku: 1.1 },
  { name: 'Feb 10', cost: 12.3, haiku: 1.6 },
  { name: 'Feb 11', cost: 6.5, haiku: 0.9 },
  { name: 'Feb 12', cost: 9.7, haiku: 1.3 },
  { name: 'Feb 13', cost: 7.4, haiku: 1.0 },
  { name: 'Feb 14', cost: 4.2, haiku: 0.5 },
];

const throughputTimeSeries = [
  { name: 'Feb 7', features: 8 },
  { name: 'Feb 8', features: 12 },
  { name: 'Feb 9', features: 15 },
  { name: 'Feb 10', features: 22 },
  { name: 'Feb 11', features: 18 },
  { name: 'Feb 12', features: 24 },
  { name: 'Feb 13', features: 20 },
  { name: 'Feb 14', features: 14 },
];

const successTimeSeries = [
  { name: 'Feb 7', rate: 82, failures: 18 },
  { name: 'Feb 8', rate: 88, failures: 12 },
  { name: 'Feb 9', rate: 85, failures: 15 },
  { name: 'Feb 10', rate: 92, failures: 8 },
  { name: 'Feb 11', rate: 94, failures: 6 },
  { name: 'Feb 12', rate: 91, failures: 9 },
  { name: 'Feb 13', rate: 96, failures: 4 },
  { name: 'Feb 14', rate: 97, failures: 3 },
];

const mockActivity = [
  {
    id: '1',
    icon: '',
    source: 'agent' as const,
    message: 'Feature "Ledger Types" completed by Sonnet',
    timestamp: '2m',
  },
  {
    id: '2',
    icon: '',
    source: 'github' as const,
    message: 'PR #474 merged: Graph Flow Roadmap',
    timestamp: '5m',
  },
  {
    id: '3',
    icon: '',
    source: 'discord' as const,
    message: 'Josh: "looks great, ship it"',
    timestamp: '8m',
  },
  {
    id: '4',
    icon: '',
    source: 'linear' as const,
    message: 'Issue AVM-142 moved to In Progress',
    timestamp: '12m',
  },
  {
    id: '5',
    icon: '',
    source: 'agent' as const,
    message: 'Auto-mode started: 3 features queued',
    timestamp: '15m',
  },
  {
    id: '6',
    icon: '',
    source: 'github' as const,
    message: 'CodeRabbit approved PR #473',
    timestamp: '18m',
  },
  {
    id: '7',
    icon: '',
    source: 'agent' as const,
    message: 'Feature "API Routes" escalated to Opus',
    timestamp: '22m',
  },
  {
    id: '8',
    icon: '',
    source: 'discord' as const,
    message: 'Ava: "All milestones complete"',
    timestamp: '30m',
  },
];

// ─── Tab Content Components ──────────────────────────────────

function ProjectTab() {
  return (
    <div className="space-y-6">
      {/* KPI Row */}
      <StaggerContainer className="grid grid-cols-4 gap-4">
        <HeroStat
          label="Total Cost"
          value={42.5}
          prefix="$"
          decimals={2}
          icon={DollarSign}
          trend={-12.3}
          sparkline={[28, 32, 35, 30, 38, 42, 40, 45, 42]}
          color="#8b5cf6"
        />
        <HeroStat
          label="Features Done"
          value={199}
          icon={CheckCircle2}
          trend={15.0}
          sparkline={[120, 135, 140, 155, 168, 175, 185, 192, 199]}
          color="#10b981"
        />
        <HeroStat
          label="Throughput"
          value={8.3}
          suffix="/day"
          decimals={1}
          icon={Zap}
          trend={23.5}
          sparkline={[3, 5, 4, 7, 6, 8, 9, 7, 8]}
          color="#f59e0b"
        />
        <HeroStat
          label="Avg Cycle Time"
          value={14}
          suffix="m"
          icon={Clock}
          trend={-8.2}
          sparkline={[22, 18, 20, 16, 15, 14, 13, 14, 14]}
          color="#06b6d4"
        />
      </StaggerContainer>

      {/* Charts Row 1: Cost + Throughput */}
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2">
          <GlowAreaChart
            title="Cost Burn"
            subtitle="Daily API spend by model"
            data={costTimeSeries}
            dataKey="cost"
            color="#8b5cf6"
            secondaryDataKey="haiku"
            secondaryColor="#10b981"
            formatValue={(v) => `$${v.toFixed(2)}`}
          />
        </div>
        <GlowAreaChart
          title="Throughput"
          subtitle="Features completed / day"
          data={throughputTimeSeries}
          dataKey="features"
          color="#10b981"
        />
      </div>

      {/* Charts Row 2: Model Pie + Success Rate */}
      <div className="grid grid-cols-2 gap-4">
        <GlowDonut
          title="Model Distribution"
          data={[
            { name: 'Sonnet', value: 32.5, color: '#8b5cf6' },
            { name: 'Opus', value: 8.2, color: '#f59e0b' },
            { name: 'Haiku', value: 1.8, color: '#10b981' },
          ]}
          centerValue="$42.50"
          centerLabel="Total Cost"
          formatValue={(v) => `$${v.toFixed(2)}`}
        />
        <GlowAreaChart
          title="Success Rate"
          subtitle="First-pass completion %"
          data={successTimeSeries}
          dataKey="rate"
          color="#10b981"
          secondaryDataKey="failures"
          secondaryColor="#ef4444"
          formatValue={(v) => `${v}%`}
        />
      </div>
    </div>
  );
}

function IntegrationsTab() {
  return (
    <div className="space-y-6">
      {/* Integration Cards */}
      <StaggerContainer className="grid grid-cols-3 gap-4">
        <IntegrationCard
          name="Discord"
          icon="💬"
          connected={true}
          color="#5865F2"
          stats={[
            { label: 'Messages Today', value: 47 },
            { label: 'Active Channels', value: 3 },
            { label: 'Alerts Sent', value: 12 },
            { label: 'Uptime', value: '99.9%' },
          ]}
        />
        <IntegrationCard
          name="Linear"
          icon="📐"
          connected={true}
          color="#5E6AD2"
          stats={[
            { label: 'Open Issues', value: 8 },
            { label: 'In Progress', value: 3 },
            { label: 'Closed Today', value: 5 },
            { label: 'Cycles Active', value: 1 },
          ]}
        />
        <IntegrationCard
          name="GitHub"
          icon="🐙"
          connected={true}
          color="#238636"
          stats={[
            { label: 'Open PRs', value: 2 },
            { label: 'Merged Today', value: 6 },
            { label: 'CI Passing', value: '100%' },
            { label: 'Active Branches', value: 4 },
          ]}
        />
      </StaggerContainer>

      {/* Activity Feed */}
      <div className="grid grid-cols-2 gap-4">
        <ActivityTicker items={mockActivity} title="Cross-Platform Activity" maxItems={8} />
        <GlowCard orb="none" className="p-5">
          <h3 className="text-sm font-semibold mb-3">Agent Sessions</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <LiveIndicator color="green" label="Sonnet" />
              </div>
              <span className="text-xs text-muted-foreground tabular-nums">
                Working on "Ledger Types"
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <LiveIndicator color="blue" label="Haiku" />
              </div>
              <span className="text-xs text-muted-foreground tabular-nums">Reviewing PR #475</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <LiveIndicator color="amber" label="Opus" />
              </div>
              <span className="text-xs text-muted-foreground tabular-nums">
                Idle - awaiting work
              </span>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-white/5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Total Sessions Today</span>
              <span className="font-medium">24</span>
            </div>
            <div className="flex items-center justify-between text-xs mt-1">
              <span className="text-muted-foreground">Avg Duration</span>
              <span className="font-medium">8.5m</span>
            </div>
            <div className="flex items-center justify-between text-xs mt-1">
              <span className="text-muted-foreground">Success Rate</span>
              <span className="font-medium text-emerald-400">97%</span>
            </div>
          </div>
        </GlowCard>
      </div>
    </div>
  );
}

function SystemTab() {
  return (
    <div className="space-y-6">
      {/* Health Gauges */}
      <StaggerContainer className="grid grid-cols-3 gap-4">
        <GlowCard orb="none" className="p-5 col-span-2">
          <h3 className="text-sm font-semibold mb-4">Server Health</h3>
          <div className="flex items-center justify-around">
            <Gauge value={42} max={100} label="Memory" size={110} />
            <Gauge value={28} max={100} label="CPU" size={110} />
            <Gauge
              value={3.2}
              max={8}
              label="Heap"
              unit="GB"
              size={110}
              thresholds={{ warn: 5, critical: 7 }}
            />
            <Gauge
              value={2}
              max={3}
              label="Agents"
              unit=""
              size={110}
              thresholds={{ warn: 2, critical: 3 }}
            />
          </div>
        </GlowCard>

        <GlowCard orb="none" className="p-5">
          <h3 className="text-sm font-semibold mb-4">Capacity</h3>
          <div className="space-y-4">
            <CapacityBar label="Agent Slots" current={2} max={3} color="#8b5cf6" />
            <CapacityBar label="Worktrees" current={4} max={10} color="#06b6d4" />
            <CapacityBar label="Queue Depth" current={0} max={20} color="#f59e0b" />
          </div>
        </GlowCard>
      </StaggerContainer>

      {/* Flow Status + Uptime */}
      <div className="grid grid-cols-2 gap-4">
        <FlowStatus
          flows={[
            { name: 'Auto-Mode', status: 'active', avgLatencyMs: 120 },
            { name: 'PR Maintainer', status: 'active', avgLatencyMs: 85 },
            { name: 'Board Janitor', status: 'active', avgLatencyMs: 45 },
            { name: 'Frank (Health)', status: 'active', avgLatencyMs: 32 },
            { name: 'GTM Content', status: 'idle' },
            { name: 'Linear Sync', status: 'active', avgLatencyMs: 210 },
          ]}
        />
        <GlowCard orb="bottom-left" orbColor="#10b981" className="p-5">
          <h3 className="text-sm font-semibold mb-3">Uptime</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Dev Server</span>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-emerald-400">99.8%</span>
                <LiveIndicator color="green" />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Staging</span>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-emerald-400">99.9%</span>
                <LiveIndicator color="green" />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">CI Runner</span>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-emerald-400">100%</span>
                <LiveIndicator color="green" />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Discord Bot</span>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-emerald-400">99.7%</span>
                <LiveIndicator color="green" />
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-white/5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Last Restart</span>
              <span className="font-medium">2h 14m ago</span>
            </div>
            <div className="flex items-center justify-between text-xs mt-1">
              <span className="text-muted-foreground">Version</span>
              <span className="font-medium">v0.14.0</span>
            </div>
          </div>
        </GlowCard>
      </div>
    </div>
  );
}

// ─── Full Dashboard Story ────────────────────────────────────

function FullDashboard() {
  const [activeTab, setActiveTab] = useState('project');

  const tabs = [
    { id: 'project', label: 'Project', icon: BarChart3 },
    { id: 'integrations', label: 'Integrations', icon: Plug },
    { id: 'system', label: 'System', icon: Activity },
  ];

  const tabContent: Record<string, React.ReactNode> = {
    project: <ProjectTab />,
    integrations: <IntegrationsTab />,
    system: <SystemTab />,
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">protoLabs Studio</p>
        </div>
        <LiveIndicator color="green" label="All systems operational" />
      </div>

      <AnimatedTabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab}>
        {tabContent[activeTab]}
      </AnimatedTabs>
    </div>
  );
}

const meta = {
  title: 'Dashboard/Full Dashboard',
  component: FullDashboard,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof FullDashboard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div className="p-8">
      <FullDashboard />
    </div>
  ),
};
