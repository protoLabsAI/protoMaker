/**
 * Popover Component Stories
 *
 * Story pattern for Automaker UI components using CSF3 format:
 * - Default export defines component metadata
 * - Named exports define individual stories
 * - Each story showcases variants, sizes, and states
 */

import type { Meta, StoryObj } from '@storybook/react-vite';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { Button } from './button';
import { Input } from './input';
import { Label } from './label';

const meta = {
  title: 'Atoms/Popover',
  component: Popover,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof Popover>;

export default meta;
type Story = StoryObj<typeof meta>;

// Default popover
export const Default: Story = {
  render: () => (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline">Open Popover</Button>
      </PopoverTrigger>
      <PopoverContent>
        <div className="space-y-2">
          <h4 className="font-medium leading-none">Dimensions</h4>
          <p className="text-sm text-muted-foreground">
            Set the dimensions for the layer.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  ),
};

// With form
export const WithForm: Story = {
  render: () => (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline">Edit Profile</Button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <div className="grid gap-4">
          <div className="space-y-2">
            <h4 className="font-medium leading-none">Profile Settings</h4>
            <p className="text-sm text-muted-foreground">
              Update your profile information.
            </p>
          </div>
          <div className="grid gap-2">
            <div className="grid grid-cols-3 items-center gap-4">
              <Label htmlFor="name">Name</Label>
              <Input id="name" defaultValue="John Doe" className="col-span-2 h-8" />
            </div>
            <div className="grid grid-cols-3 items-center gap-4">
              <Label htmlFor="username">Username</Label>
              <Input id="username" defaultValue="@johndoe" className="col-span-2 h-8" />
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  ),
};

// Different sides
export const DifferentSides: Story = {
  render: () => (
    <div className="flex gap-4 flex-wrap">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline">Top</Button>
        </PopoverTrigger>
        <PopoverContent side="top">
          <p className="text-sm">This popover opens to the top</p>
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline">Right</Button>
        </PopoverTrigger>
        <PopoverContent side="right">
          <p className="text-sm">This popover opens to the right</p>
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline">Bottom</Button>
        </PopoverTrigger>
        <PopoverContent side="bottom">
          <p className="text-sm">This popover opens to the bottom</p>
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline">Left</Button>
        </PopoverTrigger>
        <PopoverContent side="left">
          <p className="text-sm">This popover opens to the left</p>
        </PopoverContent>
      </Popover>
    </div>
  ),
};

// Different alignments
export const DifferentAlignments: Story = {
  render: () => (
    <div className="flex gap-4 flex-col items-center">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline">Start Aligned</Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80">
          <p className="text-sm">This popover is aligned to the start</p>
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline">Center Aligned</Button>
        </PopoverTrigger>
        <PopoverContent align="center" className="w-80">
          <p className="text-sm">This popover is centered</p>
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline">End Aligned</Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80">
          <p className="text-sm">This popover is aligned to the end</p>
        </PopoverContent>
      </Popover>
    </div>
  ),
};

// With actions
export const WithActions: Story = {
  render: () => (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline">Settings</Button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <div className="grid gap-4">
          <div className="space-y-2">
            <h4 className="font-medium leading-none">Quick Settings</h4>
            <p className="text-sm text-muted-foreground">
              Adjust your preferences quickly.
            </p>
          </div>
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="notifications">Notifications</Label>
              <input type="checkbox" id="notifications" defaultChecked />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="auto-save">Auto-save</Label>
              <input type="checkbox" id="auto-save" defaultChecked />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="flex-1">
              Apply
            </Button>
            <Button size="sm" variant="outline" className="flex-1">
              Cancel
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  ),
};

// Rich content
export const RichContent: Story = {
  render: () => (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline">View Details</Button>
      </PopoverTrigger>
      <PopoverContent className="w-96">
        <div className="space-y-4">
          <div>
            <h4 className="font-semibold text-base mb-1">Component Details</h4>
            <p className="text-sm text-muted-foreground">
              A popover is a floating panel that appears when triggered.
            </p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Status</span>
              <span className="font-medium">Active</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Version</span>
              <span className="font-medium">1.0.0</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Last Updated</span>
              <span className="font-medium">2 hours ago</span>
            </div>
          </div>
          <div className="pt-2 border-t">
            <Button size="sm" className="w-full">
              Learn More
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  ),
};

// Compact popover
export const Compact: Story = {
  render: () => (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline">
          Info
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56">
        <p className="text-xs text-muted-foreground">
          This is a compact popover with minimal content.
        </p>
      </PopoverContent>
    </Popover>
  ),
};

// With custom width
export const CustomWidth: Story = {
  render: () => (
    <div className="flex gap-4">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline">Narrow</Button>
        </PopoverTrigger>
        <PopoverContent className="w-48">
          <p className="text-sm">Narrow popover content</p>
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline">Wide</Button>
        </PopoverTrigger>
        <PopoverContent className="w-96">
          <p className="text-sm">
            This is a wider popover with more content space available for detailed
            information.
          </p>
        </PopoverContent>
      </Popover>
    </div>
  ),
};
