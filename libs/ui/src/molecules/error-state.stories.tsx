/**
 * ErrorState Component Stories
 *
 * Story pattern for Automaker UI components using CSF3 format:
 * - Default export defines component metadata
 * - Named exports define individual stories
 * - Each story showcases variants, sizes, and states
 */

import type { Meta, StoryObj } from '@storybook/react-vite';
import { ErrorState } from './error-state';

const meta = {
  title: 'Molecules/ErrorState',
  component: ErrorState,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    error: {
      control: 'text',
      description: 'Error message to display',
    },
    title: {
      control: 'text',
      description: 'Title for the error state',
    },
    retryText: {
      control: 'text',
      description: 'Text for the retry button',
    },
  },
} satisfies Meta<typeof ErrorState>;

export default meta;
type Story = StoryObj<typeof meta>;

// Default error state (no retry)
export const Default: Story = {
  args: {
    error: 'An unexpected error occurred. Please try again later.',
  },
};

// With retry button
export const WithRetry: Story = {
  args: {
    error: 'Failed to load the data. Check your connection and try again.',
    onRetry: () => alert('Retrying...'),
  },
};

// Custom title
export const CustomTitle: Story = {
  args: {
    title: 'Connection Lost',
    error: 'Unable to connect to the server. Please check your internet connection.',
    onRetry: () => {},
    retryText: 'Reconnect',
  },
};

// Network error
export const NetworkError: Story = {
  args: {
    title: 'Network Error',
    error:
      'A network error occurred while fetching your data. Please check your internet connection and try again.',
    onRetry: () => {},
    retryText: 'Retry Connection',
  },
};

// Not found error
export const NotFound: Story = {
  args: {
    title: 'Resource Not Found',
    error: 'The requested resource could not be found. It may have been moved or deleted.',
  },
};
