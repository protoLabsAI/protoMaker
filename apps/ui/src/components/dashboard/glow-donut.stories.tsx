import type { Meta, StoryObj } from '@storybook/react-vite';
import { GlowDonut } from './glow-donut';

const meta = {
  title: 'Dashboard/GlowDonut',
  component: GlowDonut,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof GlowDonut>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ModelDistribution: Story = {
  args: {
    title: 'Model Distribution',
    data: [
      { name: 'Sonnet', value: 32.5, color: '#8b5cf6' },
      { name: 'Opus', value: 8.2, color: '#f59e0b' },
      { name: 'Haiku', value: 1.8, color: '#10b981' },
    ],
    centerValue: '$42.50',
    centerLabel: 'Total Cost',
    formatValue: (v: number) => `$${v.toFixed(2)}`,
    height: 220,
  },
};

export const FeaturesByStatus: Story = {
  args: {
    title: 'Features by Status',
    data: [
      { name: 'Done', value: 199, color: '#10b981' },
      { name: 'In Progress', value: 3, color: '#8b5cf6' },
      { name: 'Review', value: 5, color: '#f59e0b' },
      { name: 'Backlog', value: 12, color: '#64748b' },
    ],
    centerValue: '219',
    centerLabel: 'Total',
    height: 220,
  },
};

export const TokenUsage: Story = {
  args: {
    title: 'Token Usage',
    data: [
      { name: 'Input', value: 2400000, color: '#06b6d4' },
      { name: 'Output', value: 850000, color: '#ec4899' },
    ],
    centerValue: '3.2M',
    centerLabel: 'Total Tokens',
    formatValue: (v: number) => `${(v / 1000000).toFixed(1)}M`,
    height: 220,
  },
};

export const ProjectCostBreakdown: Story = {
  args: {
    title: 'Cost by Project',
    data: [
      { name: 'Agency System', value: 18.4, color: '#8b5cf6' },
      { name: 'Escalation', value: 12.1, color: '#06b6d4' },
      { name: 'Linear Sync', value: 7.3, color: '#f59e0b' },
      { name: 'Other', value: 4.7, color: '#64748b' },
    ],
    formatValue: (v: number) => `$${v.toFixed(2)}`,
    height: 220,
  },
};
