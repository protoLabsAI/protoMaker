import type { Meta, StoryObj } from '@storybook/react-vite';
import { Gauge, FlowStatus, CapacityBar } from './system-health';
import { GlowCard, StaggerContainer } from './glow-card';

const meta = {
  title: 'Dashboard/SystemHealth',
  component: Gauge,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof Gauge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const GaugeHealthy: Story = {
  args: {
    value: 45,
    max: 100,
    label: 'Memory',
    unit: '%',
    size: 120,
  },
};

export const GaugeWarning: Story = {
  args: {
    value: 75,
    max: 100,
    label: 'CPU',
    unit: '%',
    size: 120,
  },
};

export const GaugeCritical: Story = {
  args: {
    value: 95,
    max: 100,
    label: 'Heap',
    unit: '%',
    size: 120,
  },
};

export const GaugeRow: StoryObj = {
  render: () => (
    <GlowCard orb="none" className="p-6">
      <h3 className="text-sm font-semibold mb-4">Server Health</h3>
      <div className="flex items-center justify-around gap-6">
        <Gauge value={42} max={100} label="Memory" size={110} />
        <Gauge value={68} max={100} label="CPU" size={110} />
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
  ),
};

export const FlowStatusActive: StoryObj = {
  render: () => (
    <div className="w-80">
      <FlowStatus
        flows={[
          { name: 'Auto-Mode', status: 'active', avgLatencyMs: 120 },
          { name: 'PR Maintainer', status: 'active', avgLatencyMs: 85 },
          { name: 'Board Janitor', status: 'active', avgLatencyMs: 45 },
          { name: 'Frank (Health)', status: 'active', avgLatencyMs: 32 },
          { name: 'GTM Content', status: 'idle' },
          { name: 'Linear Sync', status: 'error', avgLatencyMs: 5200 },
        ]}
      />
    </div>
  ),
};

export const FlowStatusAllIdle: StoryObj = {
  render: () => (
    <div className="w-80">
      <FlowStatus
        flows={[
          { name: 'Auto-Mode', status: 'idle' },
          { name: 'PR Maintainer', status: 'idle' },
          { name: 'Board Janitor', status: 'idle' },
          { name: 'Frank (Health)', status: 'idle' },
        ]}
      />
    </div>
  ),
};

export const CapacityBars: StoryObj = {
  render: () => (
    <GlowCard orb="none" className="p-6 w-80">
      <h3 className="text-sm font-semibold mb-4">Capacity</h3>
      <div className="space-y-4">
        <CapacityBar label="Agent Slots" current={2} max={3} color="#8b5cf6" />
        <CapacityBar label="Worktrees" current={4} max={10} color="#06b6d4" />
        <CapacityBar label="Queue Depth" current={7} max={20} color="#f59e0b" />
        <CapacityBar label="Disk Usage" current={85} max={100} color="#ef4444" />
      </div>
    </GlowCard>
  ),
};

export const SystemOverview: StoryObj = {
  render: () => (
    <StaggerContainer className="grid grid-cols-3 gap-4 w-[900px]">
      {/* Gauges */}
      <GlowCard orb="none" className="p-5 col-span-2">
        <h3 className="text-sm font-semibold mb-4">Server Health</h3>
        <div className="flex items-center justify-around">
          <Gauge value={42} max={100} label="Memory" size={100} />
          <Gauge value={68} max={100} label="CPU" size={100} />
          <Gauge
            value={3.2}
            max={8}
            label="Heap"
            unit="GB"
            size={100}
            thresholds={{ warn: 5, critical: 7 }}
          />
        </div>
      </GlowCard>

      {/* Capacity */}
      <GlowCard orb="none" className="p-5">
        <h3 className="text-sm font-semibold mb-4">Capacity</h3>
        <div className="space-y-3">
          <CapacityBar label="Agents" current={2} max={3} color="#8b5cf6" />
          <CapacityBar label="Worktrees" current={4} max={10} color="#06b6d4" />
          <CapacityBar label="Queue" current={7} max={20} color="#f59e0b" />
        </div>
      </GlowCard>

      {/* Flows */}
      <div className="col-span-3">
        <FlowStatus
          flows={[
            { name: 'Auto-Mode', status: 'active', avgLatencyMs: 120 },
            { name: 'PR Maintainer', status: 'active', avgLatencyMs: 85 },
            { name: 'Board Janitor', status: 'active', avgLatencyMs: 45 },
            { name: 'Frank (Health)', status: 'active', avgLatencyMs: 32 },
            { name: 'GTM Content', status: 'idle' },
            { name: 'Linear Sync', status: 'error', avgLatencyMs: 5200 },
          ]}
        />
      </div>
    </StaggerContainer>
  ),
};
