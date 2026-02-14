import type { Meta, StoryObj } from '@storybook/react-vite';
import { DollarSign, Zap, Clock, CheckCircle2 } from 'lucide-react';
import { HeroStat } from './hero-stat';
import { StaggerContainer } from './glow-card';

const meta = {
  title: 'Dashboard/HeroStat',
  component: HeroStat,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof HeroStat>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TotalCost: Story = {
  args: {
    label: 'Total Cost',
    value: 42.5,
    prefix: '$',
    decimals: 2,
    icon: DollarSign,
    trend: -12.3,
    sparkline: [28, 32, 35, 30, 38, 42, 40, 45, 42],
    color: '#8b5cf6',
  },
};

export const Throughput: Story = {
  args: {
    label: 'Throughput',
    value: 8.3,
    suffix: '/day',
    decimals: 1,
    icon: Zap,
    trend: 23.5,
    sparkline: [3, 5, 4, 7, 6, 8, 9, 7, 8],
    color: '#10b981',
  },
};

export const CycleTime: Story = {
  args: {
    label: 'Avg Cycle Time',
    value: 14,
    suffix: 'm',
    icon: Clock,
    trend: -8.2,
    sparkline: [22, 18, 20, 16, 15, 14, 13, 14, 14],
    color: '#06b6d4',
  },
};

export const SuccessRate: Story = {
  args: {
    label: 'Success Rate',
    value: 97,
    suffix: '%',
    icon: CheckCircle2,
    trend: 2.1,
    sparkline: [88, 90, 92, 91, 94, 96, 95, 97, 97],
    color: '#f59e0b',
  },
};

export const KPIRow: StoryObj = {
  render: () => (
    <StaggerContainer className="grid grid-cols-4 gap-4 w-[900px]">
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
  ),
};
