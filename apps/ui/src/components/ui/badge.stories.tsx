/**
 * Badge Component Stories
 *
 * Story pattern for Automaker UI components using CSF3 format:
 * - Default export defines component metadata
 * - Named exports define individual stories
 * - Each story showcases variants, sizes, and states
 */

import type { Meta, StoryObj } from '@storybook/react-vite';
import { Badge } from '@protolabs/ui/atoms';

const meta = {
  title: 'UI/Badge',
  component: Badge,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: [
        'default',
        'secondary',
        'destructive',
        'outline',
        'success',
        'warning',
        'error',
        'info',
        'muted',
        'brand',
      ],
      description: 'Visual style variant of the badge',
    },
    size: {
      control: 'select',
      options: ['default', 'sm', 'lg'],
      description: 'Size of the badge',
    },
  },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

// Default badge
export const Default: Story = {
  args: {
    children: 'Badge',
    variant: 'default',
    size: 'default',
  },
};

// All variants showcase
export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      <Badge variant="default">Default</Badge>
      <Badge variant="secondary">Secondary</Badge>
      <Badge variant="destructive">Destructive</Badge>
      <Badge variant="outline">Outline</Badge>
      <Badge variant="brand">Brand</Badge>
      <Badge variant="muted">Muted</Badge>
    </div>
  ),
};

// Status variants (semantic colors)
export const StatusVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      <Badge variant="success">Success</Badge>
      <Badge variant="warning">Warning</Badge>
      <Badge variant="error">Error</Badge>
      <Badge variant="info">Info</Badge>
    </div>
  ),
};

// All sizes showcase
export const AllSizes: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Badge size="sm">Small</Badge>
      <Badge size="default">Default</Badge>
      <Badge size="lg">Large</Badge>
    </div>
  ),
};

// Size comparison across variants
export const SizesByVariant: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="default" size="sm">
          Small
        </Badge>
        <Badge variant="default" size="default">
          Default
        </Badge>
        <Badge variant="default" size="lg">
          Large
        </Badge>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="brand" size="sm">
          Small
        </Badge>
        <Badge variant="brand" size="default">
          Default
        </Badge>
        <Badge variant="brand" size="lg">
          Large
        </Badge>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="success" size="sm">
          Small
        </Badge>
        <Badge variant="success" size="default">
          Default
        </Badge>
        <Badge variant="success" size="lg">
          Large
        </Badge>
      </div>
    </div>
  ),
};

// Common use cases
export const UseCases: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      {/* Feature status */}
      <div>
        <h3 className="text-sm font-medium mb-2 text-foreground">Feature Status</h3>
        <div className="flex flex-wrap gap-2">
          <Badge variant="success">Stable</Badge>
          <Badge variant="warning">Beta</Badge>
          <Badge variant="info">Experimental</Badge>
          <Badge variant="error">Deprecated</Badge>
        </div>
      </div>

      {/* Priority levels */}
      <div>
        <h3 className="text-sm font-medium mb-2 text-foreground">Priority</h3>
        <div className="flex flex-wrap gap-2">
          <Badge variant="error">Critical</Badge>
          <Badge variant="warning">High</Badge>
          <Badge variant="info">Medium</Badge>
          <Badge variant="muted">Low</Badge>
        </div>
      </div>

      {/* Tags */}
      <div>
        <h3 className="text-sm font-medium mb-2 text-foreground">Tags</h3>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" size="sm">
            TypeScript
          </Badge>
          <Badge variant="outline" size="sm">
            React
          </Badge>
          <Badge variant="outline" size="sm">
            Tailwind
          </Badge>
          <Badge variant="outline" size="sm">
            Vite
          </Badge>
        </div>
      </div>

      {/* Counts */}
      <div>
        <h3 className="text-sm font-medium mb-2 text-foreground">Notifications</h3>
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex items-center gap-2 text-sm">
            Messages
            <Badge variant="brand" size="sm">
              12
            </Badge>
          </span>
          <span className="flex items-center gap-2 text-sm">
            Alerts
            <Badge variant="destructive" size="sm">
              3
            </Badge>
          </span>
          <span className="flex items-center gap-2 text-sm">
            Updates
            <Badge variant="secondary" size="sm">
              5
            </Badge>
          </span>
        </div>
      </div>
    </div>
  ),
};

// Interactive badges (clickable)
export const Interactive: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      <Badge
        variant="outline"
        className="cursor-pointer hover:bg-accent hover:text-accent-foreground transition-colors"
      >
        Clickable
      </Badge>
      <Badge variant="brand" className="cursor-pointer hover:opacity-90 transition-opacity">
        Interactive
      </Badge>
      <Badge variant="success" className="cursor-pointer hover:opacity-90 transition-opacity">
        Action
      </Badge>
    </div>
  ),
};
