/**
 * Spinner Component Stories
 *
 * Story pattern for Automaker UI components using CSF3 format:
 * - Default export defines component metadata
 * - Named exports define individual stories
 * - Each story showcases variants, sizes, and states
 */

import type { Meta, StoryObj } from '@storybook/react-vite';
import { Spinner } from './spinner';
import { Button } from './button';

const meta = {
  title: 'Atoms/Spinner',
  component: Spinner,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'select',
      options: ['xs', 'sm', 'md', 'lg', 'xl'],
      description: 'Size of the spinner',
    },
  },
} satisfies Meta<typeof Spinner>;

export default meta;
type Story = StoryObj<typeof meta>;

// Default spinner
export const Default: Story = {
  args: {
    size: 'md',
  },
};

// All sizes showcase
export const AllSizes: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <Spinner size="xs" />
      <Spinner size="sm" />
      <Spinner size="md" />
      <Spinner size="lg" />
      <Spinner size="xl" />
    </div>
  ),
};

// With labels
export const WithLabels: Story = {
  render: () => (
    <div className="flex items-center gap-8">
      <div className="flex flex-col items-center gap-2">
        <Spinner size="xs" />
        <span className="text-xs text-muted-foreground">Extra Small</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <Spinner size="sm" />
        <span className="text-xs text-muted-foreground">Small</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <Spinner size="md" />
        <span className="text-xs text-muted-foreground">Medium</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <Spinner size="lg" />
        <span className="text-xs text-muted-foreground">Large</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <Spinner size="xl" />
        <span className="text-xs text-muted-foreground">Extra Large</span>
      </div>
    </div>
  ),
};

// In button
export const InButton: Story = {
  render: () => (
    <div className="flex gap-3">
      <Button disabled>
        <Spinner size="sm" />
        Loading...
      </Button>
      <Button variant="outline" disabled>
        <Spinner size="sm" />
        Processing
      </Button>
      <Button variant="secondary" disabled>
        <Spinner size="sm" />
        Please wait
      </Button>
    </div>
  ),
};

// Loading states
export const LoadingStates: Story = {
  render: () => (
    <div className="flex flex-col gap-6 w-[350px]">
      <div className="flex items-center gap-3 p-4 border rounded-md">
        <Spinner size="sm" />
        <span className="text-sm">Loading data...</span>
      </div>
      <div className="flex items-center gap-3 p-4 border rounded-md">
        <Spinner size="sm" />
        <span className="text-sm">Saving changes...</span>
      </div>
      <div className="flex items-center gap-3 p-4 border rounded-md">
        <Spinner size="sm" />
        <span className="text-sm">Processing request...</span>
      </div>
    </div>
  ),
};

// Centered loading
export const CenteredLoading: Story = {
  render: () => (
    <div className="w-[400px] h-[300px] border rounded-lg flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Spinner size="lg" />
        <p className="text-sm text-muted-foreground">Loading content...</p>
      </div>
    </div>
  ),
};

// Card loading
export const CardLoading: Story = {
  render: () => (
    <div className="w-[350px] border rounded-lg p-6">
      <div className="flex flex-col items-center justify-center space-y-4 py-8">
        <Spinner size="lg" />
        <div className="text-center space-y-2">
          <h3 className="font-semibold">Loading your data</h3>
          <p className="text-sm text-muted-foreground">
            This should only take a few seconds...
          </p>
        </div>
      </div>
    </div>
  ),
};

// Inline loading
export const InlineLoading: Story = {
  render: () => (
    <div className="space-y-3">
      <p className="text-sm flex items-center gap-2">
        <Spinner size="xs" /> Fetching latest updates
      </p>
      <p className="text-sm flex items-center gap-2">
        <Spinner size="xs" /> Syncing with server
      </p>
      <p className="text-sm flex items-center gap-2">
        <Spinner size="xs" /> Uploading files
      </p>
    </div>
  ),
};

// Different contexts
export const DifferentContexts: Story = {
  render: () => (
    <div className="space-y-6">
      {/* Page loading */}
      <div className="w-[500px] h-[200px] border rounded-lg flex items-center justify-center bg-muted/20">
        <div className="flex flex-col items-center gap-3">
          <Spinner size="xl" />
          <p className="text-sm text-muted-foreground">Loading page...</p>
        </div>
      </div>

      {/* Section loading */}
      <div className="w-[500px] border rounded-lg p-6">
        <div className="flex items-center gap-3 mb-4">
          <Spinner size="sm" />
          <h3 className="font-semibold">Recent Activity</h3>
        </div>
        <div className="h-24 bg-muted/20 rounded" />
      </div>

      {/* Inline text loading */}
      <div className="w-[500px] border rounded-lg p-6">
        <p className="text-sm">
          Your request is being processed
          <Spinner size="xs" className="inline-block ml-2" />
        </p>
      </div>
    </div>
  ),
};

// Overlay loading
export const OverlayLoading: Story = {
  render: () => (
    <div className="relative w-[400px] h-[300px] border rounded-lg">
      <div className="p-6 space-y-4">
        <h3 className="font-semibold">Content Area</h3>
        <p className="text-sm text-muted-foreground">
          This is some content that would normally be visible.
        </p>
      </div>
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center rounded-lg">
        <div className="flex flex-col items-center gap-3">
          <Spinner size="lg" />
          <p className="text-sm text-muted-foreground">Processing...</p>
        </div>
      </div>
    </div>
  ),
};

// Custom color (via className)
export const CustomColor: Story = {
  render: () => (
    <div className="flex gap-6">
      <div className="flex flex-col items-center gap-2">
        <Spinner size="lg" className="text-blue-500" />
        <span className="text-xs">Blue</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <Spinner size="lg" className="text-green-500" />
        <span className="text-xs">Green</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <Spinner size="lg" className="text-red-500" />
        <span className="text-xs">Red</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <Spinner size="lg" className="text-purple-500" />
        <span className="text-xs">Purple</span>
      </div>
    </div>
  ),
};
