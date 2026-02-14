import type { Meta, StoryObj } from '@storybook/react-vite';
import { AnimatedCounter, LiveIndicator, Sparkline } from './animated-counter';

const meta = {
  title: 'Dashboard/AnimatedCounter',
  component: AnimatedCounter,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof AnimatedCounter>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    value: 1234,
    className: 'text-3xl font-bold',
  },
};

export const WithPrefix: Story = {
  args: {
    value: 42.5,
    prefix: '$',
    decimals: 2,
    className: 'text-4xl font-bold',
  },
};

export const WithSuffix: Story = {
  args: {
    value: 97,
    suffix: '%',
    className: 'text-3xl font-bold text-emerald-400',
  },
};

export const LargeNumber: Story = {
  args: {
    value: 199,
    prefix: '',
    suffix: ' features',
    className: 'text-5xl font-bold tracking-tight',
  },
};

// LiveIndicator stories
export const LiveIndicators: StoryObj = {
  render: () => (
    <div className="flex flex-col gap-4">
      <LiveIndicator color="green" label="Live" />
      <LiveIndicator color="blue" label="Syncing" />
      <LiveIndicator color="amber" label="Warning" />
      <LiveIndicator color="red" label="Error" />
    </div>
  ),
};

// Sparkline stories
export const SparklineVariants: StoryObj = {
  render: () => (
    <div className="flex flex-col gap-6 w-60">
      <div>
        <p className="text-xs text-muted-foreground mb-1">Uptrend</p>
        <Sparkline data={[2, 4, 3, 8, 6, 12, 9, 15, 14, 18]} color="#10b981" height={32} />
      </div>
      <div>
        <p className="text-xs text-muted-foreground mb-1">Volatile</p>
        <Sparkline data={[10, 3, 12, 5, 15, 2, 18, 7, 14, 9]} color="#8b5cf6" height={32} />
      </div>
      <div>
        <p className="text-xs text-muted-foreground mb-1">Downtrend</p>
        <Sparkline data={[20, 18, 15, 14, 10, 9, 7, 5, 3, 2]} color="#ef4444" height={32} />
      </div>
    </div>
  ),
};
