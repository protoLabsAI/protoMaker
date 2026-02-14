import type { Meta, StoryObj } from '@storybook/react-vite';
import { GlowAreaChart } from './glow-area-chart';

const meta = {
  title: 'Dashboard/GlowAreaChart',
  component: GlowAreaChart,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof GlowAreaChart>;

export default meta;
type Story = StoryObj<typeof meta>;

const costData = [
  { name: 'Mon', cost: 3.2, haiku: 0.4 },
  { name: 'Tue', cost: 5.8, haiku: 0.8 },
  { name: 'Wed', cost: 4.1, haiku: 0.5 },
  { name: 'Thu', cost: 8.3, haiku: 1.2 },
  { name: 'Fri', cost: 6.5, haiku: 0.9 },
  { name: 'Sat', cost: 2.1, haiku: 0.3 },
  { name: 'Sun', cost: 4.7, haiku: 0.7 },
];

export const CostBurn: Story = {
  args: {
    title: 'Cost Burn',
    subtitle: 'Daily API spend',
    data: costData,
    dataKey: 'cost',
    color: '#8b5cf6',
    formatValue: (v: number) => `$${v.toFixed(2)}`,
    height: 260,
  },
};

export const DualSeries: Story = {
  args: {
    title: 'Cost by Model',
    subtitle: 'Sonnet vs Haiku',
    data: costData,
    dataKey: 'cost',
    color: '#8b5cf6',
    secondaryDataKey: 'haiku',
    secondaryColor: '#10b981',
    formatValue: (v: number) => `$${v.toFixed(2)}`,
    height: 260,
  },
};

const throughputData = [
  { name: 'W1', features: 12 },
  { name: 'W2', features: 18 },
  { name: 'W3', features: 15 },
  { name: 'W4', features: 24 },
  { name: 'W5', features: 32 },
  { name: 'W6', features: 28 },
  { name: 'W7', features: 35 },
  { name: 'W8', features: 41 },
];

export const Throughput: Story = {
  args: {
    title: 'Feature Throughput',
    subtitle: 'Weekly completions',
    data: throughputData,
    dataKey: 'features',
    color: '#10b981',
    height: 260,
  },
};

const successData = [
  { name: 'W1', rate: 78, failures: 22 },
  { name: 'W2', rate: 82, failures: 18 },
  { name: 'W3', rate: 85, failures: 15 },
  { name: 'W4', rate: 88, failures: 12 },
  { name: 'W5', rate: 91, failures: 9 },
  { name: 'W6', rate: 93, failures: 7 },
  { name: 'W7', rate: 96, failures: 4 },
  { name: 'W8', rate: 97, failures: 3 },
];

export const SuccessRate: Story = {
  args: {
    title: 'Success Rate',
    subtitle: 'First-pass completion %',
    data: successData,
    dataKey: 'rate',
    color: '#10b981',
    secondaryDataKey: 'failures',
    secondaryColor: '#ef4444',
    formatValue: (v: number) => `${v}%`,
    height: 260,
  },
};
