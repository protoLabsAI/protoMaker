/**
 * Button Component Stories
 *
 * Story pattern for Automaker UI components using CSF3 format:
 * - Default export defines component metadata
 * - Named exports define individual stories
 * - Each story showcases variants, sizes, and states (hover/focus/disabled)
 */

import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '@protolabs/ui/atoms';
import { Plus, Trash2, Download } from 'lucide-react';

const meta = {
  title: 'UI/Button',
  component: Button,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: [
        'default',
        'destructive',
        'outline',
        'secondary',
        'ghost',
        'link',
        'animated-outline',
      ],
      description: 'Visual style variant of the button',
    },
    size: {
      control: 'select',
      options: ['default', 'sm', 'lg', 'icon', 'icon-sm', 'icon-lg'],
      description: 'Size of the button',
    },
    loading: {
      control: 'boolean',
      description: 'Show loading spinner',
    },
    disabled: {
      control: 'boolean',
      description: 'Disable button interaction',
    },
    asChild: {
      control: 'boolean',
      description: 'Render as a Slot component for composition',
    },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

// Default button
export const Default: Story = {
  args: {
    children: 'Button',
    variant: 'default',
    size: 'default',
  },
};

// All variants showcase
export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4">
      <Button variant="default">Default</Button>
      <Button variant="destructive">Destructive</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="link">Link</Button>
      <Button variant="animated-outline">Animated</Button>
    </div>
  ),
};

// All sizes showcase
export const AllSizes: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-4">
      <Button size="sm">Small</Button>
      <Button size="default">Default</Button>
      <Button size="lg">Large</Button>
    </div>
  ),
};

// Icon buttons
export const IconButtons: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-4">
      <Button size="icon-sm" variant="outline">
        <Plus />
      </Button>
      <Button size="icon" variant="outline">
        <Plus />
      </Button>
      <Button size="icon-lg" variant="outline">
        <Plus />
      </Button>
    </div>
  ),
};

// Buttons with icons
export const WithIcons: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4">
      <Button>
        <Plus />
        Add Item
      </Button>
      <Button variant="destructive">
        <Trash2 />
        Delete
      </Button>
      <Button variant="outline">
        <Download />
        Download
      </Button>
    </div>
  ),
};

// Loading state
export const Loading: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4">
      <Button loading>Loading...</Button>
      <Button variant="outline" loading>
        Processing
      </Button>
      <Button variant="destructive" loading>
        Deleting...
      </Button>
    </div>
  ),
};

// Disabled state
export const Disabled: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4">
      <Button disabled>Disabled</Button>
      <Button variant="outline" disabled>
        Disabled Outline
      </Button>
      <Button variant="destructive" disabled>
        Disabled Destructive
      </Button>
    </div>
  ),
};

// Animated outline variant (special showcase)
export const AnimatedOutline: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <Button variant="animated-outline" size="default">
        Hover Me
      </Button>
      <Button variant="animated-outline" size="sm">
        Small Animated
      </Button>
      <Button variant="animated-outline" size="lg">
        Large Animated
      </Button>
    </div>
  ),
};

// Full width button
export const FullWidth: Story = {
  render: () => (
    <div className="w-80">
      <Button className="w-full">Full Width Button</Button>
    </div>
  ),
};
