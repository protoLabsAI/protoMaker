/**
 * LoadingState Component Stories
 *
 * Story pattern for Automaker UI components using CSF3 format:
 * - Default export defines component metadata
 * - Named exports define individual stories
 * - Each story showcases variants, sizes, and states
 */

import type { Meta, StoryObj } from '@storybook/react-vite';
import { LoadingState } from './loading-state';

const meta = {
  title: 'Molecules/LoadingState',
  component: LoadingState,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    message: {
      control: 'text',
      description: 'Optional message to display below the spinner',
    },
  },
} satisfies Meta<typeof LoadingState>;

export default meta;
type Story = StoryObj<typeof meta>;

// Default loading state (spinner only, no message)
export const Default: Story = {
  args: {},
};

// With a custom message
export const WithMessage: Story = {
  args: {
    message: 'Loading your data...',
  },
};

// Fetching data message
export const FetchingData: Story = {
  args: {
    message: 'Fetching data from the server...',
  },
};

// Processing message
export const Processing: Story = {
  args: {
    message: 'Processing your request...',
  },
};

// Inside a constrained container
export const InContainer: Story = {
  render: () => (
    <div className="w-80 h-48 border border-border rounded-lg overflow-hidden">
      <LoadingState message="Loading content..." />
    </div>
  ),
};
