import type { Meta, StoryObj } from '@storybook/react-vite';
import { ActivityTicker, IntegrationCard } from './activity-ticker';
import { StaggerContainer } from './glow-card';

const meta = {
  title: 'Dashboard/ActivityTicker',
  component: ActivityTicker,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ActivityTicker>;

export default meta;
type Story = StoryObj<typeof meta>;

const mockActivity = [
  {
    id: '1',
    icon: '',
    source: 'agent' as const,
    message: 'Feature "Ledger Types" completed by Sonnet',
    timestamp: '2m ago',
  },
  {
    id: '2',
    icon: '',
    source: 'github' as const,
    message: 'PR #474 merged: Graph Flow Roadmap',
    timestamp: '5m ago',
  },
  {
    id: '3',
    icon: '',
    source: 'discord' as const,
    message: 'Josh: "looks great, ship it"',
    timestamp: '8m ago',
  },
  {
    id: '4',
    icon: '',
    source: 'github' as const,
    message: 'Issue #142 moved to In Progress',
    timestamp: '12m ago',
  },
  {
    id: '5',
    icon: '',
    source: 'agent' as const,
    message: 'Auto-mode started: 3 features queued',
    timestamp: '15m ago',
  },
  {
    id: '6',
    icon: '',
    source: 'github' as const,
    message: 'CodeRabbit approved PR #473',
    timestamp: '18m ago',
  },
  {
    id: '7',
    icon: '',
    source: 'agent' as const,
    message: 'Feature "API Routes" escalated to Opus',
    timestamp: '22m ago',
  },
  {
    id: '8',
    icon: '',
    source: 'discord' as const,
    message: 'Ava: "All milestones complete"',
    timestamp: '30m ago',
  },
];

export const Default: Story = {
  args: {
    items: mockActivity,
    title: 'Activity Feed',
    maxItems: 8,
  },
};

export const ShortFeed: Story = {
  args: {
    items: mockActivity.slice(0, 3),
    title: 'Recent Activity',
    maxItems: 5,
  },
};

// IntegrationCard stories
export const DiscordIntegration: StoryObj = {
  render: () => (
    <div className="w-72">
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
    </div>
  ),
};

export const GitHubIntegration: StoryObj = {
  render: () => (
    <div className="w-72">
      <IntegrationCard
        name="GitHub"
        icon="🐙"
        connected={true}
        color="#238636"
        stats={[
          { label: 'Open PRs', value: 2 },
          { label: 'Merged Today', value: 6 },
          { label: 'CI Passing', value: '100%' },
          { label: 'Branches', value: 4 },
        ]}
      />
    </div>
  ),
};

export const DisconnectedIntegration: StoryObj = {
  render: () => (
    <div className="w-72">
      <IntegrationCard
        name="Slack"
        icon="📱"
        connected={false}
        color="#611f69"
        stats={[
          { label: 'Messages', value: '-' },
          { label: 'Channels', value: '-' },
          { label: 'Alerts', value: '-' },
          { label: 'Uptime', value: '-' },
        ]}
      />
    </div>
  ),
};

export const IntegrationGrid: StoryObj = {
  render: () => (
    <StaggerContainer className="grid grid-cols-3 gap-4 w-[800px]">
      <IntegrationCard
        name="Discord"
        icon="💬"
        connected={true}
        color="#5865F2"
        stats={[
          { label: 'Messages', value: 47 },
          { label: 'Channels', value: 3 },
        ]}
      />
      <IntegrationCard
        name="GitHub"
        icon="🐙"
        connected={true}
        color="#238636"
        stats={[
          { label: 'PRs', value: 2 },
          { label: 'Merged', value: 6 },
        ]}
      />
    </StaggerContainer>
  ),
};
