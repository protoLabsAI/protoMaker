import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { BarChart3, Plug, Activity } from 'lucide-react';
import { AnimatedTabs } from './animated-tabs';

const meta = {
  title: 'Dashboard/AnimatedTabs',
  component: AnimatedTabs,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof AnimatedTabs>;

export default meta;
type Story = StoryObj<typeof meta>;

function TabsDemo() {
  const [active, setActive] = useState('project');

  const tabs = [
    { id: 'project', label: 'Project', icon: BarChart3 },
    { id: 'integrations', label: 'Integrations', icon: Plug },
    { id: 'system', label: 'System', icon: Activity },
  ];

  const content: Record<string, React.ReactNode> = {
    project: (
      <div className="p-6 rounded-lg bg-muted/20 border border-white/5">
        <h3 className="text-lg font-semibold mb-2">Project Metrics</h3>
        <p className="text-sm text-muted-foreground">
          Feature throughput, cost burn, success rates, cycle time distributions.
        </p>
      </div>
    ),
    integrations: (
      <div className="p-6 rounded-lg bg-muted/20 border border-white/5">
        <h3 className="text-lg font-semibold mb-2">Integrations</h3>
        <p className="text-sm text-muted-foreground">
          Discord activity, Linear issues, GitHub PRs, agent sessions.
        </p>
      </div>
    ),
    system: (
      <div className="p-6 rounded-lg bg-muted/20 border border-white/5">
        <h3 className="text-lg font-semibold mb-2">System Health</h3>
        <p className="text-sm text-muted-foreground">
          Server memory, agent capacity, flow status, auto-mode health.
        </p>
      </div>
    ),
  };

  return (
    <AnimatedTabs tabs={tabs} activeTab={active} onTabChange={setActive}>
      {content[active]}
    </AnimatedTabs>
  );
}

export const ThreeTabs: Story = {
  render: () => <TabsDemo />,
};

function TwoTabDemo() {
  const [active, setActive] = useState('overview');
  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'details', label: 'Details' },
  ];

  return (
    <AnimatedTabs tabs={tabs} activeTab={active} onTabChange={setActive}>
      <div className="p-6 rounded-lg bg-muted/20 border border-white/5">
        <h3 className="text-lg font-semibold">{active === 'overview' ? 'Overview' : 'Details'}</h3>
        <p className="text-sm text-muted-foreground mt-2">
          Content crossfades when switching tabs.
        </p>
      </div>
    </AnimatedTabs>
  );
}

export const TextOnly: Story = {
  render: () => <TwoTabDemo />,
};
