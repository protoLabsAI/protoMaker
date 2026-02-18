/**
 * Skeleton Component Stories
 *
 * Story pattern for Automaker UI components using CSF3 format:
 * - Default export defines component metadata
 * - Named exports define individual stories
 * - Each story showcases variants, sizes, and states
 */

import type { Meta, StoryObj } from '@storybook/react-vite';
import { SkeletonPulse } from './skeleton';

const meta = {
  title: 'Atoms/Skeleton',
  component: SkeletonPulse,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof SkeletonPulse>;

export default meta;
type Story = StoryObj<typeof meta>;

// Default skeleton
export const Default: Story = {
  render: () => <SkeletonPulse className="h-12 w-12" />,
};

// Various shapes and sizes
export const Shapes: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">Rectangles</p>
        <div className="flex gap-2">
          <SkeletonPulse className="h-8 w-20" />
          <SkeletonPulse className="h-8 w-32" />
          <SkeletonPulse className="h-8 w-40" />
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">Squares</p>
        <div className="flex gap-2">
          <SkeletonPulse className="h-12 w-12" />
          <SkeletonPulse className="h-16 w-16" />
          <SkeletonPulse className="h-20 w-20" />
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">Circles</p>
        <div className="flex gap-2">
          <SkeletonPulse className="h-12 w-12 rounded-full" />
          <SkeletonPulse className="h-16 w-16 rounded-full" />
          <SkeletonPulse className="h-20 w-20 rounded-full" />
        </div>
      </div>
    </div>
  ),
};

// Text lines
export const TextLines: Story = {
  render: () => (
    <div className="space-y-2 w-[400px]">
      <SkeletonPulse className="h-4 w-full" />
      <SkeletonPulse className="h-4 w-full" />
      <SkeletonPulse className="h-4 w-3/4" />
    </div>
  ),
};

// Card loading
export const CardLoading: Story = {
  render: () => (
    <div className="w-[350px] space-y-4 p-4 border rounded-lg">
      <SkeletonPulse className="h-[200px] w-full" />
      <div className="space-y-2">
        <SkeletonPulse className="h-4 w-3/4" />
        <SkeletonPulse className="h-4 w-full" />
        <SkeletonPulse className="h-4 w-full" />
        <SkeletonPulse className="h-4 w-2/3" />
      </div>
      <div className="flex gap-2">
        <SkeletonPulse className="h-9 w-20" />
        <SkeletonPulse className="h-9 w-20" />
      </div>
    </div>
  ),
};

// Profile loading
export const ProfileLoading: Story = {
  render: () => (
    <div className="flex items-center space-x-4">
      <SkeletonPulse className="h-16 w-16 rounded-full" />
      <div className="space-y-2 flex-1">
        <SkeletonPulse className="h-4 w-[200px]" />
        <SkeletonPulse className="h-4 w-[160px]" />
      </div>
    </div>
  ),
};

// List loading
export const ListLoading: Story = {
  render: () => (
    <div className="w-[400px] space-y-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center space-x-4">
          <SkeletonPulse className="h-12 w-12 rounded" />
          <div className="space-y-2 flex-1">
            <SkeletonPulse className="h-4 w-full" />
            <SkeletonPulse className="h-3 w-3/4" />
          </div>
        </div>
      ))}
    </div>
  ),
};

// Table loading
export const TableLoading: Story = {
  render: () => (
    <div className="w-[500px] space-y-2">
      <div className="flex gap-4">
        <SkeletonPulse className="h-10 w-full" />
        <SkeletonPulse className="h-10 w-full" />
        <SkeletonPulse className="h-10 w-full" />
      </div>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex gap-4">
          <SkeletonPulse className="h-8 w-full" />
          <SkeletonPulse className="h-8 w-full" />
          <SkeletonPulse className="h-8 w-full" />
        </div>
      ))}
    </div>
  ),
};

// Form loading
export const FormLoading: Story = {
  render: () => (
    <div className="w-[400px] space-y-4">
      <div className="space-y-2">
        <SkeletonPulse className="h-4 w-20" />
        <SkeletonPulse className="h-10 w-full" />
      </div>
      <div className="space-y-2">
        <SkeletonPulse className="h-4 w-24" />
        <SkeletonPulse className="h-10 w-full" />
      </div>
      <div className="space-y-2">
        <SkeletonPulse className="h-4 w-28" />
        <SkeletonPulse className="h-24 w-full" />
      </div>
      <SkeletonPulse className="h-10 w-32" />
    </div>
  ),
};

// Dashboard loading
export const DashboardLoading: Story = {
  render: () => (
    <div className="w-[600px] space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <SkeletonPulse className="h-20 w-full rounded-lg" />
        </div>
        <div className="space-y-2">
          <SkeletonPulse className="h-20 w-full rounded-lg" />
        </div>
        <div className="space-y-2">
          <SkeletonPulse className="h-20 w-full rounded-lg" />
        </div>
      </div>
      <SkeletonPulse className="h-[300px] w-full rounded-lg" />
      <div className="grid grid-cols-2 gap-4">
        <SkeletonPulse className="h-[200px] w-full rounded-lg" />
        <SkeletonPulse className="h-[200px] w-full rounded-lg" />
      </div>
    </div>
  ),
};

// Article loading
export const ArticleLoading: Story = {
  render: () => (
    <div className="w-[500px] space-y-4">
      <SkeletonPulse className="h-8 w-3/4" />
      <SkeletonPulse className="h-4 w-1/4" />
      <SkeletonPulse className="h-[250px] w-full" />
      <div className="space-y-2">
        <SkeletonPulse className="h-4 w-full" />
        <SkeletonPulse className="h-4 w-full" />
        <SkeletonPulse className="h-4 w-full" />
        <SkeletonPulse className="h-4 w-5/6" />
      </div>
      <div className="space-y-2">
        <SkeletonPulse className="h-4 w-full" />
        <SkeletonPulse className="h-4 w-full" />
        <SkeletonPulse className="h-4 w-2/3" />
      </div>
    </div>
  ),
};

// Comment loading
export const CommentLoading: Story = {
  render: () => (
    <div className="w-[450px] space-y-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex gap-3">
          <SkeletonPulse className="h-10 w-10 rounded-full shrink-0" />
          <div className="space-y-2 flex-1">
            <SkeletonPulse className="h-4 w-24" />
            <SkeletonPulse className="h-4 w-full" />
            <SkeletonPulse className="h-4 w-full" />
            <SkeletonPulse className="h-4 w-3/4" />
          </div>
        </div>
      ))}
    </div>
  ),
};
